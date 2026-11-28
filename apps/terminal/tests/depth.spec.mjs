import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = seconds => '2025-06-02T14:00:' + String(seconds).padStart(2, '0') + 'Z'

async function download(page, results) {
  const pending = page.waitForEvent('download')
  await results.getByRole('button', { name: 'Download depth snapshot' }).click()
  const saved = await pending
  expect(saved.suggestedFilename()).toBe('recorded-depth.csv')
  return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
}

test('recorded depth steps observed frames, withholds invalid books and recovers offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const before = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Recorded market depth' }).click()
  await expect(page.getByRole('heading', { name: 'Recorded market depth' })).toBeFocused()
  await page.getByRole('button', { name: 'Load depth demo' }).click()

  const results = page.getByRole('region', { name: 'Order book at cutoff' })
  const status = results.getByRole('status')
  const bids = results.getByRole('table', { name: 'Bids by price' })
  const asks = results.getByRole('table', { name: 'Asks by price' })
  const next = page.getByRole('button', { name: 'Next observation' })
  await expect(status).toHaveText('Waiting for the first complete snapshot.')
  await expect(bids).toHaveCount(0)

  await next.click()
  await expect(status).toHaveText('Synchronized')
  await expect(bids.getByRole('row', { name: /99.125/ })).toContainText('10.000001')
  await expect(asks.getByRole('row', { name: /100.25/ })).toContainText('12')
  await expect(results.getByText('9007199254740993', { exact: true })).toBeVisible()

  await next.click()
  await expect(bids.getByRole('row', { name: /99.125/ })).toHaveCount(0)
  await expect(bids.getByRole('row', { name: /99.5/ })).toContainText('4')
  const updated = await download(page, results)
  expect(updated).toHaveLength(4)
  expect(updated[1]).toBe(
    '"NASDAQ:NVDA","Synthetic depth snapshots and updates",2025-06-02T14:00:03Z,synchronized,9007199254740994,2025-06-02T14:00:00Z,2025-06-02T14:00:03Z,9007199254740993,2025-06-02T14:00:01Z,2025-06-02T14:00:02Z,,,bid,99.5,4',
  )
  expect(updated[3].endsWith(',ask,100.25,3.25')).toBe(true)

  await next.click()
  await expect(status).toHaveText('Sequence gap. Expected 9007199254740995, received 9007199254740996. Waiting for a new snapshot.')
  await expect(results.getByRole('table')).toHaveCount(0)
  const gap = await download(page, results)
  expect(gap).toHaveLength(2)
  expect(gap[1].endsWith(',9007199254740995,9007199254740996,,,')).toBe(true)
  await next.click()
  await expect(status).toContainText('Sequence gap')
  await next.click()
  await expect(status).toHaveText('Synchronized')
  await expect(bids.getByRole('cell').last()).toHaveText('0.000001')
  await expect(asks.getByRole('rowheader').last()).toHaveText('-4')
  await expect(results.getByText('9007199254741000', { exact: true })).toBeVisible()
  await next.click()
  await expect(status).toContainText('Crossed order book at sequence 9007199254741002')
  await next.click()
  await expect(status).toContainText('Crossed order book')
  await next.click()
  await expect(status).toHaveText('Synchronized')
  await expect(results.getByText('No bids.', { exact: true })).toBeVisible()
  await expect(next).toBeDisabled()

  await page.getByLabel('Depth known time (UTC)').fill(utc(3))
  await page.getByRole('button', { name: 'Query depth' }).click()
  expect(await download(page, results)).toEqual(updated)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(page.getByRole('button', { name: 'Recorded market depth' })).toBeFocused()
  expect(await catalogContents(page)).toEqual(before)
})

