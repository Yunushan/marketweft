import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Elder-Ray and Coppock retain signed values, zero-baseline gaps and pane periods offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2025-06-03T14:00:00Z') / 1000
  const csv = [header, ...[-4, -2, 0, -2, 4, 2, 1, 3, 4, 8].map((close, index) =>
    [start + index * 60 + (index >= 6 ? 180 : 0), close, close + 1, close - 1, close, 1].join(','))].join('\n')
  await openImport(page, 'RAYCURVE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'RAYCURVE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:RAYCURVE')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const menu = page.getByRole('button', { name: /Indicators/ })
  async function apply(pane, name, periods) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    for (const [tag, value] of Object.entries(periods)) {
      await form.getByLabel(tag + ' period (bars)', { exact: true }).fill(String(value))
    }
    const save = form.getByRole('button', { name: 'Apply ' + name })
    await save.click()
    await expect(save).toBeEnabled()
  }
  await menu.click()
  await apply('Primary', 'KAMA', { KAMA: 2 })
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(62)

  await menu.click()
  await apply('Primary', 'Elder-Ray Index', { 'Elder-Ray Index': 2 })
  for (const [pane, first, second] of [['Primary', 1, 2], ['Comparison', 2, 3]]) {
    await apply(pane, 'Coppock Curve', { 'Coppock smoothing': 2, 'Coppock first change': first, 'Coppock second change': second })
  }
  await page.keyboard.press('Escape')
  const ray = primary.getByRole('group', { name: 'Elder-Ray Index' })
  const curve = pane => pane.getByRole('group', { name: 'Coppock Curve' })
  async function expectStudies() {
    await expect(ray.locator('span')).toHaveText(['Elder-Ray Index 2', 'Bull Power 2.505716', 'Bear Power 0.505716'])
    await expect(curve(primary)).toHaveText('Coppock Curve 2/1/2 288.888889%')
    await expect(curve(comparison)).toHaveText('Coppock Curve 2/2/3 711.111111%')
  }
  await expectStudies()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const [fields, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['elder_ray_bull_2', 'elder_ray_bear_2', 'coppock_2_1_2'].map(key => fields.split(',').indexOf(key))
  expect(columns.every(column => column > 0)).toBe(true)
  expect(rows.map(row => columns.map(column => row.split(',')[column]).join(','))).toEqual([
    ',,', '2,0,', '2,0,', '0.666667,-1.333333,', '2.888889,0.888889,', '0.962963,-1.037037,',
    '0.654321,-1.345679,-166.666667', '1.55144,-0.44856,125', '1.517147,-0.482853,305.555555', '2.505716,0.505716,288.888889',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(63)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { kama: { enabled: true, period: 2 }, elder_ray: { enabled: true, period: 2 },
      coppock: { enabled: true, period: 2, coppockFirstPeriod: 1, coppockSecondPeriod: 2 } },
    comparison: { coppock: { enabled: true, period: 2, coppockFirstPeriod: 2, coppockSecondPeriod: 3 } },
  })
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primary.getByRole('group', { name: 'Kaufman Adaptive Moving Average' })).toBeVisible()
    await expect(ray).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expectStudies()
})
