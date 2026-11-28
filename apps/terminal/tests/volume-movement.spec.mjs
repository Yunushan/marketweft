import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('volume studies keep signed values, a blank index and independent chart settings offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-volume-movement.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'VOLUMEMOVE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'VOLUMEMOVE')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:VOLUMEMOVE')
  const earlier = await downloadWorkspace(page)
  expect(earlier.version).toBeLessThan(93)
  const movement = 'Ease of Movement'
  const index = 'Negative Volume Index'
  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', '3'], ['Comparison', '4']]) {
    const form = page.getByRole('form', { name: pane + ' chart ' + movement, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + movement, exact: true }).check()
    await expect(form.getByLabel(movement + ' period (bars)', { exact: true })).toHaveValue('14')
    await form.getByLabel(movement + ' period (bars)', { exact: true }).fill(period)
    await form.getByRole('button', { name: 'Apply ' + movement, exact: true }).click()
  }
  const indexForm = page.getByRole('form', { name: 'Primary chart ' + index, exact: true })
  await indexForm.getByRole('checkbox', { name: 'Show ' + index, exact: true }).check()
  await indexForm.getByRole('button', { name: 'Apply ' + index, exact: true }).click()
  await page.keyboard.press('Escape')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  async function verifyLegends() {
    await expect(primary.getByRole('group', { name: movement, exact: true })).toHaveText('Ease of Movement 3 5.333333')
    await expect(comparison.getByRole('group', { name: movement, exact: true })).toHaveText('Ease of Movement 4 -0.5')
    await expect(primary.getByRole('group', { name: index, exact: true })).toHaveText('Negative Volume Index 1800')
  }
  await verifyLegends()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['ease_of_movement_3', 'negative_volume_index'].map(name => header.split(',').indexOf(name))
  expect(columns.every(column => column > 0)).toBe(true)
  expect(rows.map(row => columns.map(column => row.split(',')[column]).join(','))).toEqual([
    ',1000', ',1200', ',1200', '0.333333,1200', '-1.666667,1066.666667', '-2.333333,1066.666667',
    '-1.333333,1200', '-6,1200', '-3.333333,', '-0.666667,1800', '5.333333,1800',
  ])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(93)
  expect(saved.manifest.preferences.studies.primary.negative_volume_index).toEqual({ enabled: true })
  expect(saved.manifest.preferences.studies.primary.ease_of_movement).toEqual({ enabled: true, period: 3 })
  expect(saved.manifest.preferences.studies.comparison.ease_of_movement).toEqual({ enabled: true, period: 4 })
  for (const backup of [earlier, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    if (backup === earlier) await expect(primary.getByRole('group', { name: movement, exact: true })).toHaveCount(0)
    else await verifyLegends()
  }
  await page.reload()
  await verifyLegends()
})
