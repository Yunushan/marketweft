import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Acceleration Bands retain exact ranges, gaps and independent pane settings offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-acceleration-bands.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)

  await openImport(page, 'ACCELERATION', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'ACCELERATION')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:ACCELERATION')
  await expect(instrument).toBeEnabled()
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBeLessThan(87)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', '2'], ['Comparison', '3']]) {
    const form = page.getByRole('form', { name: pane + ' chart Acceleration Bands', exact: true })
    await form.getByRole('checkbox', { name: 'Show Acceleration Bands', exact: true }).check()
    const input = form.getByLabel('Acceleration Bands period (bars)', { exact: true })
    await expect(input).toHaveValue('20')
    await input.fill(period)
    const apply = form.getByRole('button', { name: 'Apply Acceleration Bands', exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await page.keyboard.press('Escape')

  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const band = pane => pane.getByRole('group', { name: 'Acceleration Bands', exact: true })
  const values = pane => band(pane).locator(':scope > span')
  await expect(values(primary)).toHaveText(['Acceleration Bands 2', 'Lower 1.333333', 'Middle 5', 'Upper 11.333333'])
  await expect(values(comparison)).toHaveText(['Acceleration Bands 3', 'Lower 0.888889', 'Middle 3.5', 'Upper 9.222222'])

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['acceleration_bands_lower_2', 'acceleration_bands_middle_2', 'acceleration_bands_upper_2'],
    ['', '', ''],
    ['0.8', '11', '25.8'],
    ['-1', '7.5', '24'],
    ['', '', ''],
    ['', '', ''],
    ['-0.666667', '3.25', '11.833333'],
    ['1.333333', '5', '11.333333'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(87)
  expect(current.manifest.preferences.studies.primary.acceleration_bands).toEqual({ enabled: true, period: 2 })
  expect(current.manifest.preferences.studies.comparison.acceleration_bands).toEqual({ enabled: true, period: 3 })
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    if (backup === previous) await expect(band(primary)).toHaveCount(0)
    else await expect(values(comparison)).toContainText(['Upper 9.222222'])
  }
  await page.reload()
  await expect(band(primary)).toContainText('Upper 11.333333')
  await expect(band(comparison)).toContainText('Upper 9.222222')
})
