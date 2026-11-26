import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('the OHLC chart draws left open and right close ticks at the observed prices', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    window.ohlcStrokes = []
    proto.moveTo = function (x, y) {
      paths.set(this, [[x, y]])
      return moveTo.call(this, x, y)
    }
    proto.lineTo = function (x, y) {
      paths.get(this)?.push([x, y])
      return lineTo.call(this, x, y)
    }
    proto.stroke = function () {
      const path = paths.get(this)
      if (this.canvas.getAttribute('aria-label')?.startsWith('BARS interactive OHLC bar') &&
          this.strokeStyle === '#68d7b1' && this.getLineDash().length === 0 && path?.length === 2) {
        window.ohlcStrokes.push(path)
      }
      return stroke.apply(this, arguments)
    }
  })
  await page.goto('/')
  await openImport(page, 'BARS', [header, '2025-06-02,10,21,1,15,100'].join('\n'))
  await submitImport(page, 'BARS')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('line')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(5)
  await primaryType.selectOption('ohlc')
  const canvas = pane.getByLabel(/^BARS interactive OHLC bar/)
  await expect(canvas).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.ohlcStrokes.length)).toBeGreaterThanOrEqual(3)
  const [wick, open, close] = await page.evaluate(() => window.ohlcStrokes.slice(-3))
  const [[axis, high], [bottomAxis, low]] = wick
  expect(bottomAxis).toBe(axis)
  expect(low).toBeGreaterThan(high)
  expect(open[0][0]).toBeLessThan(axis)
  expect(open[1][0]).toBe(axis)
  expect(open[1][1]).toBe(open[0][1])
  expect(close[0][0]).toBe(axis)
  expect(close[1][0]).toBeGreaterThan(axis)
  expect(close[1][1]).toBe(close[0][1])
  expect((open[0][1] - high) / (low - high)).toBeCloseTo((21 - 10) / (21 - 1), 10)
  expect((close[0][1] - high) / (low - high)).toBeCloseTo((21 - 15) / (21 - 1), 10)
  await page.reload()
  await expect(primaryType).toHaveValue('ohlc')
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(6)
  expect(backup.manifest.preferences.chartTypes).toEqual({ primary: 'ohlc' })
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('line')
  await restore(backup)
  await expect(primaryType).toHaveValue('ohlc')
})

test('OHLC bars pan and zoom independently of the linked close-line pane', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  await page.getByLabel('Comparison instrument').selectOption('NASDAQ:NVDA')
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('line')
  await comparisonType.selectOption('ohlc')
  await expect(primary.getByLabel(/^NVDA interactive close line/)).toBeVisible()
  const bars = comparison.getByLabel(/^NVDA interactive OHLC bar/)
  await expect(bars).toBeVisible()
  const primaryRange = await primary.getByTestId('viewport').innerText()
  await comparison.getByRole('button', { name: 'Zoom in' }).click()
  await expect(comparison.getByTestId('viewport')).not.toHaveText(primaryRange)
  await expect(primary.getByTestId('viewport')).toHaveText(primaryRange)
  const zoomedRange = await comparison.getByTestId('viewport').innerText()
  await comparison.getByRole('button', { name: 'Earlier bars' }).click()
  await expect(comparison.getByTestId('viewport')).not.toHaveText(zoomedRange)
  await bars.hover({ position: { x: 145, y: 80 } })
  const plot = pane => pane.getByRole('region', { name: 'Price and volume chart' })
  await expect(plot(comparison)).toHaveAttribute('data-crosshair-time', /^\d+$/)
  await expect(plot(primary)).toHaveAttribute('data-crosshair-time',
    await plot(comparison).getAttribute('data-crosshair-time'))
  expect((await downloadWorkspace(page)).manifest.preferences.chartTypes)
    .toEqual({ primary: 'line', comparison: 'ohlc' })
})
