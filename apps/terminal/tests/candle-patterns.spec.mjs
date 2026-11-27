import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents, openImport, submitImport } from './catalog-fixtures.mjs'

const fixture = name => readFile(new URL('../../../crates/core/tests/fixtures/' + name + '.csv', import.meta.url), 'utf8')

test('offline candle pattern scans disclose only observations at the active replay step', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start candlestick pattern demo' }).click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  const scan = page.getByRole('button', { name: 'Scan observed candles' })
  const next = page.getByRole('button', { name: 'Next event' })
  const table = page.getByRole('table', { name: 'Observed candlestick patterns' })
  const rows = table.locator('tbody tr')
  async function step(count) { for (let i = 0; i < count; i++) await next.click() }

  await expect(scan).toBeDisabled()
  await step(2)
  await scan.click()
  await expect(page.getByText('0 patterns through 2026-01-12T14:01:00Z.')).toBeVisible()
  await expect(table).toHaveCount(0)

  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bullish engulfing')
  await expect(rows.first()).toContainText('2026-01-12T14:02:00Z')

  await step(1)
  await expect(table).toHaveCount(0)
  await scan.click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Bearish engulfing')

  await step(2)
  await scan.click()
  await expect(rows).toHaveCount(2)
  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Doji')
  await expect(rows.first()).toContainText('2026-01-12T14:06:00Z')

  await step(6)
  await scan.click()
  await expect(rows).toHaveCount(3)
  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(4)
  await expect(rows.first().getByRole('cell')).toHaveText([
    'Doji', '2026-01-13T14:02:00Z', '2026-01-13T14:02:30Z',
  ])
  await page.getByRole('button', { name: 'Previous event' }).click()
  await expect(table).toHaveCount(0)
  await scan.click()
  await expect(rows).toHaveCount(3)
})

test('a restricted source blocks pattern scans without changing imported history', async ({ page }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-candle-patterns'), fixture('synthetic-candle-pattern-sessions')])
  await page.goto('/')
  await openImport(page, 'RESTRICTED', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption('restricted')
  await submitImport(page, 'RESTRICTED')
  const saved = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({ name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar) })
  await page.getByLabel('Bar interval in seconds').fill('60')
  await page.getByRole('button', { name: 'Start replay', exact: true }).click()
  const next = page.getByRole('button', { name: 'Next event' })
  for (let i = 0; i < 3; i++) await next.click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  await page.getByRole('button', { name: 'Scan observed candles' }).click()
  await expect(page.getByRole('alert')).toContainText('requires granted automated-use permission')
  await expect(page.getByRole('table', { name: 'Observed candlestick patterns' })).toHaveCount(0)
  expect(await catalogContents(page)).toEqual(saved)
})
