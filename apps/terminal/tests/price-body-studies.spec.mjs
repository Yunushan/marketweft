import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline candle-body, accumulation and midpoint studies retain signed output and backup version 83', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = [header, ...[[-2,1,-3,-1],[2,6,2,5],[6,8,4,5],[-3,-2,-5,-4],[1,2,0,1],[-1,1,-3,1],[2,4,0,0]].map((prices, index) =>
    [1748872800 + 60 * index, ...prices, 10].join(','))].join('\n')
  await openImport(page, 'PRICEBODY', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'PRICEBODY')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:PRICEBODY')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const indicators = page.getByRole('button', { name: /Indicators/ })

  async function apply(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    if (period) await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(period))
    const button = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await button.click()
    await expect(button).toBeEnabled()
  }
  await indicators.click()
  await apply('Primary', 'Klinger Oscillator')
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(82)
  await indicators.click()
  await apply('Primary', 'Qstick', 2)
  await apply('Comparison', 'Qstick', 1)
  await apply('Primary', 'Williams Accumulation/Distribution')
  await apply('Primary', 'Center of Gravity', 2)
  await page.keyboard.press('Escape')

  const body = pane => pane.getByRole('group', { name: 'Qstick', exact: true })
  const wad = primary.getByRole('group', { name: 'Williams Accumulation/Distribution', exact: true })
  const center = primary.getByRole('group', { name: 'Center of Gravity Oscillator', exact: true })
  async function readouts() {
    await expect(body(primary)).toHaveText('Qstick 2 0')
    await expect(body(comparison)).toHaveText('Qstick 1 -2')
    await expect(wad).toHaveText('Williams Accumulation/Distribution -2')
    await expect(center.locator('span')).toHaveText(['Center of Gravity 2', 'Line 0', 'Signal —'])
  }
  await readouts()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [file] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [fields, ...rows] = (await readFile(await file.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['qstick_2', 'williams_ad', 'center_of_gravity_line_2', 'center_of_gravity_signal_2']
    .map(field => fields.split(',').indexOf(field))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',0,,', '2,6,-0.666667,', '1,6,-1.4,-0.666667', '-1,-3,-3.4,-1.4',
    '-0.5,2,-2.4,-3.4', '1,2,,-2.4', '0,-2,0,',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(83)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(center).toHaveCount(backup === current ? 1 : 0)
    await expect(primary.getByRole('group', { name: 'Klinger Oscillator', exact: true })).toBeVisible()
  }
  await page.reload()
  await readouts()
})
