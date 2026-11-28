import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline volume studies retain exact signed output, genuine zero and independent settings', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-volume-change-studies.csv', import.meta.url), 'utf8')
  await openImport(page, 'VOLUMECHANGE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'VOLUMECHANGE')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:VOLUMECHANGE')

  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const indicators = page.getByRole('button', { name: /Indicators/ })
  async function applyStudy(pane, name, periods) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    for (const [label, period] of periods) {
      await form.getByLabel(label + ' period (bars)', { exact: true }).fill(String(period))
    }
    const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await indicators.click()
  await applyStudy('Primary', 'Vertical Horizontal Filter', [['Vertical Horizontal Filter', 2]])
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(76)

  await indicators.click()
  await applyStudy('Primary', 'Volume Rate of Change', [['Volume Rate of Change', 2]])
  await applyStudy('Comparison', 'Volume Rate of Change', [['Volume Rate of Change', 1]])
  const oscillator = page.getByRole('form', { name: 'Primary chart Volume Oscillator', exact: true })
  await applyStudy('Primary', 'Volume Oscillator', [['Volume Oscillator fast', 3], ['Volume Oscillator slow', 2]])
  await expect(oscillator.getByRole('alert')).toHaveText('The Volume Oscillator fast period must be shorter than the slow period.')
  await applyStudy('Primary', 'Volume Oscillator', [['Volume Oscillator fast', 2], ['Volume Oscillator slow', 3]])
  await page.keyboard.press('Escape')
  const rate = pane => pane.getByRole('group', { name: 'Volume Rate of Change', exact: true })
  const result = primary.getByRole('group', { name: 'Volume Oscillator', exact: true })
  async function verifyStudies() {
    await expect(rate(primary)).toHaveText('Volume Rate of Change 2 -37.5%')
    await expect(rate(comparison)).toHaveText('Volume Rate of Change 1 -64.285714%')
    await expect(result).toHaveText('Volume Oscillator 2/3 0.125')
  }
  await verifyStudies()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['vroc_2', 'volume_oscillator_2_3'].map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',', ',', '-100,-0.333333', ',0.333333', ',0.666667', '0,0', '75,0.25', '-37.5,0.125',
  ])
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(77)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(result).toHaveCount(backup === current ? 1 : 0)
    await expect(primary.getByRole('group', { name: 'Vertical Horizontal Filter', exact: true })).toBeVisible()
  }
  await page.reload()
  await verifyStudies()
})
