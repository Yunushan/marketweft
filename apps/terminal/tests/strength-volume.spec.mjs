import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline TSI and Klinger preserve exact signals, pane settings and version 82', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = [header, ...[10, 11, 12, 12, 11, 10].map((center, index) =>
    [1748872800 + 60 * index, center, center + 1, center - 1, center, 10].join(','))].join('\n')
  await openImport(page, 'STRENGTHVOL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'STRENGTHVOL')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:STRENGTHVOL')

  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const indicators = page.getByRole('button', { name: /Indicators/ })
  await indicators.click()
  const supertrend = page.getByRole('form', { name: 'Primary chart Supertrend', exact: true })
  await supertrend.getByRole('checkbox', { name: 'Show Supertrend', exact: true }).check()
  await supertrend.getByRole('button', { name: 'Apply Supertrend', exact: true }).click()
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(81)

  async function apply(pane, name, prefix, periods) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    for (const [label, value] of Object.entries(periods)) {
      await form.getByLabel(prefix + ' ' + label + ' period (bars)', { exact: true }).fill(String(value))
    }
    const button = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await button.click()
    await expect(button).toBeEnabled()
  }
  await indicators.click()
  await apply('Primary', 'True Strength Index', 'TSI', { fast: 2, slow: 3, signal: 2 })
  await apply('Primary', 'Klinger Oscillator', 'Klinger', { fast: 1, slow: 2, signal: 2 })
  await apply('Comparison', 'Klinger Oscillator', 'Klinger', { fast: 2, slow: 3, signal: 1 })
  await page.keyboard.press('Escape')

  const tsi = primary.getByRole('group', { name: 'True Strength Index', exact: true })
  const klinger = pane => pane.getByRole('group', { name: 'Klinger Oscillator', exact: true })
  async function readouts() {
    await expect(tsi.locator('span')).toHaveText(['True Strength Index 2/3/2', 'Line -35.483871%', 'Signal -1.075269%'])
    await expect(klinger(primary).locator('span')).toHaveText(['Klinger Oscillator 1/2/2', 'Line -154.320988', 'Signal -116.255144'])
    await expect(klinger(comparison).locator('span')).toHaveText(['Klinger Oscillator 2/3/1', 'Line -81.790123', 'Signal -81.790123'])
  }
  await readouts()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [file] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [fields, ...rows] = (await readFile(await file.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['tsi_line_2_3_2', 'tsi_signal_2_3_2', 'klinger_line_1_2_2', 'klinger_signal_1_2_2']
    .map(field => fields.split(',').indexOf(field))
  expect(columns.every(index => index > 0)).toBe(true)
  const values = rows.map(row => columns.map(index => row.split(',')[index]))
  expect(values[1]).toEqual(['', '', '', ''])
  expect(values[3]).toEqual(['', '', '111.111111', '138.888889'])
  expect(values[5]).toEqual(['-35.483871', '-1.075269', '-154.320988', '-116.255144'])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(82)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(tsi).toHaveCount(backup === current ? 1 : 0)
    await expect(primary.getByRole('group', { name: 'Supertrend', exact: true })).toBeVisible()
  }
  await page.reload()
  await readouts()
})
