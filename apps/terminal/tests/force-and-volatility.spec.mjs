import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Elder Force Index and Chaikin Volatility keep exact signed CSV and independent offline settings', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2026-01-01T09:00:00Z') / 1000
  const csv = [header, ...[[0, 1, 2, 0, 1, 1], [60, 1, 4, 0, 3, 2], [120, 3, 4, -2, -1, 1],
    [300, -1, 3, -1, 2, 3], [360, 2, 3, 1, 2, 0], [420, 2, 5, 1, 2, 2]].map(([dt, ...values]) =>
    [start + dt, ...values].join(','))].join('\n')
  await openImport(page, 'FORCEVOL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'FORCEVOL')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:FORCEVOL')
  const menu = page.getByRole('button', { name: /Indicators/ })
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })

  async function apply(pane, name, periods = {}) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    for (const [label, value] of Object.entries(periods)) {
      await form.getByLabel(label + ' period (bars)', { exact: true }).fill(String(value))
    }
    const save = form.getByRole('button', { name: 'Apply ' + name })
    await save.click()
    await expect(save).toBeEnabled()
  }
  await menu.click()
  await apply('Primary', 'Balance of Power')
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(58)

  await menu.click()
  await apply('Primary', 'Elder Force Index', { 'Elder Force Index': 2 })
  await apply('Primary', 'Chaikin Volatility', { 'Chaikin Volatility smoothing': 2, 'Chaikin Volatility comparison': 2 })
  await apply('Comparison', 'Chaikin Volatility', { 'Chaikin Volatility smoothing': 1, 'Chaikin Volatility comparison': 1 })
  await page.keyboard.press('Escape')
  const force = primary.getByRole('group', { name: 'Elder Force Index' })
  const volatility = primary.getByRole('group', { name: 'Chaikin Volatility' })
  const compared = comparison.getByRole('group', { name: 'Chaikin Volatility' })
  await expect(force).toHaveText('Elder Force Index 2 0.666667')
  await expect(volatility).toHaveText('Chaikin Volatility 2/2 -17.094001%')
  await expect(compared).toHaveText('Chaikin Volatility 1/1 100%')

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const [fields, ...rows] = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  for (const [key, expected] of Object.entries({
    elder_force_2: ['', '', '0', '6', '2', '0.666667'],
    chaikin_volatility_2_2: ['', '', '', '44.444433', '-44.44444', '-17.094001'],
  })) {
    const index = fields.split(',').indexOf(key)
    expect(index).toBeGreaterThan(0)
    expect(rows.map(line => line.split(',')[index])).toEqual(expected)
  }

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(59)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { bop: { enabled: true }, elder_force: { enabled: true, period: 2 },
      chaikin_volatility: { enabled: true, period: 2, volatilityLookback: 2 } },
    comparison: { chaikin_volatility: { enabled: true, period: 1, volatilityLookback: 1 } },
  })
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primary.getByRole('group', { name: 'Balance of Power' })).toBeVisible()
    await expect(force).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expect(volatility).toHaveText('Chaikin Volatility 2/2 -17.094001%')
  await expect(compared).toHaveText('Chaikin Volatility 1/1 100%')
})
