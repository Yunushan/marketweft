import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')

test('recorded footprint reconciles late trades, unknown volume and exact cumulative delta offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Recorded footprint' }).click()
  await expect(page.getByRole('heading', { name: 'Recorded footprint' })).toBeFocused()
  await page.getByRole('button', { name: 'Load footprint demo' }).click()
  const report = page.getByRole('region', { name: 'Footprint and cumulative delta' })
  const chart = report.getByRole('img', { name: /Cumulative volume delta by UTC bucket/ })
  const definition = name => report.locator('dt').filter({ hasText: new RegExp('^' + name + '$') })
    .locator('..').getByRole('definition')
  const rows = report.getByRole('table', { name: 'Footprint price bins' })
  const next = report.getByRole('button', { name: 'Next bucket' })
  const run = async known => {
    await page.getByLabel('Footprint known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Query footprint' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await report.getByRole('button', { name: 'Download footprint' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('recorded-footprint.csv')
    return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
  }

  await page.getByLabel('Execution through (UTC)').fill(utc(60))
  await run(-1)
  await expect(report.getByText('No trades match these execution and observation cutoffs.')).toBeVisible()
  await run(60)
  await expect(chart).toBeVisible()
  await expect(rows.getByRole('rowheader', { name: '-0.5', exact: true })).toBeVisible()
  await expect(definition('Cumulative delta')).toHaveText('1.25')
  await next.click()
  await expect(definition('Unknown volume')).toHaveText('3')
  await expect(definition('Cumulative delta')).toHaveText('1')
  await next.click()
  await expect(definition('Cumulative delta')).toHaveText('-1')
  const earlier = await download()

  await run(61)
  await expect(definition('Cumulative delta')).toHaveText('1.15')
  await next.click()
  const positive = rows.locator('tbody tr').filter({
    has: page.getByRole('rowheader', { name: '100.5', exact: true }),
  })
  await expect(positive).toContainText('10.000001')
  await expect(positive).toContainText('13.000001')
  await next.click()
  await expect(definition('Cumulative delta')).toHaveText('8.900001')
  const known = await download()
  expect(known).toHaveLength(5)
  expect(known[1]).toBe(
    '"NASDAQ:NVDA","Synthetic aggressor trades",60,0.5,1969-12-31T23:59:59Z,1970-01-01T00:01:00Z,1970-01-01T00:01:01Z,1969-12-31T23:59:00Z,1970-01-01T00:00:00Z,1970-01-01T00:01:01Z,9007199254740993,9007199254740997,1.15,-0.5,0,1.25,0.1,0,1.35,1.15,2',
  )
  await run(65)
  await next.click()
  await next.click()
  await expect(definition('Cumulative delta')).toHaveText('8.900001')
  await run(60)
  expect(await download()).toEqual(earlier)

  await page.getByLabel('Price increment').fill('0.0000001')
  await page.getByRole('button', { name: 'Query footprint' }).click()
  await expect(page.getByRole('alert')).toContainText('up to six fractional digits')
  expect(await download()).toEqual(earlier)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(page.getByRole('button', { name: 'Recorded footprint' })).toBeFocused()
  expect(await catalogContents(page)).toEqual(original)
})
