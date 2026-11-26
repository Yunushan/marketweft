import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = minute => '2025-06-02T14:0' + minute + ':00Z'

test('paper ranking replay delays fills and exports the exact receipt history offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start listing risk demo' }).click()
  const screen = page.getByRole('region', { name: 'Universe screen' })
  await screen.getByText('Cross-sectional paper replay', { exact: true }).click()
  const view = screen.getByRole('region', { name: 'Cross-sectional paper replay', exact: true })
  const cutoffs = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const rows = view.getByRole('table', { name: 'Cross-sectional paper receipts' }).locator('tbody tr')
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download paper replay' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('cross-sectional-paper-replay.csv')
    return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
  }
  await view.getByRole('button', { name: 'Use sample liquidity' }).click()
  await cutoffs(6, 1)
  await view.getByRole('button', { name: 'Run ranking replay' }).click()
  await expect(view.getByRole('status')).toHaveText('1 decisions · 1 paper receipts')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('submit')
  const early = await download()
  expect(early[1].endsWith(',1000,484.9,0,0,1000')).toBe(true)
  await cutoffs(6, 6)
  await expect(view.getByRole('status')).toHaveText('6 decisions · 5 paper receipts')
  await expect(rows.filter({ hasText: 'Q-9007199254740995' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Q-9007199254740996' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Q-9007199254740994' })).toHaveCount(0)
  const late = await download()
  expect(late[1].endsWith(',536.6,0,1.4,462,1069')).toBe(true)
  const [header, ...body] = late.map(line => line.split(','))
  expect(body.every(row => row.length === header.length)).toBe(true)
  const position = body.find(row => row[header.indexOf('row')] === 'position')
  expect(position[header.indexOf('shares')]).toBe('4')
  expect(position[header.indexOf('price')]).toBe('133.1')
  expect(position[header.indexOf('position_cost')]).toBe('463.4')
  await cutoffs(6, 7)
  await expect(rows).toHaveCount(5)
  await cutoffs(6, 1)
  expect(await download()).toEqual(early)
  await view.getByLabel('Execution liquidity CSV').setInputFiles({
    name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('not a liquidity report'),
  })
  await view.getByRole('button', { name: 'Run ranking replay' }).click()
  await expect(view.getByRole('alert')).toContainText('Expected liquidity CSV header')
  expect(await download()).toEqual(early)
  await expect.poll(() => catalogContents(page)).toEqual(original)
})
