import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = time => '2025-06-02T' + time + 'Z'
const originalPrices = await readFile(new URL(
  '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv', import.meta.url,
), 'utf8')

async function openRelativeReturns(page, filename, prices) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const screen = page.getByRole('region', { name: 'Universe screen' })
  await screen.getByLabel('Universe prices CSV').setInputFiles({
    name: filename, mimeType: 'text/csv', buffer: Buffer.from(prices),
  })
  await screen.getByRole('button', { name: 'Load prices', exact: true }).click()
  await screen.getByText('Relative returns', { exact: true }).click()
  return screen.getByRole('region', { name: 'Relative returns', exact: true })
}

async function query(page, effective, known) {
  await page.getByLabel('Effective time (UTC)').fill(utc(effective))
  await page.getByLabel('Known time (UTC)').fill(utc(known))
  await page.getByRole('button', { name: 'Run as-of query' }).click()
}

async function compare(compareView, baseline) {
  await compareView.getByLabel('Left listing').selectOption('ALFA-001')
  await compareView.getByLabel('Right listing').selectOption('BETA-001')
  await compareView.getByLabel('Comparison baseline (UTC)').fill(utc(baseline))
  await compareView.getByRole('button', { name: 'Compare returns' }).click()
}

async function download(page, compareView) {
  const pending = page.waitForEvent('download')
  await compareView.getByRole('button', { name: 'Download relative returns' }).click()
  const saved = await pending
  expect(saved.suggestedFilename()).toBe('relative-returns.csv')
  return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
}

test('aligned returns replay exact missing quotes, revisions and removals offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)

  const prices = originalPrices + [
    'DEMO-BASKET,ALFA-001,2025-06-02T14:12:00Z,2025-06-02T14:12:00Z,105',
    'DEMO-BASKET,BETA-001,2025-06-02T14:12:00Z,2025-06-02T14:13:00Z,57',
    'DEMO-BASKET,BETA-001,2025-06-02T14:11:00Z,2025-06-02T14:16:00Z,52',
  ].join('\n')
  const view = await openRelativeReturns(page, '=closes.csv', prices)
  await expect(view.getByLabel('Right listing').locator('option[value="BETA-001"]')).toHaveCount(0)
  await query(page, '14:12:00', '14:12:00')
  await compare(view, '14:10:00')
  const table = view.getByRole('table', { name: 'Aligned relative returns' })
  const target = time => table.locator('tbody tr').filter({
    has: page.getByRole('rowheader', { name: utc(time), exact: true }),
  })
  await expect(view.getByRole('img', { name: /Observed returns over UTC time/ })).toBeVisible()
  await expect(target('14:12:00').getByRole('cell').allTextContents()).resolves.toEqual([
    'Member', '105Known ' + utc('14:12:00'), '2.9412%', 'Member', 'Missing', '—', '—',
  ])

  await query(page, '14:12:00', '14:13:00')
  const observed = await download(page, view)
  expect(observed).toHaveLength(3)
  expect(observed[0]).toBe('left_listing_id,right_listing_id,baseline_utc,through_utc,known_utc,membership_source,price_source,point_utc,left_membership,left_close,left_close_observed_utc,left_return_pct,right_membership,right_close,right_close_observed_utc,right_return_pct,spread_pp')
  expect(observed[2]).toBe(
    '"ALFA-001","BETA-001","2025-06-02T14:10:00Z","2025-06-02T14:12:00Z","2025-06-02T14:13:00Z","Synthetic membership reports","\'=closes.csv",2025-06-02T14:12:00Z,member,105,2025-06-02T14:12:00Z,2.9412,member,57,2025-06-02T14:13:00Z,1.7857,1.1555',
  )
  await expect(target('14:11:00')).toHaveCount(0)

  await query(page, '14:12:00', '14:16:00')
  await expect(target('14:11:00')).toContainText('Missing')
  await expect(target('14:12:00').getByRole('cell').last()).toHaveText('-9.9301')
  await query(page, '14:20:00', '14:24:59')
  await expect(target('14:20:00').getByRole('cell').last()).toHaveText('-4.9699')
  await query(page, '14:20:00', '14:25:00')
  await expect(target('14:20:00').getByRole('cell').first()).toHaveText('Removed')
  await expect(target('14:20:00').getByRole('cell').last()).toHaveText('—')
  await query(page, '14:35:00', '14:35:00')
  await expect(target('14:35:00').getByRole('cell').nth(3)).toHaveText('Delisted')

  await query(page, '14:12:00', '14:13:00')
  expect(await download(page, view)).toEqual(observed)
  await view.getByLabel('Right listing').selectOption('ALFA-001')
  await view.getByRole('button', { name: 'Compare returns' }).click()
  await expect(view.getByRole('alert')).toContainText('distinct listing IDs')
  expect(await download(page, view)).toEqual(observed)

  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})

test('the relative returns table pages observations and exports the full window', async ({ page }) => {
  await page.goto('/')
  const prices = originalPrices + Array.from({ length: 59 }, (_, index) => {
    const timestamp = utc('14:10:' + String(index + 1).padStart(2, '0'))
    return 'DEMO-BASKET,ALFA-001,' + timestamp + ',' + timestamp + ',103'
  }).join('\n')
  const view = await openRelativeReturns(page, 'many-prices.csv', prices)
  await query(page, '14:11:00', '14:12:00')
  await compare(view, '14:10:00')
  const table = view.getByRole('table', { name: 'Aligned relative returns' })
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(50)
  await view.getByRole('button', { name: 'Next points' }).click()
  await expect(rows).toHaveCount(11)
  await expect(rows.first()).toContainText(utc('14:10:50'))
  await expect(rows.last()).toContainText(utc('14:11:00'))
  expect(await download(page, view)).toHaveLength(62)
  await view.getByRole('button', { name: 'Previous points' }).click()
  await expect(rows.first()).toContainText(utc('14:10:00'))
})
