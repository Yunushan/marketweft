import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

async function tracePrimaryBand(page, symbol) {
  await page.addInitScript(symbol => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fill } = proto
    const paths = new WeakMap()
    const primary = context => context.canvas.getAttribute('aria-label')?.startsWith(symbol + ' interactive ') &&
      context.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.bandTrace = { wicks: [], fills: [], closes: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      const path = paths.get(this)
      if (primary(this) && path?.length) {
        if (this.strokeStyle === '#55b5ee') window.bandTrace.closes.push(path)
        if (this.lineWidth === 1 && ['#68d7b1', '#ec817e'].includes(this.strokeStyle) &&
          path.length === 2 && path[0][0] === path[1][0]) window.bandTrace.wicks.push(path)
      }
      return stroke.apply(this, args)
    }
    proto.fill = function (...args) {
      if (primary(this) && this.fillStyle === 'rgba(85, 181, 238, 0.2)')
        window.bandTrace.fills.push(paths.get(this))
      return fill.apply(this, args)
    }
  }, symbol)
}

test('high-low bands use the observed bounds and stop across missing intervals', async ({ page }) => {
  await tracePrimaryBand(page, 'BANDS')
  await page.goto('/')
  await openImport(page, 'BANDS', [
    header,
    '2025-06-03T14:00:00Z,10,14,9,11,1',
    '2025-06-03T14:01:00Z,12,15,8,10,2',
    '2025-06-03T14:03:00Z,16,17,12,13,3',
    '2025-06-03T14:04:00Z,13,19,9,17,4',
  ].join('\n'))
  await submitImport(page, 'BANDS')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:BANDS')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('volume-candles')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(41)
  const earlier = await page.evaluate(() => window.bandTrace)
  expect(earlier.wicks).toHaveLength(4)
  await primaryType.selectOption('high-low-band')
  const savedInterval = primary.getByLabel('High-low band interval (seconds)')
  await expect(savedInterval).toHaveValue('')
  expect((await page.evaluate(() => window.bandTrace)).fills).toEqual([])
  await savedInterval.fill('60')
  await primary.getByRole('button', { name: 'Apply interval' }).click()
  await expect(savedInterval).toHaveValue('60')
  const after = await page.evaluate(() => window.bandTrace)
  expect(after.fills).toEqual([0, 2].map(start => [
    earlier.wicks[start][0], earlier.wicks[start + 1][0],
    earlier.wicks[start + 1][1], earlier.wicks[start][1],
  ]))
  expect(after.closes.map(segment => [...new Set(segment.map(point => point[0]))])).toEqual([
    [earlier.wicks[0][0][0], earlier.wicks[1][0][0]],
    [earlier.wicks[2][0][0], earlier.wicks[3][0][0]],
  ])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(42)
  expect(saved.manifest.preferences.highLowSeconds).toEqual({ primary: 60 })
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
  await expect(primaryType).toHaveValue('high-low-band')
  await expect(savedInterval).toHaveValue('60')
  await expect(comparisonType).toHaveValue('volume-candles')
})


test('dense high-low bands retain local extremes without merging across an interval gap', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 })
  await tracePrimaryBand(page, 'DENSE')
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const bars = Array.from({ length: 800 }, (_, index) => {
    const time = from + 60 * (index + (index >= 397 ? 3 : 0))
    return [time, 2, index === 50 ? 100 : 3, index === 75 ? -100 : 1, index === 50 ? 99 : 2, 1].join(',')
  })
  await openImport(page, 'DENSE', [header, ...bars].join('\n'))
  await submitImport(page, 'DENSE')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const zoom = pane.getByRole('button', { name: 'Zoom out' })
  while (await zoom.isEnabled()) await zoom.click()
  const old = await page.evaluate(() => window.bandTrace)
  expect(old.wicks.length).toBeGreaterThan(200)
  expect(old.wicks.length).toBeLessThan(700)
  await page.getByLabel('Primary chart type').selectOption('high-low-band')
  await pane.getByLabel('High-low band interval (seconds)').fill('60')
  await pane.getByRole('button', { name: 'Apply interval' }).click()
  const band = await page.evaluate(() => window.bandTrace)
  expect(band.fills).toHaveLength(2)
  expect(band.closes).toHaveLength(2)
  const extreme = ((points, measure) => measure(...points.map(point => point[1])))
  expect(extreme(band.fills.flat(), Math.min)).toBe(extreme(old.wicks.flat(), Math.min))
  expect(extreme(band.fills.flat(), Math.max)).toBe(extreme(old.wicks.flat(), Math.max))
  expect(band.closes[0].at(-1)[0]).toBeLessThan(band.closes[1][0][0])
  expect(extreme(band.closes[0], Math.min)).toBeLessThan(extreme(band.closes[1], Math.min))
  function boundaryAt(points, x) {
    const right = points.findIndex(point => point[0] >= x)
    if (right <= 0) return points[0][1]
    const [leftX, leftY] = points[right - 1]
    const [rightX, rightY] = points[right]
    return leftY + (rightY - leftY) * (x - leftX) / (rightX - leftX)
  }
  for (const [index, fill] of band.fills.entries()) {
    const lastClose = band.closes[index].at(-1)[0]
    const split = fill.findIndex(point => point[0] === lastClose) + 1
    const highs = fill.slice(0, split)
    const lows = fill.slice(split).reverse()
    for (const [x, y] of band.closes[index]) {
      expect(y + 1e-8).toBeGreaterThanOrEqual(boundaryAt(highs, x))
      expect(y - 1e-8).toBeLessThanOrEqual(boundaryAt(lows, x))
    }
  }
})
