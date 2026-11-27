import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline Kagi connects reversals, changes thickness at prior extremes and saves the reversal size', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-kagi.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, moveTo, lineTo, stroke } = proto
    const isKagi = ctx => ctx.canvas.getAttribute('aria-label') === 'KAGI interactive Kagi chart'
    const paths = new WeakMap()
    window.kagiMarks = []
    proto.scale = function (...args) {
      if (isKagi(this)) window.kagiMarks = []
      return scale.apply(this, args)
    }
    proto.moveTo = function (x, y) {
      if (isKagi(this)) paths.set(this, [[x, y]])
      return moveTo.call(this, x, y)
    }
    proto.lineTo = function (x, y) {
      if (isKagi(this)) paths.get(this)?.push([x, y])
      return lineTo.call(this, x, y)
    }
    proto.stroke = function () {
      if (isKagi(this) && (this.strokeStyle === '#68d7b1' || this.strokeStyle === '#ec817e')) {
        const points = paths.get(this)
        if (points?.length === 2 && (this.lineWidth === 3 || Math.abs(this.lineWidth - 1.2) < 1e-5)) window.kagiMarks.push({ points, width: this.lineWidth })
      }
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('three-line-break')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(11)

  await openImport(page, 'KAGI', csv)
  await submitImport(page, 'KAGI')
  await primaryType.selectOption('kagi')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const plot = pane.getByLabel('KAGI interactive Kagi chart')
  const settings = pane.getByRole('form', { name: 'Kagi reversal settings' })
  const size = settings.getByLabel('Reversal size (price units)')
  const apply = settings.getByRole('button', { name: 'Apply reversal size' })
  await size.fill('999')
  await apply.click()
  await expect(pane.getByRole('status')).toContainText('No source close has reached the reversal size')
  await size.fill('2')
  await apply.click()
  const readout = pane.getByRole('group', { name: 'Kagi line' })
  await expect(pane.getByTestId('viewport')).toHaveText('1–6 of 6')
  await expect(readout).toContainText('Close 100.999998')
  await expect(readout).toContainText('Weight Thin')
  await expect.poll(() => page.evaluate(() => window.kagiMarks.length)).toBe(14)
  const marks = await page.evaluate(() => window.kagiMarks)
  const connectors = marks.filter(({ points: [[x1, y1], [x2, y2]] }) => x1 !== x2 && y1 === y2)
  expect(connectors).toHaveLength(5)
  const vertical = marks.filter(({ points: [[x1], [x2]] }) => x1 === x2)
  const [[x, y1], [, y2]] = vertical[3].points
  expect(vertical[3].width).toBe(3)
  expect(vertical[4].width).toBeCloseTo(1.2, 5)
  expect(vertical[4].points[0][1]).toBeCloseTo(y2, 8)
  await plot.hover({ position: { x, y: (y1 * 3 + y2) / 4 } })
  await expect(readout).toContainText('1970-01-10')
  await expect(readout).toContainText('Close 103')
  await expect(readout).toContainText('Weight Thick')
  await plot.hover({ position: { x, y: y2 + 2 } })
  await expect(readout).toContainText('1970-01-12')
  await expect(readout).toContainText('Close 100.999999')
  await expect(readout).toContainText('Weight Thin')

  await page.getByRole('button', { name: 'Compare charts' }).click()
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('three-line-break')
  await expect(comparisonType).toBeEnabled()
  await expect(comparisonType).toHaveValue('three-line-break')
  await page.reload()
  await expect(primaryType).toHaveValue('kagi')
  await expect(size).toHaveValue('2')
  await expect(comparisonType).toHaveValue('three-line-break')
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(12)
  expect(current.manifest.preferences.kagiTicks).toEqual({ primary: 2_000_000 })
  expect(current.manifest.preferences.chartTypes).toEqual({ primary: 'kagi', comparison: 'three-line-break' })
  expect(current.manifest.series[0].csv).toBe(csv)
  for (const [backup, type] of [[legacy, 'three-line-break'], [current, 'kagi']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await expect(size).toHaveValue('2')
  await expect(pane.getByTestId('viewport')).toHaveText('1–6 of 6')
})
