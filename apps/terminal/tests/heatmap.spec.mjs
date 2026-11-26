import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = (t) => '2025-06-02T' + t + 'Z'

async function start(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  await page.getByRole('button', { name: 'Load demo prices' }).click()
  return page.getByRole('region', { name: 'Sector heatmap' })
}

test('offline heatmap reconciles ranked constituents, partial coverage and revised sectors', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const map = await start(page)
  await map.getByRole('button', { name: 'Load demo sectors' }).click()
  const screen = page.getByRole('table', { name: 'Universe price rankings' })
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
    const ids = await screen.getByRole('rowheader').allTextContents()
    const tiles = await map.getByRole('listitem').allTextContents()
    expect(tiles).toHaveLength(ids.length)
    for (const id of ids) expect(tiles.filter(text => text.includes(id))).toHaveLength(1)
  }
  const technology = map.getByRole('region', { name: 'Technology' })
  const financials = map.getByRole('region', { name: 'Financials' })
  const status = map.getByRole('status')
  await query('14:10:00', '14:10:00')
  await expect(status).toContainText('Known weight 100%')
  await expect(status).toContainText('Covered weight 60%')
  await expect(status).toContainText('Observed contribution 1.2%')
  await expect(technology).toContainText('Weighted return 2%')
  await expect(financials.getByRole('listitem')).toHaveAttribute('data-return', 'missing')
  await query('14:10:00', '14:12:00')
  await expect(status).toContainText('Covered weight 100%')
  await expect(status).toContainText('Observed contribution 6%')
  await expect(financials).toContainText('Weighted return 12%')
  await query('14:10:00', '14:16:00')
  await expect(financials).toHaveCount(0)
  await expect(technology).toContainText('Weighted return 1.6%')
  const beta = technology.getByRole('listitem').filter({ hasText: 'BETA-001' })
  await beta.locator('summary').click()
  await expect(beta).toContainText('Screen rank2')
  await expect(beta).toContainText('Classification known' + utc('14:16:00'))
  await query('14:20:00', '14:25:00')
  await expect(map.getByRole('listitem')).toHaveCount(1)
  await query('14:35:00', '14:35:00')
  await expect(map.getByText('No members at these cutoffs.')).toBeVisible()
  await query('14:45:00', '14:45:00')
  await expect(map.getByRole('region', { name: 'Unclassified' })).toContainText('BETA-002')
  await expect(status).toContainText('Listings missing weight 1')
  await query('14:50:00', '14:50:00')
  await expect(map.getByRole('region', { name: 'Industrials' })).toContainText('ALFA-001')
  await expect(financials).toContainText('BETA-002')
  await expect(status).toContainText('Known weight 60%')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await query('14:10:00', '14:10:00')
  await expect(status).toContainText('Covered weight 60%')
})

test('sector CSV rejects foreign membership and leaves the current heatmap and catalog intact', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const catalog = await catalogContents(page)
  const map = await start(page)
  const metadata = await readFile(new URL(
    '../../../crates/core/tests/fixtures/synthetic-universe-sectors.csv', import.meta.url,
  ), 'utf8')
  const load = async (content) => {
    await map.getByLabel('Sector and weight CSV').setInputFiles({
      name: 'sectors.csv', mimeType: 'text/csv', buffer: Buffer.from(content),
    })
    await map.getByRole('button', { name: 'Load sectors', exact: true }).click()
  }
  await load(metadata)
  await expect(map.getByText('sectors.csv', { exact: true })).toBeVisible()
  await load(metadata.replace('DEMO-BASKET', 'OTHER'))
  await expect(map.getByRole('alert')).toContainText('IDs must match')
  await expect(map.getByRole('region', { name: 'Technology' })).toContainText('ALFA-001')
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(catalog)
})
