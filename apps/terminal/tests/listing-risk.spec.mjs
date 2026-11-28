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
  await relative.getByText('Two-listing minimum variance', { exact: true }).click()
  const variance = relative.getByRole('region', { name: 'Two-listing minimum variance', exact: true })
  const estimate = variance.getByRole('button', { name: 'Estimate portfolio variance', exact: true })
  const portfolioStatus = variance.getByRole('status')
  const portfolioTable = variance.getByRole('table', { name: 'Portfolio variance allocations' })
  const allocation = portfolioTable.getByRole('row', { name: /^Minimum sample variance / }).getByRole('cell')
  const portfolioDownload = async () => {
    const pending = page.waitForEvent('download')
    await variance.getByRole('button', { name: 'Download portfolio variance', exact: true }).click()
    const entry = await pending
    expect(entry.suggestedFilename()).toBe('two-listing-portfolio-variance.csv')
    return readFile(await entry.path(), 'utf8')
  }
  await estimate.click()
  await expect(portfolioStatus).toHaveText('4 of 6 paired intervals · A 6 · B 4')
  await expect(allocation).toHaveText(['50%', '50%', '0%', '0%'])
  const varianceFirst = await portfolioDownload()
  const varianceFields = varianceFirst.split('\r\n')[1].split(',')
  expect(varianceFields.slice(2, 12)).toEqual([utc(0), utc(6), utc(6), '60', '"A"', '"B"', '6', '6', '4', '4'])
  expect(Number(varianceFields[12])).toBeCloseTo(-1 / 300, 12)
  expect(varianceFields.slice(13)).toEqual(['"Minimum sample variance"', '5000', '5000', '0', '0'])
  await query(6, 7)
  await expect(portfolioStatus).toHaveText('6 of 6 paired intervals · A 6 · B 6')
  await query(6, 8)
  await expect(portfolioStatus).toHaveText('4 of 6 paired intervals · A 4 · B 6')
  await query(6, 1)
  await expect(portfolioStatus).toHaveText('1 of 6 paired intervals · A 1 · B 1')
  await expect(variance.getByText('At least two paired returns are needed to estimate variance.')).toBeVisible()
  await expect(portfolioTable).toHaveCount(0)
  expect((await portfolioDownload()).split('\r\n')[1].endsWith(',1,1,1,,,,,,')).toBe(true)
  await query(6, 6)
  expect(await portfolioDownload()).toBe(varianceFirst)
  await variance.getByLabel('Portfolio interval (seconds)').fill('70')
  await estimate.click()
  await expect(variance.getByRole('alert')).toHaveText(/end must fall on an interval boundary/)
  expect(await portfolioDownload()).toBe(varianceFirst)

  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(before)
})

test('downside deviation responds to known losses and reproduces its CSV after rewind', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start listing risk demo' }).click()
  const relative = page.getByRole('region', { name: 'Relative returns', exact: true })
  const cutoff = async minute => {
    await page.getByLabel('Effective time (UTC)', { exact: true }).fill(utc(6))
    await page.getByLabel('Known time (UTC)', { exact: true }).fill(utc(minute))
    await page.getByRole('button', { name: 'Run as-of query', exact: true }).click()
  }
  await cutoff(6)
  await page.getByText('Relative returns', { exact: true }).click()
  await relative.getByLabel('Left listing').selectOption('A')
  await relative.getByLabel('Right listing').selectOption('B')
  await relative.getByRole('button', { name: 'Compare returns' }).click()
  await relative.getByText('Rolling risk', { exact: true }).click()
  const view = relative.getByRole('region', { name: 'Rolling risk', exact: true })
  await view.getByRole('button', { name: 'Calculate risk', exact: true }).click()
  const table = view.getByRole('table', { name: 'Rolling listing risk', exact: true })
  const rowAt = minute => table.locator('tbody tr').filter({
    has: page.getByRole('rowheader', { name: utc(minute), exact: true }),
  })
  await view.getByRole('checkbox', { name: 'Show downside deviation', exact: true }).check()
  await expect(rowAt(3).getByRole('cell').nth(8)).toHaveText('1 / 1')
  await expect(rowAt(3).getByRole('cell').nth(9)).toHaveText('0.000000%')
  await expect(rowAt(3).getByRole('cell').nth(10)).toHaveText('10.000000%')
  const download = async () => {
    const pending = page.waitForEvent('download')
    await view.getByRole('button', { name: 'Download rolling risk', exact: true }).click()
    return readFile(await (await pending).path(), 'utf8')
  }
  const earlier = await download()
  expect(earlier.split('\r\n')[0].split(',').slice(-4)).toEqual([
    'left_loss_returns', 'right_loss_returns', 'left_downside_fraction', 'right_downside_fraction',
  ])
  await cutoff(7)
  await expect(rowAt(3).getByRole('cell').nth(8)).toHaveText('2 / 3')
  await expect(rowAt(3).getByRole('cell').nth(10)).toHaveText('8.164966%')
  await cutoff(8)
  await expect(rowAt(6).getByRole('cell').nth(7)).toHaveText('0 / 1')
  await cutoff(0)
  await expect(rowAt(3).getByRole('cell').nth(9)).toHaveText('—')
  await expect(rowAt(3).getByRole('cell').nth(10)).toHaveText('—')
  expect((await download()).split('\r\n')[1].split(',').slice(-4)).toEqual(['0', '0', '', ''])
  await cutoff(6)
  expect(await download()).toBe(earlier)
})
