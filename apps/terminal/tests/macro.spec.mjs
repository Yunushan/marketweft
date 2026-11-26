import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = t => '2025-04-03T' + t + 'Z'

async function open(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open economic calendar' }).click()
  await expect(page.getByRole('heading', { name: 'Economic calendar', exact: true })).toBeFocused()
}

test('economic calendar stays offline and exposes actuals only at both release cutoffs', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start calendar demo' }).click()
  const release = page.getByRole('article', { name: 'DEMO.CPI' })
  const field = (label, value) => expect(release.getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd')).toHaveText(value)
  await field('Scheduled UTC', utc('14:10:00'))
  await page.getByRole('button', { name: 'Before release' }).click()
  await field('Scheduled UTC', utc('14:30:00'))
  await field('Forecast', '2.5 percent')
  await field('Actual', 'Awaiting actual')
  const query = async (published, known) => {
    await page.getByLabel('Published through (UTC)').fill(utc(published))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run calendar query' }).click()
  }
  await query('14:29:59', '14:32:00')
  await field('Actual', 'Awaiting actual')
  await query('14:30:00', '14:31:59')
  await field('Actual', 'Awaiting actual')
  await page.getByRole('button', { name: 'Actual observed' }).click()
  await field('Actual', '2.7 percent')
  await query('14:40:00', '14:45:00')
  await field('Actual', '2.6 percent')
  await field('Forecast', '2.5 percent')
  await page.getByRole('button', { name: 'Revised actual' }).click()
  await field('Actual', '2.8 percent')
  await release.getByText('Release evidence', { exact: true }).click()
  const table = release.getByRole('table', { name: 'DEMO.CPI actual and revisions' })
  await expect(table.getByRole('rowheader')).toHaveText(['CPI-A0', 'CPI-A1', 'CPI-A2'])
  await expect(table.getByRole('row', { name: /^CPI-A2/ }).getByRole('cell').last()).toHaveText('CPI-A1')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Before release' }).click()
  await field('Actual', 'Awaiting actual')
  await expect(table).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await expect(page.getByRole('button', { name: 'Open economic calendar' })).toBeFocused()
})

test('macro import rejects broken revision lineage and leaves the stored workspace intact', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const original = await catalogContents(page)
  await open(page)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-macro-calendar.csv', import.meta.url), 'utf8')
  const load = async content => {
    await page.getByLabel('Macro calendar CSV').setInputFiles({
      name: 'calendar.csv', mimeType: 'text/csv', buffer: Buffer.from(content),
    })
    await page.getByRole('button', { name: 'Load macro calendar' }).click()
  }
  await load(csv.replace('2.8,CPI-A1', '2.8,CPI-A0'))
  await expect(page.getByRole('alert')).toContainText('linear revision chain')
  await load(csv)
  await expect(page.getByText('calendar.csv', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'DEMO.CPI' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})
