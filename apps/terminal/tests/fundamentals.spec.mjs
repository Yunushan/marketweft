import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = t => '2025-04-03T' + t + 'Z'

async function open(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open financial statements' }).click()
  await expect(page.getByRole('heading', { name: 'Financial statements', exact: true })).toBeFocused()
}

test('financial replay gates filings and capitalization independently while offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start financial demo' }).click()
  const result = page.getByRole('region', { name: 'Valuation results' })
  const field = (label, value) => expect(result.getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd')).toHaveText(value)
  await field('Source filing', 'ALFA-FY24')
  await field('Price / earnings', 'Capitalization missing at valuation time')
  await page.getByRole('button', { name: 'Original filing' }).click()
  await field('Capitalization', 'USD 12,000,000,000')
  await field('Price / earnings', '10×')
  await field('Price / sales', '2×')
  await field('Price / book', '4×')
  const known = page.getByLabel('Known time (UTC)')
  const at = page.getByLabel('Valuation time (UTC)')
  const run = page.getByRole('button', { name: 'Run valuation query' })
  await known.fill(utc('14:19:59'))
  await run.click()
  await field('Source filing', 'ALFA-FY24')
  await page.getByRole('button', { name: 'Restatement observed' }).click()
  await field('Source filing', 'ALFA-FY24-A1')
  await field('Common equity', 'Missing')
  await field('Operating cash flow', 'USD -250,000,000')
  await field('Price / earnings', '15×')
  await field('Price / sales', '1.5×')
  await field('Price / book', 'Denominator missing from filing')
  await known.fill(utc('14:25:00'))
  await run.click()
  await field('Source filing', 'ALFA-FY24-A1')
  await page.getByRole('button', { name: 'Revised capitalization' }).click()
  await field('Capitalization', 'USD 16,000,000,000')
  await field('Price / earnings', '20×')
  await at.fill(utc('14:30:00'))
  await run.click()
  await field('Price / earnings', 'Currencies differ')
  await page.getByLabel('Issuer').selectOption('DEMO-BETA')
  await run.click()
  await field('Source filing', 'BETA-FY24')
  await field('Price / earnings', 'Denominator is zero or negative')
  await field('Price / book', '4×')
  await page.getByRole('button', { name: 'Original filing' }).click()
  await field('Price / earnings', '10×')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await expect(page.getByRole('button', { name: 'Open financial statements' })).toBeFocused()
})

test('filing-only import validates dates and keeps the workspace catalog intact', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const catalog = await catalogContents(page)
  await open(page)
  const filings = await readFile(new URL(
    '../../../crates/core/tests/fixtures/synthetic-financial-filings.csv', import.meta.url,
  ), 'utf8')
  const load = async content => {
    await page.getByLabel('Annual filings CSV').setInputFiles({
      name: 'filings.csv', mimeType: 'text/csv', buffer: Buffer.from(content),
    })
    await page.getByRole('button', { name: 'Load financial reports' }).click()
  }
  await load(filings.replace('2023-12-31', '2023-02-31'))
  await expect(page.getByRole('alert')).toContainText('fiscal end')
  await load(filings)
  const result = page.getByRole('region', { name: 'Valuation results' })
  await expect(result.getByText('ALFA-FY24-A1', { exact: true })).toBeVisible()
  await expect(result.getByText('No known capitalization at the exact valuation time.')).toBeVisible()
  await page.getByLabel('Known time (UTC)').fill('2025-04-31T14:25:00Z')
  await page.getByRole('button', { name: 'Run valuation query' }).click()
  await expect(page.getByRole('alert')).toContainText('UTC timestamps')
  await expect(result.getByText('ALFA-FY24-A1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(catalog)
})
