import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents, openImport, submitImport } from './catalog-fixtures.mjs'

const fixture = new URL('../../../crates/core/tests/fixtures/synthetic-monthly-returns.csv', import.meta.url)

async function importHistory(page, symbol, automated, redistribution) {
  await openImport(page, symbol, await readFile(fixture, 'utf8'))
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption(automated)
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption(redistribution)
  await submitImport(page, symbol)
}

test('monthly returns calendar rewinds offline and preserves exact closes and gaps in CSV', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await importHistory(page, 'MONTHS', 'granted', 'granted')
  const saved = await catalogContents(page)
  const open = page.getByRole('button', { name: 'Monthly returns calendar' })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Monthly returns calendar' })).toBeFocused()
  const cutoff = page.getByLabel('Observed through (UTC)', { exact: true })
  const calculate = page.getByRole('button', { name: 'Calculate monthly returns' })
  const table = page.getByRole('table', { name: 'Monthly returns by UTC calendar year' })
  const months = table.locator('tbody td')
  async function setCutoff(value) {
    await cutoff.fill(value)
    await calculate.click()
    await expect(page.getByRole('status')).toContainText(value)
  }
  async function download() {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download monthly returns CSV' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('monthly-returns.csv')
    return readFile(await file.path(), 'utf8')
  }
  const early = '2024-01-15T16:00:00Z'
  await setCutoff(early)
  await expect(table.getByRole('rowheader')).toHaveText('2024')
  await expect(months.nth(0)).toContainText('+12.5%')
  await expect(months.nth(0)).toContainText('Month to date')
  await expect(months.nth(1)).toHaveText('Future')
  const first = await download()
  expect(first).toContain('2024,01,month-to-date,available,2023-12-29T16:00:00Z,80,2024-01-15T16:00:00Z,90,12.5\r\n')
  expect(first).toContain('2024,02,future,future,,,,,\r\n')

  await setCutoff('2024-12-31T23:59:59Z')
  await expect(months).toHaveText(['+25%', '-25%', 'No close', 'No prior close', '-100%',
    'Zero prior close', '0%', '-200%', '+100%', 'No close', 'No close', 'No close'])
  await expect(months.nth(0)).toHaveAttribute('data-return', 'positive')
  await expect(months.nth(1)).toHaveAttribute('data-return', 'negative')
  const late = await download()
  expect(late).toContain('2024,02,complete,available,2024-01-31T16:00:00Z,100,2024-02-29T16:00:00Z,75,-25\r\n')
  expect(late).toContain('2024,06,complete,zero prior close,2024-05-31T16:00:00Z,0,2024-06-28T16:00:00Z,25,\r\n')
  await setCutoff(early)
  expect(await download()).toBe(first)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
  expect(await catalogContents(page)).toEqual(saved)
})

test('monthly returns separately enforce calculation and CSV grants', async ({ page }) => {
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Monthly returns calendar' })
  const calculate = page.getByRole('button', { name: 'Calculate monthly returns' })
  await importHistory(page, 'NO-AUTO', 'restricted', 'granted')
  await open.click()
  await calculate.click()
  await expect(page.getByRole('alert')).toHaveText('Monthly returns require granted automated-use permission.')
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await importHistory(page, 'NO-EXPORT', 'granted', 'restricted')
  await open.click()
  await calculate.click()
  await expect(page.getByRole('table', { name: 'Monthly returns by UTC calendar year' })).toBeVisible()
  await page.getByRole('button', { name: 'Download monthly returns CSV' }).click()
  await expect(page.getByRole('alert')).toHaveText('Monthly returns CSV requires granted redistribution permission.')
})