test('depth sweep previews fills by price, withholds gaps and rewinds its exact offline export', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const before = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Recorded market depth' }).click()
  await page.getByRole('button', { name: 'Load depth demo' }).click()
  await page.getByText('Simulate a depth sweep', { exact: true }).click()
  const side = page.getByLabel('Order side')
  const price = page.getByLabel('Limit price (optional)')
  const button = page.getByRole('button', { name: 'Calculate sweep' })
  const result = page.getByRole('region', { name: 'Depth sweep result' })
  const value = name => result.getByText(name, { exact: true }).locator('..').locator('dd')
  const cutoff = async seconds => {
    await page.getByLabel('Depth known time (UTC)').fill(utc(seconds))
    await page.getByRole('button', { name: 'Query depth' }).click()
  }
  const exportSweep = async () => {
    const pending = page.waitForEvent('download')
    await result.getByRole('button', { name: 'Download depth sweep' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('recorded-depth-sweep.csv')
    return readFile(await file.path(), 'utf8')
  }
  await button.click()
  await expect(result.getByText('Simulation unavailable while the order book is unsynchronized.')).toBeVisible()
  await cutoff(2)
  await expect(value('Filled')).toHaveText('5')
  await cutoff(3)
  await expect(value('Filled')).toHaveText('3.25')
  await expect(value('Unfilled')).toHaveText('1.75')
  await expect(value('Notional')).toHaveText('325.8125')
  const first = await exportSweep()
  expect(first).toMatch(/,buy,5,,3\.25,1\.75,325\.8125,100\.25,100\.25,3\.25\r\n/)
  await cutoff(5)
  await expect(value('Filled')).toHaveCount(0)
  expect(await exportSweep()).toContain(',9007199254740995,9007199254740996,buy,5,,,,,,,\r\n')
  await cutoff(9)
  await expect(value('Notional')).toHaveText('-8')
  await expect(value('Average price')).toHaveText('-4')
  await cutoff(3)
  expect(await exportSweep()).toEqual(first)
  await side.selectOption('sell')
  await price.fill('98.5')
  await button.click()
  await expect(result.getByRole('table', { name: 'Sweep fills' }).getByRole('rowheader')).toHaveText(['99.5', '98.5'])
  await expect(value('Average price')).toHaveText('99.3')
  await price.fill('98.5000001')
  await button.click()
  await expect(page.getByRole('alert')).toContainText('Use a limit price with up to six decimals.')
  await expect(value('Average price')).toHaveText('99.3')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  expect(await catalogContents(page)).toEqual(before)
})

test('the ladder exports every level and preserves the previous view after a bad import', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Recorded market depth' }).click()
  const stamp = utc(0)
  const source = [
    'instrument,event_at,observed_at,sequence,kind,side,price,size',
    ...Array.from({ length: 55 }, (_, index) => 'NASDAQ:NVDA,' + stamp + ',' + stamp + ',1,snapshot,bid,' + (100 - index) + ',4'),
    'NASDAQ:NVDA,' + stamp + ',' + stamp + ',1,snapshot,ask,101,8',
  ].join('\n')
  const load = async csv => {
    await page.getByLabel('Depth CSV').setInputFiles({
      name: '=book.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
    })
    await page.getByRole('button', { name: 'Load depth reports' }).click()
  }
  const results = page.getByRole('region', { name: 'Order book at cutoff' })
  await load(source)
  await expect(results.getByText('The ladder shows the best 50 levels per side. The CSV includes every level.')).toBeVisible()
  await expect(results.getByRole('table', { name: 'Bids by price' }).locator('tbody tr')).toHaveCount(50)
  const csv = await download(page, results)
  expect(csv).toHaveLength(57)
  expect(csv[55].endsWith(',bid,46,4')).toBe(true)
  expect(csv[56].endsWith(',ask,101,8')).toBe(true)
  expect(csv[1].startsWith('"NASDAQ:NVDA","\'=book.csv",')).toBe(true)
  await load(source.replaceAll('NASDAQ:NVDA', 'NASDAQ:MSFT'))
  await expect(page.getByRole('alert')).toContainText('Instrument must match')
  expect(await download(page, results)).toEqual(csv)
})
