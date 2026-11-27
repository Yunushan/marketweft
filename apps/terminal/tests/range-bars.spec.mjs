import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, selectBackup } from './catalog-fixtures.mjs'

test('recorded range bars preserve exact observed cutoffs and export the trade that crosses a gap', async ({ page, context }) => {
  const reference = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-range-bars.csv', import.meta.url), 'utf8')
  const csv = reference.replaceAll('LOCAL:RANGE', 'NASDAQ:NVDA')
  await page.goto('/')
  const before = await downloadWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const open = page.getByRole('button', { name: 'Recorded range bars' })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Recorded range bars' })).toBeFocused()
  await page.getByLabel('Trades CSV').setInputFiles({
    name: 'observed-ranges.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  })
  const range = page.getByLabel('Price range (price units)')
  const cutoff = page.getByLabel('Known through (UTC, optional)')
  const build = page.getByRole('button', { name: 'Build range bars' })
  const chart = page.getByRole('region', { name: 'Range bar chart' })
  await range.fill('2')
  await cutoff.fill('9')
  await build.click()
  await expect(page.getByRole('status')).toHaveText('No trades were observed by the selected cutoff.')
  await cutoff.fill('10')
  await build.click()
  await expect(chart.getByText(/Range 1\.999999 \/ 2 · Provisional · 2 trades/))
    .toContainText('9007199254740993–9007199254740994')
  await cutoff.fill('11')
  await build.click()
  await expect(chart.getByText(/Range 2 \/ 2 · Complete · 3 trades/))
    .toContainText('9007199254740993–9007199254740995')

  const download = async () => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download range bars' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('NASDAQ-NVDA-range-bars.csv')
    return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
  }
  const historical = await download()
  expect(historical[1]).toBe('"NASDAQ:NVDA",10,11,9007199254740993,9007199254740995,3,2,2,true,-3,-1,-3,-1,0.875')
  await cutoff.fill('14')
  await build.click()
  await expect(chart.getByTestId('viewport')).toHaveText('1–3 of 3')
  await expect(chart.getByText(/Range 0 \/ 2 · Provisional · 1 trades/)).toContainText('9007199254740998')
  const gap = await download()
  expect(gap.slice(0, 2)).toEqual(historical)
  expect(gap[2]).toBe('"NASDAQ:NVDA",12,14,9007199254740996,9007199254740997,2,2,8,true,0,8,0,8,2.25')
  await range.fill('0')
  await build.click()
  await expect(page.getByRole('alert')).toHaveText(/positive six-place price range/)
  expect(await download()).toEqual(gap)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
  expect((await downloadWorkspace(page)).manifest).toEqual(before.manifest)
})

test('recorded range sizes restore independently for the two panes without storing a trade file', async ({ page, context }) => {
  await page.goto('/')
  const original = await downloadWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primary = page.getByRole('button', { name: 'Recorded range bars', exact: true })
  const comparison = page.getByRole('button', { name: 'Comparison range bars', exact: true })
  const size = page.getByLabel('Price range (price units)')
  const save = page.getByRole('button', { name: 'Save range size for this pane' })
  const back = page.getByRole('button', { name: 'Return to workspace' })
  await page.getByRole('button', { name: 'Compare charts' }).click()
  for (const [button, value] of [[primary, '2.125'], [comparison, '3.5']]) {
    await button.click()
    await expect(size).toHaveValue('1')
    await size.fill(value)
    await save.click()
    await expect(page.getByText('Range size saved for this pane.')).toBeVisible()
    await back.click()
    await expect(button).toBeFocused()
  }

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(14)
  expect(current.manifest.preferences.rangeTicks).toEqual({ primary: 2_125_000, comparison: 3_500_000 })
  expect(current.manifest.series).toEqual(original.manifest.series)
  await page.reload()
  for (const [button, value] of [[primary, '2.125'], [comparison, '3.5']]) {
    await button.click()
    await expect(size).toHaveValue(value)
    await back.click()
  }
  for (const [backup, value] of [[original, '1'], [current, '2.125']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await primary.click()
    await expect(size).toHaveValue(value)
    await back.click()
  }
  await comparison.click()
  await expect(size).toHaveValue('3.5')
})
