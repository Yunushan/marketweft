import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, selectBackup } from './catalog-fixtures.mjs'

test('notional bars complete on whole observed trades and export exact signed evidence offline', async ({ page, context }) => {
  const fixture = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-notional-trades.csv', import.meta.url), 'utf8')
  await page.goto('/')
  const original = await downloadWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const open = page.getByRole('button', { name: 'Recorded notional bars', exact: true })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Recorded notional bars' })).toBeFocused()
  await page.getByLabel('Trades CSV').setInputFiles({
    name: 'notional-trades.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture),
  })
  const size = page.getByLabel('Notional per bar (quote units)')
  const cutoff = page.getByLabel('Known through (UTC, optional)')
  const build = page.getByRole('button', { name: 'Build notional bars' })
  const chart = page.getByRole('region', { name: 'Notional bar chart' })
  await size.fill('5')
  await cutoff.fill('2025-06-02T13:59:59Z')
  await build.click()
  await expect(page.getByRole('status')).toHaveText('No trades were observed by the selected cutoff.')

  async function at(second) {
    await cutoff.fill('2025-06-02T14:00:0' + second + 'Z')
    await build.click()
    await expect(chart.getByText(/Known through/)).toContainText('14:00:0' + second + 'Z')
  }
  async function download() {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download notional bars' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('NASDAQ-NVDA-notional-bars.csv')
    return readFile(await file.path(), 'utf8')
  }

  await at(1)
  await expect(chart.getByText(/Notional 2\.000003000001 \/ 5 · Provisional · 2 trades/)).toContainText('9007199254740993–9007199254740994')
  const early = await download()
  expect(early.split('\r\n')[1]).toBe('"NASDAQ:NVDA",1748872800,1748872800,9007199254740993,9007199254740994,2,5,2.000003000001,false,-2.000001,0,-2.000001,0,1.250001')
  await at(2)
  await expect(chart.getByText(/Notional 5\.000003000001 \/ 5 · Complete · 3 trades/)).toContainText('9007199254740995')
  const complete = (await download()).split('\r\n')[1]
  expect(complete).toBe('"NASDAQ:NVDA",1748872800,1748872802,9007199254740993,9007199254740995,3,5,5.000003000001,true,-2.000001,3,-2.000001,3,2.250001')
  await at(5)
  await expect(chart.getByTestId('viewport')).toHaveText('1–4 of 4')
  await expect(chart.getByText(/Notional 0\.8000008 \/ 5 · Provisional · 1 trade/)).toContainText('9007199254740998')
  const final = await download()
  const rows = final.split('\r\n')
  expect(rows[1]).toBe(complete)
  expect(rows[2]).toContain(',1,5,5,true,5,5,5,5,1')
  expect(rows[3]).toContain(',9007199254740997,9007199254740997,1,5,5.2500005,true,-10.500001,-10.500001,-10.500001,-10.500001,0.5')
  await size.fill('5.0000001')
  await build.click()
  await expect(page.getByRole('alert')).toHaveText('Use a positive six-place notional target.')
  expect(await download()).toBe(final)
  await size.fill('5')
  await at(1)
  expect(await download()).toBe(early)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
  expect((await downloadWorkspace(page)).manifest).toEqual(original.manifest)
})

test('notional targets restore separately for each pane alongside an older volume target', async ({ page, context }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primary = page.getByRole('button', { name: 'Recorded notional bars', exact: true })
  const comparison = page.getByRole('button', { name: 'Comparison notional bars', exact: true })
  const back = page.getByRole('button', { name: 'Return to workspace' })
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByRole('button', { name: 'Recorded volume bars', exact: true }).click()
  await page.getByLabel('Volume per bar').fill('2.5')
  await page.getByRole('button', { name: 'Save volume target for this pane' }).click()
  await expect(page.getByText('Volume target saved for this pane.')).toBeVisible()
  await back.click()
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(15)

  const size = page.getByLabel('Notional per bar (quote units)')
  for (const [button, value] of [[primary, '5'], [comparison, '7.125001']]) {
    await button.click()
    await expect(size).toHaveValue('1000')
    await size.fill(value)
    await page.getByRole('button', { name: 'Save notional target for this pane' }).click()
    await expect(page.getByText('Notional target saved for this pane.')).toBeVisible()
    await back.click()
    await expect(button).toBeFocused()
  }
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(86)
  expect(saved.manifest.preferences.notionalTicks).toEqual({ primary: 5_000_000, comparison: 7_125_001 })
  expect(saved.manifest.preferences.volumeTicks).toEqual({ primary: 2_500_000 })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  for (const [bundle, expected] of [[legacy, '1000'], [saved, '5']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await primary.click()
    await expect(size).toHaveValue(expected)
    await back.click()
  }
  await page.reload()
  await comparison.click()
  await expect(size).toHaveValue('7.125001')
})
