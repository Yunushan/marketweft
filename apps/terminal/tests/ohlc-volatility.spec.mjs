import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('OHLC volatility preserves zero, warm-up and missing values in offline CSV and workspace restore', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-ohlc-volatility.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'OHLCVOL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'OHLCVOL')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:OHLCVOL')
  const earlier = await downloadWorkspace(page)
  expect(earlier.version).toBeLessThan(95)

  const garmanKlass = 'Garman–Klass Volatility'
  const rogersSatchell = 'Rogers–Satchell Volatility'
  await page.getByRole('button', { name: /Indicators/ }).click()
  async function enable(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    const input = form.getByLabel(name + ' period (bars)', { exact: true })
    await expect(input).toHaveValue('20')
    await input.fill(String(period))
    await form.getByRole('button', { name: 'Apply ' + name, exact: true }).click()
  }
  await enable('Primary', garmanKlass, 2)
  await enable('Primary', rogersSatchell, 2)
  await enable('Comparison', rogersSatchell, 3)
  await page.keyboard.press('Escape')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  async function verifyLegends() {
    await expect(primary.getByRole('group', { name: garmanKlass, exact: true })).toHaveText(garmanKlass + ' 2 13.207976%')
    await expect(primary.getByRole('group', { name: rogersSatchell, exact: true })).toHaveText(rogersSatchell + ' 2 13.417559%')
    await expect(comparison.getByRole('group', { name: rogersSatchell, exact: true })).toHaveText(rogersSatchell + ' 3 10.955391%')
  }
  await verifyLegends()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['garman_klass_2', 'rogers_satchell_2'].map(name => header.split(',').indexOf(name))
  expect(columns.every(column => column > 0)).toBe(true)
  expect(rows.map(row => columns.map(column => row.split(',')[column]).join(','))).toEqual([
    ',', '17.264331,16.785301', '10.425941,9.834238', '0,0', ',', ',', ',', '3.911744,0', '12.37314,11.969673',
    '13.207976,13.417559',
  ])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(95)
  expect(saved.manifest.preferences.studies.primary.garman_klass).toEqual({ enabled: true, period: 2 })
  expect(saved.manifest.preferences.studies.primary.rogers_satchell).toEqual({ enabled: true, period: 2 })
  expect(saved.manifest.preferences.studies.comparison.rogers_satchell).toEqual({ enabled: true, period: 3 })
  for (const backup of [earlier, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    if (backup === earlier) await expect(primary.getByRole('group', { name: garmanKlass, exact: true })).toHaveCount(0)
    else await verifyLegends()
  }
  await page.reload()
  await verifyLegends()
})
