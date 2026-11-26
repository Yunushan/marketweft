import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const fixture = name => fileURLToPath(new URL('../../../crates/core/tests/fixtures/synthetic-formula-' + name, import.meta.url))

test('offline formula libraries are scoped, rewindable and exported with exact source evidence', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  await page.getByLabel('Venue', { exact: true }).fill('DEMO')
  await page.getByLabel('Symbol', { exact: true }).fill('FORMULA')
  await page.locator('input[type=file]').setInputFiles(fixture('bars.csv'))
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(page.getByRole('heading', { name: 'FORMULA', exact: true })).toBeVisible()
  const saved = await catalogContents(page)
  await page.getByRole('button', { name: 'Time-series formulas', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Formula inputs' })
  await panel.getByText('Custom formula functions', { exact: true }).click()
  const file = panel.getByLabel('Formula function library')
  const load = panel.getByRole('button', { name: 'Load function library' })
  const evaluate = panel.getByRole('button', { name: 'Evaluate formula' })
  const result = page.getByRole('region', { name: 'Formula results' })
  const cutoff = panel.getByLabel('Formula observed through (UTC)')
  const lastRow = result.getByRole('table', { name: 'Formula values' }).locator('tbody tr').last()
  const download = async (button, name) => {
    const pending = page.waitForEvent('download')
    await result.getByRole('button', { name: button }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe(name)
    return readFile(await saved.path())
  }
  const path = fixture('library.mwformula.json')
  const bytes = await readFile(path)
  const basename = 'synthetic-formula-library.mwformula.json'
  const sha = createHash('sha256').update(bytes).digest('hex')
  await file.setInputFiles(path)
  await load.click()
  await expect(panel.getByText('gap(value), smooth(value)', { exact: false })).toBeVisible()
  await panel.getByRole('textbox', { name: 'Formula', exact: true }).fill('smooth(close)')
  await cutoff.fill('2025-04-03T14:04:00Z')
  await evaluate.click()
  await expect(lastRow).toContainText('14.5')
  const first = await download('Download formula values', 'time-series-formula.csv')
  expect(first.toString()).toContain('14.5,"' + basename + '",' + sha)
  expect(await download('Download evaluated function library', basename)).toEqual(bytes)
  await cutoff.fill('2025-04-03T14:05:00Z')
  await evaluate.click()
  await expect(lastRow).toContainText('16.833333')
  const bad = JSON.parse(bytes.toString())
  bad.functions[0].body = 'value + high'
  await file.setInputFiles({ name: 'ambient.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
  await load.click()
  await expect(panel.getByRole('alert')).toContainText('explicit parameter')
  await cutoff.fill('2025-04-03T14:04:00Z')
  await evaluate.click()
  expect(await download('Download formula values', 'time-series-formula.csv')).toEqual(first)
  await panel.getByRole('button', { name: 'Clear function library' }).click()
  await evaluate.click()
  await expect(panel.getByRole('alert')).toContainText('Unknown formula field or function')
  expect(await download('Download formula values', 'time-series-formula.csv')).toEqual(first)
  await expect.poll(() => catalogContents(page)).toEqual(saved)
})
