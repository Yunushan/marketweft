import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('PPO signal recovery, signed normalized range and pane settings are exact offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-normalized-indicators.csv', import.meta.url), 'utf8')
  await openImport(page, 'NORMALIZED', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'NORMALIZED')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:NORMALIZED')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const indicators = page.getByRole('button', { name: /Indicators/ })
  await indicators.click()
  const previousStudy = page.getByRole('form', { name: 'Comparison chart Ultimate Oscillator', exact: true })
  await previousStudy.getByRole('checkbox', { name: 'Show Ultimate Oscillator', exact: true }).check()
  const previousSave = previousStudy.getByRole('button', { name: 'Apply Ultimate Oscillator', exact: true })
  await previousSave.click()
  await expect(previousSave).toBeEnabled()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(68)

  await indicators.click()
  for (const [pane, signal, range] of [['Primary', 2, 1], ['Comparison', 1, 2]]) {
    const ppo = page.getByRole('form', { name: pane + ' chart PPO', exact: true })
    await ppo.getByRole('checkbox', { name: 'Show PPO', exact: true }).check()
    const ppoSave = ppo.getByRole('button', { name: 'Apply PPO', exact: true })
    const slow = ppo.getByLabel('PPO slow period (bars)', { exact: true })
    await ppo.getByLabel('PPO fast period (bars)', { exact: true }).fill('1')
    if (pane === 'Primary') {
      await slow.fill('1')
      await ppoSave.click()
      await expect(ppo.getByRole('alert')).toHaveText('The PPO fast period must be shorter than the slow period.')
    }
    await slow.fill('2')
    await ppo.getByLabel('PPO signal period (bars)', { exact: true }).fill(String(signal))
    await ppoSave.click()
    await expect(ppoSave).toBeEnabled()

    const natr = page.getByRole('form', { name: pane + ' chart Normalized ATR', exact: true })
    await natr.getByRole('checkbox', { name: 'Show Normalized ATR', exact: true }).check()
    await natr.getByLabel('Normalized ATR period (bars)', { exact: true }).fill(String(range))
    const natrSave = natr.getByRole('button', { name: 'Apply Normalized ATR', exact: true })
    await natrSave.click()
    await expect(natrSave).toBeEnabled()
  }
  await page.keyboard.press('Escape')
  const price = pane => pane.getByRole('group', { name: 'Percentage Price Oscillator', exact: true })
  const range = pane => pane.getByRole('group', { name: 'Normalized Average True Range', exact: true })
  async function expectStudies() {
    await expect(price(primary).locator('span')).toHaveText(['PPO 1/2/2', 'Line 0%', 'Signal 8.333333%', 'Histogram -8.333333%'])
    await expect(price(comparison).locator('span')).toHaveText(['PPO 1/2/1', 'Line 0%', 'Signal 0%', 'Histogram 0%'])
    await expect(range(primary)).toHaveText('Normalized ATR 1 0%')
    await expect(range(comparison)).toHaveText('Normalized ATR 2 45.04395%')
  }
  await expectStudies()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['ppo_line_1_2_2', 'ppo_signal_1_2_2', 'ppo_histogram_1_2_2', 'natr_1']
    .map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',,,-33.333333', '-100,,,', '200,50,150,133.333333', ',,,-800', '50,,,150', '0,25,-25,50',
    '100,75,25,-175', '0,25,-25,-100', ',,,300', '50,,,66.666667', '0,25,-25,50', '0,8.333333,-8.333333,0',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(69)
  expect(current.manifest.series).toEqual(prior.manifest.series)
  expect(current.manifest.preferences.studies.comparison.ultimate)
    .toEqual(prior.manifest.preferences.studies.comparison.ultimate)
  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(range(primary)).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expectStudies()
})
