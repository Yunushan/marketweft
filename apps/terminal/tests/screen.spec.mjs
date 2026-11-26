import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = (time) => '2025-06-02T' + time + 'Z'

async function openDemo(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  return page.getByRole('region', { name: 'Universe screen' })
}

test('screen ranks offline across additions, late prices, corrections and removals', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const screen = await openDemo(page)
  await screen.getByRole('button', { name: 'Load demo prices' }).click()
  const table = screen.getByRole('table', { name: 'Universe price rankings' })
  const results = () => table.locator('tbody tr').evaluateAll((rows) =>
    rows.map(row => [0, 1, 3].map(index => row.cells[index].textContent)),
  )
  const next = page.getByRole('button', { name: 'Next cutoff' })
  await next.click()
  expect(await results()).toEqual([['1', 'ALFA-001', '1%']])
  await next.click()
  expect(await results()).toEqual([['1', 'ALFA-001', '2%'], ['Unranked', 'BETA-001', '—']])
  const beta = table.getByRole('row', { name: /BETA-001/ })
  await expect(beta.getByRole('cell').last()).toHaveText('Missing')
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await query('14:10:00', '14:12:00')
  expect(await results()).toEqual([['1', 'BETA-001', '12%'], ['2', 'ALFA-001', '2%']])
  await expect(beta).toContainText('Known ' + utc('14:12:00'))
  await query('14:10:00', '14:16:00')
  expect(await results()).toEqual([['1', 'ALFA-001', '2%'], ['2', 'BETA-001', '1%']])
  await query('14:20:00', '14:24:59')
  expect(await results()).toEqual([['1', 'BETA-001', '8%'], ['2', 'ALFA-001', '4%']])
  await query('14:20:00', '14:25:00')
  expect(await results()).toEqual([['1', 'BETA-001', '8%']])
  await query('14:35:00', '14:35:00')
  await expect(screen.getByText('No members at these cutoffs.')).toBeVisible()
  await query('14:45:00', '14:45:00')
  expect(await results()).toEqual([['Unranked', 'BETA-002', '—']])
  await expect(table.getByRole('row', { name: /BETA-002/ })).toContainText('Missing')
  await query('14:10:00', '14:11:59')
  expect(await results()).toEqual([['1', 'ALFA-001', '2%'], ['Unranked', 'BETA-001', '—']])
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
})

test('uploaded prices validate before replacement and a custom baseline does not change the catalog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const original = await catalogContents(page)
  const screen = await openDemo(page)
  const prices = await readFile(new URL(
    '../../../crates/core/tests/fixtures/synthetic-universe-prices.csv', import.meta.url,
  ), 'utf8')
  const upload = async (content) => {
    await screen.getByLabel('Universe prices CSV').setInputFiles({
      name: 'closes.csv', mimeType: 'text/csv', buffer: Buffer.from(content),
    })
    await screen.getByRole('button', { name: 'Load prices', exact: true }).click()
  }
  await upload(prices)
  await expect(screen.getByText(/closes.csv/)).toBeVisible()
  await page.getByRole('button', { name: 'Next cutoff' }).click()
  await screen.getByLabel('Baseline time (UTC)').fill(utc('14:05:00'))
  await screen.getByRole('button', { name: 'Set baseline' }).click()
  const alfa = screen.getByRole('row', { name: /ALFA-001/ })
  await expect(alfa.getByRole('cell').nth(2)).toHaveText('0%')
  await screen.getByLabel('Baseline time (UTC)').fill(utc('14:10:00'))
  await screen.getByRole('button', { name: 'Set baseline' }).click()
  await expect(screen.getByRole('alert')).toContainText('Baseline time must be at or before')
  await expect(alfa.getByRole('cell').nth(2)).toHaveText('0%')
  await upload(prices.replace('DEMO-BASKET', 'WRONG'))
  await expect(screen.getByRole('alert')).toContainText('universe IDs must match')
  await expect(alfa.getByRole('cell').nth(2)).toHaveText('0%')
  await page.getByRole('button', { name: 'Previous cutoff' }).click()
  await expect(screen.getByRole('alert')).toContainText('Baseline time must be at or before')
  await expect(screen.getByRole('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})
