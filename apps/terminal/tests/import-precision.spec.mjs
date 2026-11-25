import { expect, test } from './fixtures.mjs'

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
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fx.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(tinyBars),
    })
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  await expect(page.locator('.quote')).toContainText('+0.000001')
  await expect(page.locator('.ohlc-vol')).toContainText('0.000001')
  await page.reload()
  await expect(page.locator('.range-label')).toContainText('Low 1.084531')
  await expect(page.locator('.range-label')).toContainText('High 1.084532')
})

test('salvages good history and preserves the raw original before saving repaired settings', async ({
  page,
}) => {
  await page.goto('/')
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
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, raw])
  await page.reload()
  await expect(page.getByRole('alert')).toContainText(
    'Recovered the readable parts',
  )
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(raw)
  await page.getByRole('button', { name: 'Select LOCAL:FX' }).click()
  const snapshot = await page.evaluate(
    (k) => ({
      backup: localStorage.getItem(k + '.recovery.1'),
      saved: JSON.parse(localStorage.getItem(k)),
    }),
    key,
  )
  expect(snapshot.backup).toBe(raw)
  expect(snapshot.saved.watchlist).toEqual(['LOCAL:FX'])
  expect(snapshot.saved.imports).toHaveLength(1)
  await page.reload()
  await expect(page.locator('.quote strong')).toHaveText('1.084532')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('an unseen external save is retained when a stale workspace tries to write', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Select NASDAQ:AAPL' }).click()
  const external = await page.evaluate((k) => {
    const data = JSON.parse(localStorage.getItem(k))
    data.ema = true
    const serialized = JSON.stringify(data)
    localStorage.setItem(k, serialized)
    return serialized
  }, key)
  await page.getByRole('button', { name: 'Select NASDAQ:MSFT' }).click()
  await expect(page.getByRole('alert')).toContainText('saved workspace changed')
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    external,
  )
  await expect(
    page.getByRole('heading', { name: 'AAPL', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.legend')).toContainText('EMA 9')
})
