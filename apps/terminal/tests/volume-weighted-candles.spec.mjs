import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('volume-weighted candle bodies stay centered on their unchanged OHLC wicks', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillRect } = proto
    const paths = new WeakMap()
    const identify = context => {
      if (!context.canvas.getAttribute('aria-label')?.startsWith('WEIGHT interactive ')) return null
      return context.canvas.closest('[aria-label="Primary chart pane"]') ? 'primary' : 'comparison'
    }
    window.weightTrace = {}
    proto.scale = function (...args) {
      const key = identify(this)
      if (key) window.weightTrace[key] = { wicks: [], bodies: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (identify(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      const key = identify(this)
      const path = paths.get(this)
      if (key && this.lineWidth === 1 && ['#68d7b1', '#ec817e'].includes(this.strokeStyle) &&
        path?.length === 2 && path[0][0] === path[1][0])
        window.weightTrace[key].wicks.push(path)
      return stroke.apply(this, args)
    }
    proto.fillRect = function (x, y, width, height) {
      const key = identify(this)
      if (key && this.lineWidth === 1 && this.globalAlpha === 1 &&
        ['#68d7b1', '#ec817e'].includes(this.fillStyle))
        window.weightTrace[key].bodies.push([this.fillStyle, x, y, width, height])
      return fillRect.call(this, x, y, width, height)
    }
  })
  await page.goto('/')
  await openImport(page, 'WEIGHT', [
    header,
    '2025-06-03,10,14,9,11,1',
    '2025-06-04,12,14,9,10,2',
    '2025-06-05,10,13,9,11,0',
    '2025-06-06,10,14,9,10,4',
  ].join('\n'))
  await submitImport(page, 'WEIGHT')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:WEIGHT')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('close-change')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(40)
  const before = await page.evaluate(() => window.weightTrace.primary)
  expect(before.wicks).toHaveLength(4)
  expect(before.bodies).toHaveLength(4)
  await primaryType.selectOption('volume-candles')
  await expect(primary.locator('canvas')).toHaveAttribute('aria-label', /volume-weighted candlestick/)
  const after = await page.evaluate(() => window.weightTrace.primary)
  expect(after.wicks).toEqual(before.wicks)
  expect(after.bodies).toHaveLength(3)
  for (const [result, original, fraction] of [
    [after.bodies[0], before.bodies[0], 1 / 4],
    [after.bodies[1], before.bodies[1], 1 / 2],
    [after.bodies[2], before.bodies[3], 1],
  ]) {
    const [color, x, y, width, height] = result
    expect(color).toBe(original[0])
    expect(y).toBe(original[2])
    expect(height).toBe(original[4])
    expect(width / original[3]).toBeCloseTo(fraction)
    expect(x + width / 2).toBeCloseTo(original[1] + original[3] / 2)
  }

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(41)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'volume-candles', comparison: 'close-change' })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('candles')
  await restore(saved)
  await page.reload()
  await expect(primaryType).toHaveValue('volume-candles')
  await expect(comparisonType).toHaveValue('close-change')
})
