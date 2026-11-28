import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline ATR overlays preserve exact direction, signed exit levels and pane settings', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-atr-overlays.csv', import.meta.url), 'utf8')
  await openImport(page, 'ATRTREND', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'ATRTREND')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:ATRTREND')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const indicators = page.getByRole('button', { name: /Indicators/ })
  async function applyStudy(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(period))
    const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await indicators.click()
  await applyStudy('Primary', 'Linear Regression Slope', 3)
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(80)
  await indicators.click()
  await applyStudy('Primary', 'Supertrend', 1)
  await applyStudy('Comparison', 'Supertrend', 2)
  await applyStudy('Primary', 'Chandelier Exit', 2)
  await page.keyboard.press('Escape')

  const trend = pane => pane.getByRole('group', { name: 'Supertrend', exact: true }).locator('span')
  const exit = primary.getByRole('group', { name: 'Chandelier Exit', exact: true }).locator('span')
  async function verifyReadouts() {
    await expect(trend(primary)).toHaveText(['Supertrend 1', 'Up -11', 'Down —'])
    await expect(trend(comparison)).toHaveText(['Supertrend 2', 'Up —', 'Down -0.929686'])
    await expect(exit).toHaveText(['Chandelier Exit 2', 'Long -12.517577', 'Short 0.517577'])
  }
  await verifyReadouts()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [file] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await file.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const names = ['supertrend_up_1', 'supertrend_down_1', 'chandelier_exit_long_2', 'chandelier_exit_short_2']
  const indices = names.map(name => header.split(',').indexOf(name))
  expect(indices.every(index => index > 0)).toBe(true)
  expect(rows.map(row => indices.map(index => row.split(',')[index]).join(','))).toEqual([
    ',0,,', '0,,-0.5,1.5', '0,,-0.25,3.25', '0,,-0.125,6.125',
    ',5,-5.5625,8.5625', ',5,-10.28125,5.28125', ',5,-19.140625,4.140625',
    ',-7,-19.070314,-1.929686', ',-7,-16.035157,-0.964843', '-11,,-12.517577,0.517577',
  ])
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(81)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(exit).toHaveCount(backup === current ? 3 : 0)
    await expect(primary.getByRole('group', { name: 'Linear Regression Slope', exact: true })).toBeVisible()
  }
  await page.reload()
  await verifyReadouts()
})
