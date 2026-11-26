import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = minute => '2025-06-02T14:0' + minute + ':00Z'

test('listing risk pairs exact intervals, updates at observed cutoffs and rewinds its export offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const before = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start listing risk demo' }).click()
  const screen = page.getByRole('region', { name: 'Universe screen' })
  await screen.getByText('Relative returns', { exact: true }).click()
  const relative = screen.getByRole('region', { name: 'Relative returns', exact: true })
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await query(6, 6)
  await relative.getByLabel('Left listing').selectOption('A')
  await relative.getByLabel('Right listing').selectOption('B')
  await relative.getByRole('button', { name: 'Compare returns' }).click()
  await relative.getByText('Rolling risk', { exact: true }).click()
  const view = relative.getByRole('region', { name: 'Rolling risk', exact: true })
  const apply = view.getByRole('button', { name: 'Calculate risk' })
  const table = view.getByRole('table', { name: 'Rolling listing risk' })
  const cell = (minute, index) => table.locator('tbody tr').filter({
    has: page.getByRole('rowheader', { name: utc(minute), exact: true }),
  }).getByRole('cell').nth(index)
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download rolling risk' }).click()
    const entry = await pending
    expect(entry.suggestedFilename()).toBe('rolling-listing-risk.csv')
    return (await readFile(await entry.path(), 'utf8')).trimEnd().split('\r\n')
  }

  await apply.click()
  await expect(cell(3, 1)).toHaveText('3 / 3')
  await expect(cell(3, 2)).toHaveText('1 / 3')
  await expect(cell(3, 3)).toHaveText('1 / 3')
  await expect(cell(3, 5)).toHaveText('—')
  await expect(cell(3, 6)).toHaveText('—')
  await expect(cell(6, 6)).toHaveText('-1.000000')
  const old = await download()
  expect(old).toHaveLength(5)
  const first = old[1].split(',')
  expect(first.slice(0, 16).join(',')).toBe(
    '"A","B","2025-06-02T14:00:00Z","2025-06-02T14:06:00Z","2025-06-02T14:06:00Z",60,3,1,"Synthetic listing risk membership","Synthetic listing risk closes",2025-06-02T14:00:00Z,2025-06-02T14:03:00Z,3,3,1,1',
  )
  expect(Number(first[16])).toBeCloseTo(0.1 / Math.sqrt(3), 12)
  expect(first.slice(17)).toEqual(['', ''])

  await query(6, 7)
  await expect(view.getByRole('img', { name: /Rolling correlation over UTC/ })).toBeVisible()
  await expect(cell(3, 3)).toHaveText('3 / 3')
  await expect(cell(3, 5)).toHaveText('5.773503%')
  await expect(cell(3, 6)).toHaveText('-1.000000')
  await query(6, 8)
  await expect(cell(6, 1)).toHaveText('1 / 3')
  await expect(cell(6, 3)).toHaveText('1 / 3')
  await expect(cell(6, 6)).toHaveText('—')
  await query(6, 6)
  expect(await download()).toEqual(old)

  await view.getByLabel('Price interval (seconds)').fill('70')
  await apply.click()
  await expect(view.getByRole('alert')).toHaveText(/end must fall on an interval boundary/)
  expect(await download()).toEqual(old)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(before)
})
