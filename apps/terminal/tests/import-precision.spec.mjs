import { expect, test } from './fixtures.mjs'
import { catalogContents, seedLegacy } from './catalog-fixtures.mjs'

const key = 'marketweft.workspace.v1'
const tinyBars = [
  'time,open,high,low,close,volume',
  '2025-01-01,1.084530,1.084531,1.084530,1.084531,0.000002',
  '2025-01-02,1.084531,1.084532,1.084531,1.084532,0.000001',
].join('\n')

test('six-place prices, the close change and fractional volume survive import and reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await page.getByLabel('Symbol', { exact: true }).fill('EURUSD')
  await page.getByLabel('Historical CSV file', { exact: true }).setInputFiles({
    name: 'fx.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(tinyBars),
  })
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  await expect(page.locator('.quote')).toContainText('+0.000001')
  await expect(page.locator('.ohlc-vol')).toContainText('0.000001')
  const quote = page.getByRole('group', {
    name: 'EURUSD OHLCV. Open 1.084531, high 1.084532, low 1.084531, close 1.084532, volume 0.000001',
  })
  await expect(quote).toBeVisible()
  await page.reload()
  await expect(quote).toBeVisible()
  await expect(page.locator('.range-label')).toContainText('Low 1.084531')
  await expect(page.locator('.range-label')).toContainText('High 1.084532')
})

test('salvages good history and preserves the raw original before saving repaired settings', async ({
  page,
}) => {
  const raw = JSON.stringify({
    version: 1,
    selected: 'LOCAL:FX',
    watchlist: ['LOCAL:FX', 'DELETED'],
    imports: [
      { venue: 'LOCAL', symbol: 'FX', filename: 'fx.csv', csv: tinyBars },
      { filename: { broken: true } },
    ],
    sma: 'broken',
    ema: true,
  })
  await seedLegacy(page, raw)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Recovered the readable parts',
  )
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(raw)
  const snapshot = await catalogContents(page)
  expect(snapshot.series).toHaveLength(1)
  expect(snapshot.series[0].csv).toBe(tinyBars)
  await page.getByRole('button', { name: /Indicators/ }).click()
  await page.getByRole('checkbox', { name: /Exponential/ }).uncheck()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(raw)
  await page.reload()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('two tabs writing from the same revision cannot overwrite one another', async ({
  page,
  context,
}) => {
  // Delivery can be delayed in a suspended tab. Keep both starting revisions
  // identical and verify the database transaction itself detects the conflict.
  await context.addInitScript(() => {
    if (typeof BroadcastChannel !== 'undefined')
      BroadcastChannel.prototype.postMessage = () => {}
    window.addEventListener(
      'storage',
      (e) => e.stopImmediatePropagation(),
      true,
    )
  })
  await page.goto('/')
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(
    other.getByRole('heading', { name: 'NVDA', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Select NASDAQ:AAPL' }).click()
  await expect(
    page.getByRole('heading', { name: 'AAPL', exact: true }),
  ).toBeVisible()
  const first = await catalogContents(page)
  await other.getByRole('button', { name: 'Select NASDAQ:MSFT' }).click()
  await expect(other.getByRole('alert')).toContainText(
    /changed|stale|another tab/i,
  )
  await expect(
    other.getByRole('heading', { name: 'AAPL', exact: true }),
  ).toBeVisible()
  expect(await catalogContents(other)).toEqual(first)
  await other.getByRole('button', { name: 'Select NASDAQ:MSFT' }).click()
  await expect(
    other.getByRole('heading', { name: 'MSFT', exact: true }),
  ).toBeVisible()
})
