import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('daily floor pivots use the same prior observed UTC day in recorded and rolled panes offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const paths = new WeakMap()
    const begin = canvas.beginPath
    canvas.beginPath = function () {
      paths.set(this, [])
      return begin.call(this)
    }
    for (const method of ['moveTo', 'lineTo']) {
      const draw = canvas[method]
      canvas[method] = function (x, y) {
        paths.get(this)?.push([method, x, y])
        return draw.call(this, x, y)
      }
    }
    const stroke = canvas.stroke
    canvas.stroke = function (...args) {
      if (this.strokeStyle === '#e6bb76' && this.canvas.closest('[aria-label="Primary chart pane"]')) {
        window.pivotTrace = paths.get(this)
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const series = [
    ['2025-06-06T09:00:00Z', 0, -6, -4], ['2025-06-06T09:01:00Z', 3, -4, 0],
    ['2025-06-09T00:00:00Z', 10, 2, 8], ['2025-06-09T00:01:00Z', 12, 1, 11],
    ['2025-06-10T00:00:00Z', 110, 90, 95], ['2025-06-10T00:01:00Z', 350, 72, 340],
  ]
  const csv = [header, ...series.map(([time, high, low, close]) => [Date.parse(time) / 1000, close, high, low, close, 1].join(','))].join('\n')
  await openImport(page, 'FLOORPIVOT', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'FLOORPIVOT')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const menu = page.getByRole('button', { name: /Indicators/ })
  const readout = pane => pane.getByRole('group', { name: 'Daily Floor Pivots' })
  const levels = ['Daily Floor Pivots', 'P 8', 'S1 4', 'S2 -3', 'R1 15', 'R2 19', 'Prior close UTC 2025-06-09T00:01:00Z']
  async function apply(pane, name) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    await form.getByRole('button', { name: 'Apply ' + name }).click()
  }
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:FLOORPIVOT')
  await menu.click()
  await apply('Primary', 'Elder Force Index')
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(59)
  await menu.click()
  await apply('Primary', 'Daily Floor Pivots')
  await expect(readout(comparison)).toHaveCount(0)
  await apply('Comparison', 'Daily Floor Pivots')
  await page.keyboard.press('Escape')
  await expect(readout(primary).locator('span')).toHaveText(levels)
  await expect.poll(() => page.evaluate(() => window.pivotTrace?.length)).toBe(5)
  const [first, flat, corner, step, last] = await page.evaluate(() => window.pivotTrace)
  expect(first[0]).toBe('moveTo')
  expect([first[2], flat[2], corner[2]]).toEqual([first[2], first[2], first[2]])
  expect(corner[1]).toBe(step[1])
  expect(last[2]).toBe(step[2])
  expect(step[2]).toBeLessThan(corner[2])

  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(readout(comparison).locator('span')).toHaveText(levels)
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const [fields, ...rows] = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  const keys = ['pivot', 'support_1', 'support_2', 'resistance_1', 'resistance_2']
  const indices = keys.map(key => fields.split(',').indexOf('daily_pivots_' + key))
  expect(indices.every(index => index > 0)).toBe(true)
  expect(rows.map(row => indices.map(index => row.split(',')[index]).join(','))).toEqual([
    ',,,,', ',,,,', '-1,-5,-10,4,8', '-1,-5,-10,4,8', '8,4,-3,15,19', '8,4,-3,15,19',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(60)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { elder_force: { enabled: true, period: 13 }, daily_pivots: { enabled: true } },
    comparison: { daily_pivots: { enabled: true } },
  })
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primary.getByRole('group', { name: 'Elder Force Index' })).toBeVisible()
    await expect(readout(primary)).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expect(readout(primary).locator('span')).toHaveText(levels)
  await expect(readout(comparison).locator('span')).toHaveText(levels)
})
