import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = clock => '2025-04-03T' + clock + 'Z'

test('recorded trade execution uses both cutoffs and exports the exact receipts offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open bar backtest' }).click()
  await page.getByRole('button', { name: 'Start backtest demo' }).click()
  await page.getByText('Recorded trade execution', { exact: true }).click()
  const view = page.getByRole('region', { name: 'Recorded trade execution' })
  await view.getByRole('button', { name: 'Use sample execution trades' }).click()

  const run = async (known, effective = '14:11:00') => {
    await view.getByLabel('Trade effective cutoff (UTC)').fill(utc(effective))
    await view.getByLabel('Trade known cutoff (UTC)').fill(utc(known))
    await view.getByRole('button', { name: 'Run recorded trade backtest' }).click()
  }
  const field = (label, value) => expect(view.getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd')).toHaveText(value)
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download recorded trade backtest' }).click()
    const csv = await pending
    expect(csv.suggestedFilename()).toBe('recorded-trade-backtest.csv')
    return readFile(await csv.path(), 'utf8')
  }
  await run('14:05:29')
  await field('Trade replay cash', '1000')
  await run('14:05:30', '14:05:19')
  await field('Held shares', '0')
  await run('14:05:30')
  await field('Held shares', '2')
  await field('Trade replay equity', '995.8')
  const early = await download()
  await run('14:07:10')
  await field('Held shares', '5')
  await field('Trade replay cash', '924.5')
  await run('14:11:00')
  await field('Held shares', '3')
  await run('14:11:10')
  await field('Held shares', '0')
  await field('Trade replay cash', '957.8')
  const last = await download()
  expect(last).toContain('TRADE-9007199254741000,2025-04-03T14:10:10Z,fill,accepted,3,8,0.3,23.7')
  expect(last).not.toContain('TRADE-9007199254740999')
  const [header, ...rows] = last.trimEnd().split('\r\n').map(row => row.split(','))
  expect(rows.every(row => row.length === header.length)).toBe(true)
  await run('14:05:30')
  expect(await download()).toEqual(early)
  await view.getByLabel('Recorded execution trades CSV').setInputFiles({
    name: 'bad-prints.csv', mimeType: 'text/csv', buffer: Buffer.from('bad header'),
  })
  await view.getByRole('button', { name: 'Run recorded trade backtest' }).click()
  await expect(view.getByRole('alert')).toContainText('Expected trade CSV header')
  expect(await download()).toEqual(early)
  await expect.poll(() => catalogContents(page)).toEqual(original)
})
