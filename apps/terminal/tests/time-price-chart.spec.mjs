import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')
const header = 'instrument,executed_at,observed_at,sequence,price,size,aggressor'

async function load(page, name, rows) {
  await page.getByRole('button', { name: 'Recorded footprint', exact: true }).click()
  await page.getByLabel('Footprint trades CSV').setInputFiles({ name, mimeType: 'text/csv',
    buffer: Buffer.from([header, ...rows.map(values => ['NASDAQ:NVDA', ...values].join(','))].join('\n')) })
  await page.getByRole('button', { name: 'Load footprint trades', exact: true }).click()
  await page.getByText('Time-price bracket chart', { exact: true }).click()
  return page.getByRole('region', { name: 'Time-price bracket chart', exact: true })
}

test('time-price chart checks duplicate occupancy, signed bins, late gaps and exact rewind offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const saved = await catalogContents(page)
  const chart = await load(page, 'sparse-trades.csv', [
    [-1, 0, 1, -0.01, 1, 'buy'], [-2, 0, 2, -0.45, 3, 'sell'],
    [120, 120, 3, 1.01, 2, 'unknown'], [60, 121, 4, 0.01, 1, 'buy'],
    [120, 121, 5, 2.1, 1, 'buy'], [179, 179, 6, 4.01, 1, 'sell'],
  ])
  const table = chart.getByRole('table')
  await page.getByLabel('Execution from (UTC)').fill(utc(-120))
  await page.getByLabel('Execution through (UTC)').fill(utc(120))
  async function setCutoff(known) {
    await page.getByLabel('Footprint known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Query footprint' }).click()
  }
  async function download() {
    const pending = page.waitForEvent('download')
    await chart.getByRole('button', { name: 'Download time-price brackets' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('time-price-brackets.csv')
    return readFile(await file.path(), 'utf8')
  }
  await setCutoff(120)
  await expect(table.getByRole('columnheader', { name: `Gap from ${utc(-120)} Until ${utc(-60)} (exclusive)` })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: `Gap from ${utc(0)} Until ${utc(120)} (exclusive)` })).toBeVisible()
  await expect(table.getByRole('rowheader')).toHaveText(['[1, 1.5)', '[-0.5, 0)'])
  const signed = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '[-0.5, 0)', exact: true }) })
  await expect(signed.getByRole('cell', { name: 'Observed opportunity', exact: true })).toHaveCount(1)
  await expect(signed.getByRole('cell').last()).toHaveText('1')
  const early = await download()
  expect(early.trimEnd().split('\r\n')).toHaveLength(3)
  expect(early).toContain(`,${utc(-60)},${utc(0)},-0.5,0,1,2\r\n`)

  await setCutoff(121)
  await expect(table.getByRole('columnheader', { name: utc(60), exact: true })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: `Gap from ${utc(0)} Until ${utc(60)} (exclusive)` })).toBeVisible()
  await expect(table.getByRole('rowheader')).toHaveText(['[2, 2.5)', '[1, 1.5)', '[0, 0.5)', '[-0.5, 0)'])
  const later = await download()
  expect(later.trimEnd().split('\r\n')).toHaveLength(5)
  expect(later).toContain(`,${utc(60)},${utc(120)},0,0.5,1,1\r\n`)
  expect(later).toContain(`,${utc(120)},${utc(180)},2,2.5,1,1\r\n`)
  await page.getByText('Price profiles', { exact: true }).click()
  await page.getByRole('button', { name: 'Calculate profiles' }).click()
  const profile = page.getByRole('table', { name: 'Price profile bins' })
  await expect(profile.locator('tbody tr td:nth-child(3)')).toHaveText(['1', '1', '1', '1'])
  await setCutoff(120)
  expect(await download()).toBe(early)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect(chart.getByRole('region', { name: 'Scrollable time-price chart' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  expect(await catalogContents(page)).toEqual(saved)
})

test('time-price chart pages exact price and time axes independently', async ({ page }) => {
  await page.goto('/')
  const rows = Array.from({ length: 26 }, (_, index) => [index * 60, index * 60, index + 1, index, 1, 'buy'])
  const chart = await load(page, 'dense-trades.csv', rows)
  const table = chart.getByRole('table')
  await expect(table.getByRole('rowheader')).toHaveCount(24)
  await expect(table.getByRole('columnheader', { name: utc(0), exact: true })).toBeVisible()
  await chart.getByRole('button', { name: 'Next price bins' }).click()
  await expect(table.getByRole('rowheader')).toHaveText(['[1, 1.5)', '[0, 0.5)'])
  await chart.getByRole('button', { name: 'Next time brackets' }).click()
  await expect(table.getByRole('columnheader', { name: utc(8 * 60), exact: true })).toBeVisible()
  await expect(table.getByRole('rowheader')).toHaveCount(2)
  await expect(table.getByRole('cell', { name: 'Observed opportunity' })).toHaveCount(0)
  await chart.getByRole('button', { name: 'Previous price bins' }).click()
  await expect(table.getByRole('cell', { name: 'Observed opportunity' })).toHaveCount(8)
})
