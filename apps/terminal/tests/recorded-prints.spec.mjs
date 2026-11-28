import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'

const source = new URL('../../../crates/core/tests/fixtures/synthetic-recorded-prints.csv', import.meta.url)

test('time and sales preserves raw prints, delayed trades and exact exports offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const launcher = page.getByRole('button', { name: 'Recorded time and sales', exact: true })
  await launcher.click()
  await expect(page.getByRole('heading', { name: 'NASDAQ:NVDA', exact: true })).toBeVisible()
  const form = page.getByRole('form', { name: 'Recorded trade prints', exact: true })
  await form.getByLabel('Trades CSV').setInputFiles({ name: 'recorded-prints.csv', mimeType: 'text/csv', buffer: await readFile(source) })
  const run = async time => {
    await form.getByLabel('Known through (UTC, optional)', { exact: true }).fill(time)
    await form.getByRole('button', { name: 'Show trade prints', exact: true }).click()
  }
  const view = page.getByRole('region', { name: 'Recorded time and sales results', exact: true })
  const table = view.getByRole('table', { name: 'Recorded trade prints', exact: true })
  const rows = table.locator('tbody tr')
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download trade prints', exact: true }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('NASDAQ-NVDA-trade-prints.csv')
    return readFile(await file.path(), 'utf8')
  }
  await run('2025-06-02T13:59:59Z')
  await expect(view.getByRole('status')).toContainText('0 prints')
  await expect(table).toHaveCount(0)
  await run('2025-06-02T14:00:00Z')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByRole('cell')).toHaveText(['2025-06-02T13:59:58Z', '2025-06-02T14:00:00Z', '-2.000001', '1.000001', 'Buy'])
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['2025-06-02T13:59:59Z', '2025-06-02T14:00:00Z', '0', '0.25', 'Unknown'])
  const plot = view.getByRole('img', { name: 'Recorded trade prices in capture order', exact: true })
  const bounds = await plot.boundingBox()
  await plot.click({ position: { x: bounds.width - 20, y: bounds.height / 2 } })
  await expect(rows.nth(1).getByRole('button', { name: '9007199254740994', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await rows.nth(0).getByRole('button', { name: '9007199254740993', exact: true }).press('Enter')
  await expect(rows.nth(0).getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  const earlier = await download()
  expect(earlier.split('\r\n')[1]).toBe(
    'NASDAQ:NVDA,2025-06-02T13:59:58Z,2025-06-02T14:00:00Z,9007199254740993,-2.000001,1.000001,buy',
  )

  await run('2025-06-02T14:00:02Z')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(2).getByRole('cell')).toHaveText(['2025-06-02T13:59:57Z', '2025-06-02T14:00:02Z', '3', '1', 'Sell'])
  await run('')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(3).getByRole('button')).toHaveText('18446744073709551615')
  await run('2025-06-02T14:00:00Z')
  await expect(rows).toHaveCount(2)
  expect(await download()).toBe(earlier)
  await form.getByLabel('Trades CSV').setInputFiles({
    name: 'rewind.csv', mimeType: 'text/csv', buffer: Buffer.from(earlier),
  })
  await run('')
  await expect(view.getByRole('status')).toContainText('rewind.csv')
  expect(await download()).toBe(earlier)
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click()
  await expect(launcher).toBeFocused()
})

test('time and sales pages large captures for the selected comparison instrument', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('NASDAQ:MSFT')
  const launcher = page.getByRole('button', { name: 'Comparison time and sales', exact: true })
  await launcher.click()
  await expect(page.getByRole('heading', { name: 'NASDAQ:MSFT', exact: true })).toBeVisible()
  const form = page.getByRole('form', { name: 'Recorded trade prints', exact: true })
  const capture = [
    'instrument,executed_at,observed_at,sequence,price,size',
    ...Array.from({ length: 52 }, (_, index) => `NASDAQ:MSFT,1748872800,1748872800,${index + 1},${index - 25},1`),
  ].join('\n')
  await form.getByLabel('Trades CSV').setInputFiles({ name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.from(capture) })
  await form.getByRole('button', { name: 'Show trade prints', exact: true }).click()
  const view = page.getByRole('region', { name: 'Recorded time and sales results', exact: true })
  const rows = view.getByRole('table', { name: 'Recorded trade prints' }).locator('tbody tr')
  await expect(rows).toHaveCount(50)
  await view.getByRole('button', { name: 'Next prints', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first().getByRole('button')).toHaveText('51')
  await expect(rows.last().getByRole('cell').last()).toHaveText('Unknown')
  await expect(view.getByRole('button', { name: 'Next prints', exact: true })).toBeDisabled()
  await view.getByRole('button', { name: 'Previous prints', exact: true }).click()
  await expect(rows.first().getByRole('button')).toHaveText('1')
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click()
  await expect(launcher).toBeFocused()
})
