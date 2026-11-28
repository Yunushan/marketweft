import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Choppiness and SMI preserve exact exports and independent pane settings offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-choppiness-and-smi.csv', import.meta.url), 'utf8')
  await openImport(page, 'REGIME', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'REGIME')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:REGIME')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const compare = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  await drawings.getByRole('button', { name: 'New anchored twap', exact: true }).click()
  const twap = drawings.getByRole('form', { name: 'Anchored TWAP', exact: true })
  await twap.getByLabel('Time (UTC)', { exact: true }).fill('2025-06-08T14:09:00Z')
  await twap.getByRole('button', { name: 'Save anchored twap', exact: true }).click()
  const retained = primary.getByRole('group', { name: 'Anchored TWAP values', exact: true })
  await expect(retained).toContainText('Anchored TWAP 7')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(71)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, window, smooth] of [['Primary', 2, 1], ['Comparison', 3, 2]]) {
    for (const [study, fields] of [
      ['Choppiness Index', [['Choppiness Index', window]]],
      ['Stochastic Momentum Index', [['SMI lookback', 2], ['SMI first EMA', smooth], ['SMI second EMA', smooth], ['SMI signal EMA', 2]]],
    ]) {
      const form = page.getByRole('form', { name: pane + ' chart ' + study, exact: true })
      await form.getByRole('checkbox', { name: 'Show ' + study, exact: true }).check()
      for (const [name, value] of fields) {
        await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(value))
      }
      const save = form.getByRole('button', { name: 'Apply ' + study, exact: true })
      await save.click()
      await expect(save).toBeEnabled()
    }
  }
  await page.keyboard.press('Escape')

  const choppiness = pane => pane.getByRole('group', { name: 'Choppiness Index', exact: true })
  const smi = pane => pane.getByRole('group', { name: 'Stochastic Momentum Index', exact: true })
  async function verifyReadouts() {
    await expect(choppiness(primary)).toHaveText('Choppiness Index 2 100')
    await expect(choppiness(compare)).toHaveText('Choppiness Index 3 63.092975')
    await expect(smi(primary).locator('span')).toHaveText(['Stochastic Momentum Index 2/1/1/2', 'Line 100%', 'Signal 0%'])
    await expect(smi(compare).locator('span')).toHaveText(['Stochastic Momentum Index 2/2/2/2', 'Line 22.112398%', 'Signal 7.518532%'])
  }
  await verifyReadouts()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['choppiness_2', 'stochastic_momentum_line_2_1_1_2', 'stochastic_momentum_signal_2_1_1_2']
    .map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',,', '100,100,', '0,100,100', '200,33.333333,55.555555', '0,0,18.518518',
    ',,', ',,', '0,-100,', '100,100,0',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(72)
  expect(current.manifest.preferences.annotations).toEqual(prior.manifest.preferences.annotations)
  expect(current.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(choppiness(primary)).toHaveCount(backup === prior ? 0 : 1)
    await expect(retained).toContainText('Anchored TWAP 7')
  }
  await page.reload()
  await verifyReadouts()
})
