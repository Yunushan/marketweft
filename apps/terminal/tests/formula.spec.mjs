import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures.mjs'
import { catalogContents, microCSV, openImport, submitImport } from './catalog-fixtures.mjs'

const fixture = fileURLToPath(new URL('../../../crates/core/tests/fixtures/synthetic-formula-bars.csv', import.meta.url))

test('formula evaluation checks automated-use permission and UTC expiry on the selected history', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  const openFormula = page.getByRole('button', { name: 'Time-series formulas', exact: true })
  const evaluate = page.getByRole('button', { name: 'Evaluate formula' })
  const results = page.getByRole('region', { name: 'Formula results' })
  const sources = [
    { symbol: 'RESTRICTED', status: 'restricted' },
    { symbol: 'UNCONFIRMED', status: 'unconfirmed' },
    { symbol: 'GRANTED', status: 'granted' },
  ]
  for (const { symbol, status } of sources) {
    await openImport(page, symbol, microCSV)
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Series details', { exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
    await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption(status)
    if (status === 'granted') await dialog.getByLabel('Grant expiration in UTC').fill('2099-12-31')
    await submitImport(page, symbol)
    await openFormula.click()
    await page.getByRole('textbox', { name: 'Formula', exact: true }).fill('close')
    await evaluate.click()
    if (status !== 'granted') {
      await expect(page.getByRole('alert')).toHaveText('Formula evaluation requires granted automated-use permission.')
      await expect(results).toHaveCount(0)
      await page.getByRole('button', { name: 'Return to workspace' }).click()
    }
  }
  await expect(results.getByRole('table').locator('tbody tr').last()).toContainText('1.000001')
  const saved = await catalogContents(page)
  await page.clock.setFixedTime(new Date('2100-01-01T00:00:00.000Z'))
  await evaluate.click()
  await expect(page.getByRole('alert')).toHaveText('Formula evaluation is unavailable because the source grant has expired.')
  await expect(results).toHaveCount(0)
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline formulas evaluate observed prefixes and retain exact missing values in the export', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  await page.getByLabel('Venue', { exact: true }).fill('DEMO')
  await page.getByLabel('Symbol', { exact: true }).fill('FORMULA')
  await page.locator('input[type=file]').setInputFiles(fixture)
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(page.getByRole('heading', { name: 'FORMULA', exact: true })).toBeVisible()
  const saved = await catalogContents(page)
  const open = page.getByRole('button', { name: 'Time-series formulas', exact: true })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Time-series formulas' })).toBeFocused()
  const formula = page.getByRole('textbox', { name: 'Formula', exact: true })
  await formula.fill('ema(if(close == 11, close / 0, close), 2)')
  const cutoff = page.getByLabel('Formula observed through (UTC)')
  const evaluate = page.getByRole('button', { name: 'Evaluate formula' })
  const panel = page.getByRole('region', { name: 'Formula results' })
  const rows = panel.getByRole('table', { name: 'Formula values' }).locator('tbody tr')
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download formula values' }).click()
    const csv = await pending
    expect(csv.suggestedFilename()).toBe('time-series-formula.csv')
    return readFile(await csv.path(), 'utf8')
  }
  await cutoff.fill('2025-04-03T14:04:00Z')
  await evaluate.click()
  await expect(panel.getByRole('status')).toHaveText('2 values · 3 unavailable · Language v1')
  await expect(rows.last()).toContainText('14.5')
  const early = await download()
  await cutoff.fill('2025-04-03T14:05:00Z')
  await evaluate.click()
  await expect(rows.last()).toContainText('16.833333')
  expect(await download()).toContain('1,2025-04-03T14:02:00Z,\r\n')
  await cutoff.fill('2025-04-03T14:04:00Z')
  await evaluate.click()
  expect(await download()).toEqual(early)
  await formula.fill('lag(close, -1)')
  await evaluate.click()
  await expect(page.getByRole('alert')).toContainText('literal window or lag')
  expect(await download()).toEqual(early)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
  await expect.poll(() => catalogContents(page)).toEqual(saved)
})
