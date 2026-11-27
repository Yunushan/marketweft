import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Three Line Break skips touches, plots strict reversals and restores mixed price charts offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-three-line-break.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect } = proto
    const isTarget = ctx => ctx.canvas.getAttribute('aria-label') === 'BREAK interactive Three Line Break chart'
    window.lineBreakX = []
    proto.scale = function (...args) {
      if (isTarget(this)) window.lineBreakX = []
      return scale.apply(this, args)
    }
    proto.fillRect = function (x, y, width, height) {
      if (isTarget(this) && (this.fillStyle === '#68d7b1' || this.fillStyle === '#ec817e')) {
        window.lineBreakX.push({ x: x + width / 2, color: this.fillStyle })
      }
      return fillRect.call(this, x, y, width, height)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('renko')
  const v10 = await downloadWorkspace(page)
  expect(v10.version).toBe(10)

  await openImport(page, 'BREAK', csv)
  await submitImport(page, 'BREAK')
  await primaryType.selectOption('three-line-break')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const plot = primary.getByLabel('BREAK interactive Three Line Break chart')
  const readout = primary.getByRole('group', { name: 'Three Line Break line' })
  await expect(primary.getByTestId('viewport')).toHaveText('1–14 of 14')
  await expect(readout).toContainText('Close 111.000001')
  await expect(primary.getByLabel('Brick size (price units)')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.lineBreakX.length)).toBe(15)
  const marks = await page.evaluate(() => window.lineBreakX)
  for (const [index, color, source, open, close] of [
    [0, '#68d7b1', '1970-01-03', '100', '102'],
    [4, '#ec817e', '1970-01-10', '106', '101.999999'],
    [7, '#68d7b1', '1970-01-15', '101', '106.000001'],
  ]) {
    expect(marks[index].color).toBe(color)
    await plot.hover({ position: { x: marks[index].x, y: 50 } })
    await expect(readout).toContainText(source)
    await expect(readout).toContainText('Open ' + open)
    await expect(readout).toContainText('Close ' + close)
  }

  await page.getByRole('button', { name: 'Compare charts' }).click()
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('renko')
  const comparisonSize = comparison.getByLabel('Brick size (price units)')
  await comparisonSize.fill('3')
  await comparison.getByRole('button', { name: 'Apply brick size' }).click()
  await expect(comparisonSize).toBeEnabled()
  await expect(comparisonSize).toHaveValue('3')
  await page.reload()
  await expect(primaryType).toHaveValue('three-line-break')
  await expect(comparisonType).toHaveValue('renko')
  await expect(comparison.getByLabel('Brick size (price units)')).toHaveValue('3')
  const v11 = await downloadWorkspace(page)
  expect(v11.version).toBe(11)
  expect(v11.manifest.preferences.chartTypes).toEqual({ primary: 'three-line-break', comparison: 'renko' })
  expect(v11.manifest.preferences.renkoTicks).toEqual({ comparison: 3_000_000 })
  expect(v11.manifest.series[0].csv).toBe(csv)
  for (const [backup, type] of [[v10, 'renko'], [v11, 'three-line-break']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await expect(primary.getByTestId('viewport')).toHaveText('1–14 of 14')
  await expect(comparison.getByLabel('Brick size (price units)')).toHaveValue('3')
})
