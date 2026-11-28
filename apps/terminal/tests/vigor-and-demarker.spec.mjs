import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('DeMarker and Relative Vigor keep signed outputs and distinct undefined and zero values offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const fixture = new URL('../../../crates/core/tests/fixtures/synthetic-demarker-vigor.csv', import.meta.url)
  await openImport(page, 'VIGOR', await readFile(fixture, 'utf8'))
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'VIGOR')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:VIGOR')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await drawings.getByRole('button', { name: 'New fibonacci channel', exact: true }).click()
  const channel = drawings.getByRole('form', { name: 'Fibonacci channel' })
  for (const [name, time, price] of [
    ['Baseline start', '14:00:00', -2], ['Baseline end', '14:04:00', 2], ['Width anchor', '14:02:00', 4],
  ]) {
    const anchor = channel.getByRole('group', { name, exact: true })
    await anchor.getByLabel('Time (UTC)').fill('2025-06-03T' + time + 'Z')
    await anchor.getByLabel('Price').fill(String(price))
  }
  await channel.getByRole('button', { name: 'Save fibonacci channel' }).click()
  await expect(drawings.getByText('Fibonacci channel levels', { exact: true })).toBeVisible()
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(65)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', 2], ['Comparison', 3]]) {
    for (const name of ['DeMarker', 'Relative Vigor Index']) {
      const form = page.getByRole('form', { name: pane + ' chart ' + name })
      await form.getByLabel('Show ' + name).check()
      await form.getByLabel(name + ' period (bars)').fill(String(period))
      const save = form.getByRole('button', { name: 'Apply ' + name })
      await save.click()
      await expect(save).toBeEnabled()
    }
  }
  await page.keyboard.press('Escape')
  const demark = pane => pane.getByRole('group', { name: 'DeMarker' })
  const vigor = pane => pane.getByRole('group', { name: 'Relative Vigor Index' }).locator('span')
  async function expectStudies() {
    await expect(demark(primary)).toHaveText('DeMarker 2 66.666667%')
    await expect(demark(comparison)).toHaveText('DeMarker 3 50%')
    await expect(vigor(primary)).toHaveText(['Relative Vigor Index 2', 'Vigor 2.739726%', 'Signal 7.527328%'])
    await expect(vigor(comparison)).toHaveText(['Relative Vigor Index 3', 'Vigor 2.912621%', 'Signal 9.64549%'])
  }
  await expectStudies()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const [fields, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['demarker_2', 'relative_vigor_value_2', 'relative_vigor_signal_2'].map(key => fields.split(',').indexOf(key))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',,', ',,', '66.666667,,', '75,,', '100,17.647059,', '66.666667,28.787879,',
    '66.666667,26.984127,', '100,12.280702,23.578629', ',0,17.886256', ',-14.285714,6.20997',
    ',-40,-9.381788', ',,', ',,', '66.666667,50,', '66.666667,20.833333,', '0,6.25,',
    '66.666667,4.545455,18.118687', '66.666667,2.739726,7.527328',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(66)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { demarker: { enabled: true, period: 2 }, relative_vigor: { enabled: true, period: 2 } },
    comparison: { demarker: { enabled: true, period: 3 }, relative_vigor: { enabled: true, period: 3 } },
  })
  expect(saved.manifest.preferences.annotations).toEqual(prior.manifest.preferences.annotations)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(drawings.getByText('Fibonacci channel levels', { exact: true })).toBeVisible()
    await expect(demark(primary)).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expectStudies()
})
