import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Stochastic RSI and Ultimate Oscillator keep independent periods and exact observed outputs offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-stochastic-rsi-ultimate.csv', import.meta.url), 'utf8')
  await openImport(page, 'MOMENTUM', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'MOMENTUM')

  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:MOMENTUM')
  await page.getByLabel('Comparison chart type').selectOption('opening-gap')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(67)

  await page.getByRole('button', { name: /Indicators/ }).click()
  async function setStudy(pane, name, fields) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    for (const [field, period] of Object.entries(fields)) {
      await form.getByLabel(name + ' ' + field + ' period (bars)', { exact: true }).fill(String(period))
    }
    const save = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await save.click()
    await expect(save).toBeEnabled()
    return { form, save }
  }
  await setStudy('Primary', 'Stochastic RSI', { 'Wilder RSI': 2, lookback: 2, '%K smoothing': 1, '%D': 2 })
  await setStudy('Comparison', 'Stochastic RSI', { 'Wilder RSI': 2, lookback: 3, '%K smoothing': 2, '%D': 1 })
  const { form, save } = await setStudy('Primary', 'Ultimate Oscillator', { short: 1, medium: 1, long: 3 })
  await expect(form.getByRole('alert')).toHaveText('The Ultimate Oscillator short, medium and long periods must increase in that order.')
  await form.getByLabel('Ultimate Oscillator medium period (bars)', { exact: true }).fill('2')
  await save.click()
  await expect(save).toBeEnabled()
  await setStudy('Comparison', 'Ultimate Oscillator', { short: 2, medium: 3, long: 4 })
  await page.keyboard.press('Escape')

  const stoch = pane => pane.getByRole('group', { name: 'Stochastic RSI', exact: true }).locator('span')
  const ultimate = pane => pane.getByRole('group', { name: 'Ultimate Oscillator', exact: true })
  async function expectStudies() {
    await expect(stoch(primary)).toHaveText(['Stochastic RSI 2/2/1/2', '%K 0%', '%D 0%'])
    await expect(stoch(comparison)).toHaveText(['Stochastic RSI 2/3/2/1', '%K 0%', '%D 0%'])
    await expect(ultimate(primary)).toHaveText('Ultimate Oscillator 1/2/3 0%')
    await expect(ultimate(comparison)).toHaveText('Ultimate Oscillator 2/3/4 2.857143%')
    await expect(page.getByLabel('Comparison chart type')).toHaveValue('opening-gap')
  }
  await expectStudies()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const [fields, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['stochastic_rsi_k_2_2_1_2', 'stochastic_rsi_d_2_2_1_2', 'ultimate_1_2_3']
    .map(key => fields.split(',').indexOf(key))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',,', ',,', ',,', '0,,64.166667', '0,0,21.428571', ',,', ',,', ',,',
    '100,,75', '0,50,21.428571', '100,50,42.857143', '0,50,12.380952', '0,0,3.571429', '0,0,0',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(68)
  expect(saved.manifest.series).toEqual(prior.manifest.series)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: {
      stochastic_rsi: { enabled: true, period: 2, stochRsiLookback: 2, stochRsiSmoothing: 1, stochRsiSignal: 2 },
      ultimate: { enabled: true, period: 1, ultimateMiddlePeriod: 2, ultimateLongPeriod: 3 },
    },
    comparison: {
      stochastic_rsi: { enabled: true, period: 2, stochRsiLookback: 3, stochRsiSmoothing: 2, stochRsiSignal: 1 },
      ultimate: { enabled: true, period: 2, ultimateMiddlePeriod: 3, ultimateLongPeriod: 4 },
    },
  })
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(ultimate(primary)).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expectStudies()
})
