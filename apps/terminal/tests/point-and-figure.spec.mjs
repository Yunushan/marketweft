import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline Point and Figure plots X and O columns from exact closes and restores the box size', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-point-and-figure.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, moveTo, lineTo, arc, stroke } = proto
    const isChart = ctx => ctx.canvas.getAttribute('aria-label') === 'PNF interactive Point and Figure chart'
    const paths = new WeakMap()
    window.pnfMarks = { diagonals: [], circles: [] }
    proto.scale = function (...args) {
      if (isChart(this)) window.pnfMarks = { diagonals: [], circles: [] }
      return scale.apply(this, args)
    }
    proto.moveTo = function (x, y) {
      if (isChart(this)) paths.set(this, [[x, y]])
      return moveTo.call(this, x, y)
    }
    proto.lineTo = function (x, y) {
      if (isChart(this)) paths.get(this)?.push([x, y])
      return lineTo.call(this, x, y)
    }
    proto.arc = function (x, y, ...args) {
      if (isChart(this) && this.strokeStyle === '#ec817e') window.pnfMarks.circles.push([x, y])
      return arc.call(this, x, y, ...args)
    }
    proto.stroke = function () {
      const p = paths.get(this)
      if (isChart(this) && this.strokeStyle === '#68d7b1' && p?.length === 2 &&
          p[0][0] !== p[1][0] && p[0][1] !== p[1][1]) window.pnfMarks.diagonals.push(p)
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('kagi')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(12)

  await openImport(page, 'PNF', csv)
  await submitImport(page, 'PNF')
  await primaryType.selectOption('point-and-figure')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const size = pane.getByLabel('Box size (price units)')
  const apply = pane.getByRole('button', { name: 'Apply box size' })
  await size.fill('999')
  await apply.click()
  await expect(pane.getByRole('status')).toContainText('No source close has moved far enough to fill a box')
  await size.fill('2')
  await apply.click()
  await expect(size).toBeEnabled()
  const readout = pane.getByRole('group', { name: 'Point and Figure box' })
  const plot = pane.getByLabel('PNF interactive Point and Figure chart')
  await expect(pane.getByTestId('viewport')).toHaveText('1–4 of 4')
  await expect(readout).toContainText('Column 4')
  await expect(readout).toContainText('Box O')
  await expect(readout).toContainText('Level 106')
  await expect.poll(() => page.evaluate(() => [window.pnfMarks.diagonals.length, window.pnfMarks.circles.length])).toEqual([20, 7])
  const marks = await page.evaluate(() => window.pnfMarks)
  const [[x0, y0], [x1, y1]] = marks.diagonals[0]
  await plot.hover({ position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } })
  await expect(readout).toContainText('1970-01-03')
  await expect(readout).toContainText('Box X')
  await expect(readout).toContainText('Level 102')
  await expect(readout).toContainText('Observed close 106.25')
  const [x, y] = marks.circles[0]
  await plot.hover({ position: { x, y } })
  await expect(readout).toContainText('1970-01-06')
  await expect(readout).toContainText('Box O')
  await expect(readout).toContainText('Level 106')
  await expect(readout).toContainText('Observed close 102')

  await page.getByRole('button', { name: 'Compare charts' }).click()
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('kagi')
  await expect(comparisonType).toBeEnabled()
  await expect(comparisonType).toHaveValue('kagi')
  await page.reload()
  await expect(primaryType).toHaveValue('point-and-figure')
  await expect(size).toHaveValue('2')
  await expect(comparisonType).toHaveValue('kagi')
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(13)
  expect(current.manifest.preferences.pointFigureTicks).toEqual({ primary: 2_000_000 })
  expect(current.manifest.preferences.chartTypes).toEqual({ primary: 'point-and-figure', comparison: 'kagi' })
  expect(current.manifest.series[0].csv).toBe(csv)
  for (const [backup, type] of [[legacy, 'kagi'], [current, 'point-and-figure']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await expect(size).toHaveValue('2')
  await expect(pane.getByTestId('viewport')).toHaveText('1–4 of 4')
})
