import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import {
  catalogContents,
  openImport,
  submitImport,
} from './catalog-fixtures.mjs'

const fixtures = '../../../crates/core/tests/fixtures/'
const fixture = (name) =>
  readFile(
    new URL(fixtures + 'synthetic-split-' + name + '.csv', import.meta.url),
    'utf8',
  )

test('offline split replay gates disclosure and changes only the older candles', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start split demo' }).click()

  const basis = page.getByLabel('Price basis')
  const next = page.getByRole('button', { name: 'Next event' })
  const back = page.getByRole('button', { name: 'Previous event' })
  const status = page.locator('.replay-state')
  const quote = page.getByTestId('replay-last-close')
  const observed = page.getByTestId('replay-bar-count')
  await next.click()
  await next.click()
  await expect(quote).toHaveText('101.00')
  await expect(status).not.toContainText('2 for 1')
  await basis.selectOption('adjusted')
  await expect(quote).toHaveText('101.00')

  await next.click()
  await expect(status).toContainText('Split report observed')
  await expect(status).toContainText('2025-06-02T14:15:00Z')
  await expect(status).toContainText('2025-06-02T14:20:00Z')
  await expect(quote).toHaveText('101.00')
  for (let i = 0; i < 13; i++) await next.click()
  await expect(status).toContainText('Split effective')
  await expect(observed).toHaveText('12 observed bars')
  await expect(quote).toHaveText('53.25')
  await expect(page.locator('.ohlc-vol')).toContainText('1.62K')
  await basis.selectOption('raw')
  await expect(quote).toHaveText('106.50')
  await expect(page.locator('.ohlc-vol')).toContainText('810.000001')
  await basis.selectOption('adjusted')
  await back.click()
  await expect(quote).toHaveText('106.50')
  await next.click()
  await expect(quote).toHaveText('53.25')

  await next.click()
  await next.click()
  await expect(observed).toHaveText('13 observed bars')
  await expect(quote).toHaveText('53.00')
  await basis.selectOption('raw')
  await expect(quote).toHaveText('53.00')
})

test('validates a local corporate action file against the selected raw history', async ({
  page,
}) => {
  await page.goto('/')
  await openImport(page, 'SPLIT', await fixture('ohlcv'))
  await submitImport(page, 'SPLIT')
  const before = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  async function upload(label, content) {
    await page.getByLabel(label).setInputFiles({
      name: 'fixture.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(content),
    })
  }
  const csv = await fixture('actions')
  await upload('Session calendar CSV', await fixture('sessions'))
  await page.getByLabel('Bar interval in seconds').fill('600')
  const actions = 'Corporate actions CSV (optional)'
  const confirmation = page.getByRole('checkbox', {
    name: 'My OHLCV contains raw prices and volume.',
  })
  const start = page.getByRole('button', { name: 'Start replay', exact: true })
  await upload(actions, csv)
  await start.click()
  await expect(confirmation).toBeFocused()
  await confirmation.check()
  await start.click()
  await expect(page.getByRole('alert')).toContainText('Instrument must match')

  const corrected = csv.replace('DEMO:SPLIT', 'LOCAL:SPLIT')
  await upload(
    actions,
    corrected.replace('2025-06-03T14:00:00Z', '2025-06-03T14:01:00Z'),
  )
  await confirmation.check()
  await start.click()
  await expect(page.getByRole('alert')).toContainText(
    'effective inside a bar interval',
  )

  await upload(
    actions,
    corrected.replace('2025-06-02T14:20:00Z', '2025-06-03T14:15:00Z'),
  )
  await confirmation.check()
  await start.click()
  await expect(page.getByLabel('Price basis')).toBeVisible()
  await page.getByLabel('Price basis').selectOption('adjusted')
  const next = page.getByRole('button', { name: 'Next event' })
  const status = page.locator('.replay-state')
  const quote = page.getByTestId('replay-last-close')
  for (let i = 0; i < 15; i++) await next.click()
  await expect(status).toContainText('Session opened')
  await expect(quote).toHaveText('106.50')
  await next.click()
  await expect(status).toContainText('Bar observed')
  await expect(quote).toHaveText('53.00')
  const firstCandle = page.locator('canvas[tabindex="0"]')
  const selectedOhlc = page.locator('.ohlc')
  await firstCandle.hover({ position: { x: 25, y: 50 } })
  await expect(selectedOhlc).toContainText('2025-06-02 14:00:00 UTC')
  await expect(selectedOhlc).toContainText('C 101.00')
  await next.click()
  await expect(status).toContainText('Split report observed')
  await expect(status).toContainText('2025-06-03T14:15:00Z')
  await expect(quote).toHaveText('53.00')
  await firstCandle.hover({ position: { x: 25, y: 50 } })
  await expect(selectedOhlc).toContainText('C 50.50')
  await page.getByRole('button', { name: 'Previous event' }).click()
  await firstCandle.hover({ position: { x: 25, y: 50 } })
  await expect(selectedOhlc).toContainText('C 101.00')
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(before)
})
