import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('hollow candle bodies and close-to-close colors keep the original OHLCV and restore per pane', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect, strokeRect, beginPath, moveTo, lineTo, stroke } = proto
    const candle = context => /^HOLLOW interactive hollow candlestick/.test(context.canvas.getAttribute('aria-label') || '')
    const colors = ['#93a19e', '#68d7b1', '#ec817e']
    let path
    proto.scale = function (...args) {
      if (candle(this)) window.hollowPaint = { bodies: [], lines: [] }
      return scale.apply(this, args)
    }
    for (const [method, original, style] of [
      ['strokeRect', strokeRect, 'strokeStyle'], ['fillRect', fillRect, 'fillStyle'],
    ]) {
      proto[method] = function (...args) {
        if (candle(this) && this.lineWidth === 1 && this.globalAlpha === 1 && colors.includes(this[style]))
          window.hollowPaint.bodies.push({ method, color: this[style], rect: args })
        return original.apply(this, args)
      }
    }
    proto.beginPath = function () {
      path = []
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        path?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (candle(this) && this.lineWidth === 1 && colors.includes(this.strokeStyle) && path?.length === 2)
        window.hollowPaint.lines.push({ color: this.strokeStyle, path })
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const rows = [
    header,
    '2025-06-02,10,15,8,12,1',
    '2025-06-03,7,11,5,9,2',
    '2025-06-04,15,17,10,13,3',
    '2025-06-05,13,17,9,13,4',
    '2025-06-06,14,18,10,11,5',
    '2025-06-09,10,20,7,16,6',
  ]
  await openImport(page, 'HOLLOW', rows.join('\n'))
  await submitImport(page, 'HOLLOW')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:HOLLOW')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(2)

  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('hollow-candles')
  await comparisonType.selectOption('ohlc')
  await expect(page.getByLabel(/^HOLLOW interactive hollow candlestick/)).toBeVisible()
  await expect(page.getByLabel(/^HOLLOW interactive OHLC bar/)).toBeVisible()
  await expect.poll(async () => page.evaluate(() => window.hollowPaint?.bodies.length)).toBe(5)
  const { bodies, lines } = await page.evaluate(() => window.hollowPaint)
  expect(bodies.map(({ method, color }) => [method, color])).toEqual([
    ['strokeRect', '#93a19e'], ['strokeRect', '#ec817e'], ['fillRect', '#68d7b1'],
    ['fillRect', '#ec817e'], ['strokeRect', '#68d7b1'],
  ])
  for (const { rect: [left, top, width, height] } of bodies) {
    const center = left + width / 2
    const wicks = lines.filter(({ path: [[x1], [x2]] }) =>
      Math.abs(x1 - center) < 0.001 && Math.abs(x2 - center) < 0.001)
    expect(wicks).toHaveLength(2)
    expect(wicks[0].path[0][1]).toBeLessThan(top)
    expect(wicks[0].path[1][1]).toBeCloseTo(top)
    expect(wicks[1].path[0][1]).toBeCloseTo(top + height)
    expect(wicks[1].path[1][1]).toBeGreaterThan(top + height)
  }
  const doji = lines.find(({ path: [[x1, y1], [x2, y2]] }) => x1 < x2 && y1 === y2)
  expect(doji?.color).toBe('#93a19e')

  const exact = await downloadWorkspace(page)
  expect(exact.version).toBe(52)
  expect(exact.manifest.preferences.chartTypes).toEqual({ primary: 'hollow-candles', comparison: 'ohlc' })
  expect(exact.manifest.series).toEqual(legacy.manifest.series)

  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('candles')
  await expect(comparisonType).toHaveValue('candles')
  await restore(exact)
  await page.reload()
  await expect(primaryType).toHaveValue('hollow-candles')
  await expect(comparisonType).toHaveValue('ohlc')
})
