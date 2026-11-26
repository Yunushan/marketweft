import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = minute => '2025-06-02T14:0' + minute + ':00Z'

test('paper corporate cash pays, revises, reverses and exports receipts offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start corporate cash demo' }).click()
  const screen = page.getByRole('region', { name: 'Universe screen' })
  await screen.getByText('Cross-sectional paper replay', { exact: true }).click()
  const view = screen.getByRole('region', { name: 'Cross-sectional paper replay', exact: true })
  await view.getByRole('button', { name: 'Use sample liquidity' }).click()
  await view.getByText('Corporate cash reports', { exact: true }).click()
  await view.getByRole('button', { name: 'Use sample corporate reports' }).click()

  const cutoffs = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const cashRows = view.getByRole('table', { name: 'Paper corporate cash', exact: true }).locator('tbody tr')
  const cash = value => expect(view.getByText('Cash', { exact: true }).locator('..').locator('dd')).toHaveText(value)
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download corporate cash' }).click()
    const csv = await pending
    expect(csv.suggestedFilename()).toBe('paper-corporate-cash.csv')
    return readFile(await csv.path(), 'utf8')
  }
  await cutoffs(6, 4)
  await view.getByRole('button', { name: 'Run ranking replay' }).click()
  await cash('536.6')
  await expect(cashRows).toHaveCount(0)
  await cutoffs(6, 5)
  await cash('540.6')
  await expect(cashRows.filter({ hasText: 'Delisting claim' })).toContainText('receivable')
  await expect(cashRows.filter({ hasText: 'Delisting claim' })).toContainText('500')
  const beforePayment = await download()
  expect(beforePayment).toContain('"Synthetic paper dividends","Synthetic paper delisting terms","USD"')
  await cutoffs(6, 6)
  await cash('1040.6')
  await expect(cashRows.filter({ hasText: 'Delisting claim' })).toContainText('paid')
  await cutoffs(6, 7)
  await cash('1056.6')
  await expect(cashRows.filter({ hasText: 'EUR' })).toHaveCount(1)
  const revised = await download()
  expect(revised).toMatch(/,EUR,,6,\r\n/)
  expect(revised).toMatch(/,paid,USD,520,20,E-\d+\r\n/)
  const [header, ...rows] = revised.trimEnd().split('\r\n').map(row => row.split(','))
  expect(rows.every(row => row.length === header.length)).toBe(true)
  await cutoffs(6, 8)
  await cash('536.6')
  await expect(view.getByRole('table', { name: 'Ending paper positions' })).toContainText('463.4')
  await expect(cashRows.filter({ hasText: 'Delisting claim' })).toHaveCount(0)
  expect(await download()).toMatch(/,paid,USD,520,-520,E-\d+\r\n/)
  await cutoffs(6, 5)
  expect(await download()).toEqual(beforePayment)
  await view.getByLabel('Paper delisting terms CSV').setInputFiles({
    name: 'bad-terms.csv', mimeType: 'text/csv', buffer: Buffer.from('bad header'),
  })
  await view.getByRole('button', { name: 'Run ranking replay' }).click()
  await expect(view.getByRole('alert')).toContainText('Expected delisting terms header')
  expect(await download()).toEqual(beforePayment)
  await expect.poll(() => catalogContents(page)).toEqual(original)
})
