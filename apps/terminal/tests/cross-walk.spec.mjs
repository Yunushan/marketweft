import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = minute => '2025-06-02T14:0' + minute + ':00Z'

test('cross-sectional walk-forward adds disjoint folds without revising training or the offline export', async ({ page, context }) => {
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
  const replay = screen.getByRole('region', { name: 'Cross-sectional paper replay' })
  await replay.getByRole('button', { name: 'Use walk-forward sample liquidity' }).click()
  const cutoffs = async known => {
    await page.getByLabel('Effective time (UTC)').fill(utc(6))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await cutoffs(3)
  await replay.getByRole('button', { name: 'Run ranking replay' }).click()
  await replay.getByText('Cross-sectional walk-forward', { exact: true }).click()
  const view = replay.getByRole('region', { name: 'Cross-sectional walk-forward' })
  await view.getByRole('button', { name: 'Run cross-sectional walk-forward' }).click()
  await expect(view.getByRole('status')).toHaveText('0 completed folds')
  await cutoffs(4)
  await expect(view.getByRole('status')).toHaveText('1 completed fold')
  const table = view.getByRole('table', { name: 'Cross-sectional walk-forward scores' })
  await expect(table.getByRole('row', { name: /^Training 1/ })).toContainText('999.3')
  await expect(table.getByRole('row', { name: /^Training 2/ })).toContainText('Incomplete marks')
  await expect(table.getByRole('row', { name: /^Test/ })).toContainText('999.1')
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download cross-sectional walk-forward' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('cross-sectional-walk-forward.csv')
    return readFile(await saved.path(), 'utf8')
  }
  const first = await download()
  const [header, ...rows] = first.trimEnd().split('\r\n').map(row => row.split(','))
  expect(rows.every(row => row.length === header.length)).toBe(true)
  expect(first).toContain(',test,,60,1,999.1,515.1,484,0.9,1,2,3,1')
  await cutoffs(6)
  await expect(view.getByRole('status')).toHaveText('2 completed folds')
  await view.getByLabel('Completed cross-sectional fold').selectOption('1')
  await expect(view.getByText('2025-06-02T14:05:00Z to 2025-06-02T14:06:00Z')).toBeVisible()
  await cutoffs(7)
  await expect(view.getByRole('status')).toHaveText('2 completed folds')
  await cutoffs(4)
  expect(await download()).toEqual(first)
  await view.getByLabel('Candidates (lookback seconds:top listings)').fill('60:1,60:1')
  await view.getByRole('button', { name: 'Run cross-sectional walk-forward' }).click()
  await expect(view.getByRole('alert')).toContainText('distinct ranking candidates')
  expect(await download()).toEqual(first)
  await expect.poll(() => catalogContents(page)).toEqual(original)
})
