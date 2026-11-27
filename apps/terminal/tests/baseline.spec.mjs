import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('the baseline clips fills at independent signed reference prices and restores exact settings', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, rect, clip, stroke, fill } = proto
    const paths = new WeakMap()
    const latestRect = new WeakMap()
    const clipped = new WeakMap()
    const pane = context => {
      if (!context.canvas.getAttribute('aria-label')?.startsWith('BASE interactive baseline')) return null
      return context.canvas.closest('[aria-label="Primary chart pane"]') ? 'primary' : 'comparison'
    }
    window.baselineTrace = {}
    proto.scale = function (...args) {
      const key = pane(this)
      if (key) window.baselineTrace[key] = { bands: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (pane(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.rect = function (...box) {
      if (pane(this)) latestRect.set(this, box)
      return rect.apply(this, box)
    }
    proto.clip = function (...args) {
      if (pane(this)) clipped.set(this, latestRect.get(this))
      return clip.apply(this, args)
    }
    proto.stroke = function (...args) {
      const key = pane(this)
      if (key && this.strokeStyle === '#899eb0') window.baselineTrace[key].reference = paths.get(this)
      if (key && this.strokeStyle === '#55b5ee') window.baselineTrace[key].trace = paths.get(this)
      return stroke.apply(this, args)
    }
    proto.fill = function (...args) {
      const key = pane(this)
      if (key && args[0] instanceof Path2D)
        window.baselineTrace[key].bands.push([this.fillStyle, clipped.get(this)])
      return fill.apply(this, args)
    }
  })
  await page.goto('/')
  await openImport(page, 'BASE', [header, '2025-06-02,-5,-4,-7,-5,1',
    '2025-06-03,2,4,-1,3,2', '2025-06-05,8,10,7,8,3'].join('\n'))
  await submitImport(page, 'BASE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:BASE')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('step-line')
  await comparisonType.selectOption('area')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(38)

  await primaryType.selectOption('baseline')
  await comparisonType.selectOption('baseline')
  await expect(primary.getByLabel('Baseline price')).toHaveValue('0')
  const setBaseline = async (pane, price) => {
    await pane.getByLabel('Baseline price').fill(price)
    await pane.getByRole('button', { name: 'Apply baseline' }).click()
  }
  await setBaseline(primary, '2000000000.000001')
  await expect(primary.getByRole('alert')).toContainText('up to six decimal places')
  await setBaseline(primary, '1.000001')
  await setBaseline(comparison, '-2.500001')
  await expect(primary.getByLabel('Baseline price')).toHaveValue('1.000001')
  await expect(comparison.getByLabel('Baseline price')).toHaveValue('-2.500001')

  const geometry = await page.evaluate(() => window.baselineTrace)
  for (const { reference, trace, bands } of Object.values(geometry)) {
    expect(reference).toHaveLength(2)
    const y = reference[0][1]
    expect(reference[1][1]).toBe(y)
    expect(trace[0][1]).toBeGreaterThan(y)
    expect(trace[1][1]).toBeLessThan(y)
    expect(trace[2][1]).toBeLessThan(y)
    expect(bands[0][0]).toBe('rgba(104, 215, 177, 0.2)')
    expect(bands[1][0]).toBe('rgba(236, 129, 126, 0.2)')
    expect(bands[0][1][1] + bands[0][1][3]).toBeCloseTo(y)
    expect(bands[1][1][1]).toBeCloseTo(y)
  }
  expect(geometry.primary.reference[0][1]).toBeLessThan(geometry.comparison.reference[0][1])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(39)
  expect(saved.manifest.preferences.baselineTicks).toEqual({ primary: 1000001, comparison: -2500001 })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  await primaryType.selectOption('candles')
  expect((await downloadWorkspace(page)).manifest.preferences.baselineTicks.primary).toBe(1000001)
  await primaryType.selectOption('baseline')
  await expect(primary.getByLabel('Baseline price')).toHaveValue('1.000001')

  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('step-line')
  await expect(comparisonType).toHaveValue('area')
  await restore(saved)
  await page.reload()
  await expect(primary.getByLabel('Baseline price')).toHaveValue('1.000001')
  await expect(comparison.getByLabel('Baseline price')).toHaveValue('-2.500001')
})
