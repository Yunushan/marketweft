import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, selectBackup } from './catalog-fixtures.mjs'

test('volume bars split one observed print across exact offline bars and preserve the completed prefix', async ({ page, context }) => {
  const fixture = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-volume-bars.csv', import.meta.url), 'utf8')
  await page.goto('/')
  const before = await downloadWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const open = page.getByRole('button', { name: 'Recorded volume bars', exact: true })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Recorded volume bars' })).toBeFocused()
  await page.getByLabel('Trades CSV').setInputFiles({
    name: 'captured-volume.csv', mimeType: 'text/csv',
    buffer: Buffer.from(fixture.replaceAll('LOCAL:VOLUME', 'NASDAQ:NVDA')),
  })
  const size = page.getByLabel('Volume per bar')
  const cutoff = page.getByLabel('Known through (UTC, optional)')
  const build = page.getByRole('button', { name: 'Build volume bars' })
  const chart = page.getByRole('region', { name: 'Volume bar chart' })
  await size.fill('2.5')
  await cutoff.fill('9')
  await build.click()
  await expect(page.getByRole('status')).toHaveText('No trades were observed by the selected cutoff.')
  await cutoff.fill('10')
  await build.click()
  await expect(chart.getByText(/Volume 2\.499999 \/ 2\.5 · Provisional · 2 contributing trades/))
    .toContainText('9007199254740993–9007199254740994')

  const download = async () => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download volume bars' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('NASDAQ-NVDA-volume-bars.csv')
    return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
  }
  await cutoff.fill('11')
  await build.click()
  await expect(chart.getByTestId('viewport')).toHaveText('1–2 of 2')
  await expect(chart.getByText(/Volume 0\.5 \/ 2\.5 · Provisional/)).toContainText('9007199254740995')
  const exact = await download()
  expect(exact[1]).toBe('"NASDAQ:NVDA",10,11,9007199254740993,9007199254740995,3,0.125,0.000001,2.5,true,-3,1,-3,1,2.5')
  expect(exact[2]).toBe('"NASDAQ:NVDA",11,11,9007199254740995,9007199254740995,1,0.5,0.5,2.5,false,1,1,1,1,0.5')

  await cutoff.fill('14')
  await build.click()
  await expect(chart.getByTestId('viewport')).toHaveText('1–4 of 4')
  await expect(chart.getByText(/Volume 1\.5 \/ 2\.5 · Provisional/)).toContainText('9007199254740996')
  const split = await download()
  expect(split.slice(0, 2)).toEqual(exact.slice(0, 2))
  expect(split[2]).toBe('"NASDAQ:NVDA",11,14,9007199254740995,9007199254740996,2,0.5,2,2.5,true,1,8,1,8,2.5')
  expect(split[3]).toBe('"NASDAQ:NVDA",14,14,9007199254740996,9007199254740996,1,2.5,2.5,2.5,true,8,8,8,8,2.5')
  expect(split[4]).toBe('"NASDAQ:NVDA",14,14,9007199254740996,9007199254740996,1,1.5,1.5,2.5,false,8,8,8,8,1.5')

  await size.fill('0.000001')
  await build.click()
  await expect(page.getByRole('alert')).toHaveText(/Increase the target volume/)
  expect(await download()).toEqual(split)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
  expect((await downloadWorkspace(page)).manifest).toEqual(before.manifest)
})

test('saved volume targets are set separately for the two panes and restore with range preferences', async ({ page, context }) => {
  await page.goto('/')
  const legacy = await downloadWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primary = page.getByRole('button', { name: 'Recorded volume bars', exact: true })
  const comparison = page.getByRole('button', { name: 'Comparison volume bars', exact: true })
  const back = page.getByRole('button', { name: 'Return to workspace' })
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByRole('button', { name: 'Recorded range bars', exact: true }).click()
  await page.getByLabel('Price range (price units)').fill('1.125')
  await page.getByRole('button', { name: 'Save range size for this pane' }).click()
  await expect(page.getByText('Range size saved for this pane.')).toBeVisible()
  await back.click()
  const rangeBackup = await downloadWorkspace(page)
  expect(rangeBackup.version).toBe(14)

  const size = page.getByLabel('Volume per bar')
  for (const [button, value] of [[primary, '2.5'], [comparison, '7.125']]) {
    await button.click()
    await expect(size).toHaveValue('100')
    await size.fill(value)
    await page.getByRole('button', { name: 'Save volume target for this pane' }).click()
    await expect(page.getByText('Volume target saved for this pane.')).toBeVisible()
    await back.click()
    await expect(button).toBeFocused()
  }
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(15)
  expect(current.manifest.preferences.rangeTicks).toEqual({ primary: 1_125_000 })
  expect(current.manifest.preferences.volumeTicks).toEqual({ primary: 2_500_000, comparison: 7_125_000 })
  expect(current.manifest.series).toEqual(legacy.manifest.series)

  for (const [bundle, expected] of [[rangeBackup, '100'], [current, '2.5']]) {
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
  await expect(size).toHaveValue('7.125')
})
