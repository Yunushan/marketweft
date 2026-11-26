import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import {
  catalogContents,
  openImport,
  submitImport,
} from './catalog-fixtures.mjs'

const fixture = (name) =>
  readFile(
    new URL('../../../crates/core/tests/fixtures/' + name, import.meta.url),
    'utf8',
  )
const unix = (text) => Date.parse('2025-06-' + text + 'Z') / 1000
const ex = unix('03T14:00:00')
const revise = unix('03T15:00:00')
const oldPay = unix('04T12:00:00')
const late = unix('04T13:30:00')
const pay = unix('04T14:00:00')
const correct = unix('04T15:00:00')

test('offline dividend replay reconciles every cutoff and rewinds cash corrections', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start dividend demo' }).click()
  const ledger = page.getByRole('region', { name: 'Dividend ledger' })
  const state = page.locator('.replay-state')
  const next = page.getByRole('button', { name: 'Next event' })
  const back = page.getByRole('button', { name: 'Previous event' })
  const usd = ledger.getByRole('row', { name: /^USD/ })
  const eur = ledger.getByRole('row', { name: /^EUR/ })
  const count = page.getByTestId('replay-bar-count')
  const observed = state.locator('time').last()
  await expect(ledger).toContainText(
    'No dividend receivable or cash at this cutoff.',
  )
  const times = new Set()
  for (let step = 0; step < 35; step++) {
    await next.click()
    const at = Date.parse(await observed.getAttribute('datetime')) / 1000
    times.add(at)
    if (at < ex) await expect(usd).toHaveCount(0)
    else if (at < revise) await expect(usd).toHaveText('USD25.000.00')
    else if (at < pay) await expect(usd).toHaveText('USD30.000.00')
    else if (at < correct) await expect(usd).toHaveText('USD0.0030.00')
    else await expect(usd).toHaveText('USD0.0028.00')
    if (at < late) await expect(eur).toHaveCount(0)
    else await expect(eur).toHaveText('EUR0.0010.00')
  }
  expect(times.has(oldPay)).toBe(false)
  expect([ex, revise, late, pay, correct].every((at) => times.has(at))).toBe(
    true,
  )
  await expect(next).toBeDisabled()
  await expect(count).toHaveText('24 observed bars')
  await ledger.getByText('Cash postings (3)', { exact: true }).click()
  const rows = ledger
    .getByRole('table', { name: 'Dividend cash postings' })
    .getByRole('row')
  await expect(rows.nth(1)).toContainText('USD−2.00')
  await expect(rows.nth(2)).toContainText('USD30.00')
  await expect(rows.nth(3)).toContainText('EUR10.00')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  )
  await back.click()
  await expect(usd).toHaveText('USD0.0030.00')
  await expect(ledger.getByText('Cash postings (2)')).toBeVisible()
  await back.click()
  await expect(usd).toHaveText('USD30.000.00')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(ledger).toContainText(
    'No dividend receivable or cash at this cutoff.',
  )
})

test('custom dividend replay validates currency, scales entitlement, and preserves split views and source history', async ({
  page,
}) => {
  await page.goto('/')
  await openImport(page, 'DIVIDEND', await fixture('synthetic-split-ohlcv.csv'))
  await submitImport(page, 'DIVIDEND')
  const before = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  const upload = (label, text) =>
    page.getByLabel(label).setInputFiles({
      name: 'fixture.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(text),
    })
  await upload(
    'Session calendar CSV',
    await fixture('synthetic-split-sessions.csv'),
  )
  await upload(
    'Corporate actions CSV (optional)',
    (await fixture('synthetic-split-actions.csv')).replace(
      'DEMO:SPLIT',
      'LOCAL:DIVIDEND',
    ),
  )
  await page
    .getByRole('checkbox', { name: 'My OHLCV contains raw prices and volume.' })
    .check()
  const dividends = 'Cash dividends CSV (optional)'
  const data = (await fixture('synthetic-cash-dividends.csv')).replaceAll(
    'DEMO:DIVIDEND',
    'LOCAL:DIVIDEND',
  )
  await upload(dividends, data.replace('USD,0.250000', 'usd,0.250000'))
  await page.getByLabel('Entitled shares per distribution').fill('7')
  await page.getByLabel('Bar interval in seconds').fill('600')
  const start = page.getByRole('button', { name: 'Start replay', exact: true })
  await start.click()
  await expect(page.getByRole('alert')).toContainText('uppercase cash currency')
  await upload(dividends, data)
  await start.click()

  const next = page.getByRole('button', { name: 'Next event' })
  const ledger = page.getByRole('region', { name: 'Dividend ledger' })
  const basis = page.getByLabel('Price basis')
  const quote = page.getByTestId('replay-last-close')
  for (let step = 0; step < 17; step++) await next.click()
  await expect(page.locator('.replay-state')).toContainText('Dividend ex-date')
  await expect(ledger.getByRole('row', { name: /^USD/ })).toHaveText(
    'USD1.750.00',
  )
  await expect(quote).toHaveText('106.50')
  await basis.selectOption('adjusted')
  await expect(quote).toHaveText('53.25')
  await expect(ledger.getByRole('row', { name: /^USD/ })).toHaveText(
    'USD1.750.00',
  )
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(before)
})
