import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('step transitions and close-area fills retain their independent pane settings and original bars', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fill } = proto
    const paths = new WeakMap()
    const name = context => {
      const label = context.canvas.getAttribute('aria-label') || ''
      if (!label.startsWith('TRACE interactive ')) return ''
      return label.includes('step line') ? 'step' : label.includes('close area') ? 'area' : ''
    }
    window.closeTraces = {}
    proto.scale = function (...args) {
      const key = name(this)
      if (key) window.closeTraces[key] = {}
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (name(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      const key = name(this)
      if (key && this.strokeStyle === '#55b5ee') window.closeTraces[key].outline = [...paths.get(this)]
      return stroke.apply(this, args)
    }
    proto.fill = function (...args) {
      if (name(this) === 'area' && this.fillStyle === 'rgba(85, 181, 238, 0.18)')
        window.closeTraces.area.fill = [...paths.get(this)]
      return fill.apply(this, args)
    }
  })
  await page.goto('/')
  const rows = [
    header,
    '2025-06-02,11,17,5,10,1',
    '2025-06-04,28,40,21,30,2',
    '2025-06-05,20,27,18,20,3',
  ]
  await openImport(page, 'TRACE', rows.join('\n'))
  await submitImport(page, 'TRACE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:TRACE')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(2)

  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('step-line')
  await comparisonType.selectOption('area')
  await expect(page.getByLabel(/^TRACE interactive step line/)).toBeVisible()
  await expect(page.getByLabel(/^TRACE interactive close area/)).toBeVisible()
  await expect.poll(async () => page.evaluate(() => window.closeTraces.area?.fill?.length)).toBe(5)

  const { step, area } = await page.evaluate(() => window.closeTraces)
  const [first, oldMiddle, middle, oldLast, last] = step.outline
  expect(step.outline).toHaveLength(5)
  expect(oldMiddle).toEqual([middle[0], first[1]])
  expect(oldLast).toEqual([last[0], middle[1]])
  expect(first[0]).toBeLessThan(middle[0])
  expect(middle[0]).toBeLessThan(last[0])
  expect(middle[1]).toBeLessThan(last[1])
  expect(last[1]).toBeLessThan(first[1])
  const [areaFirst, areaMiddle, areaLast] = area.outline
  expect(area.fill.slice(0, 3)).toEqual(area.outline)
  expect(area.fill[3][0]).toBe(areaLast[0])
  expect(area.fill[4][0]).toBe(areaFirst[0])
  expect(area.fill[3][1]).toBe(area.fill[4][1])
  expect(area.fill[4][1]).toBeGreaterThan(areaFirst[1])
  expect(areaMiddle[1]).toBeLessThan(areaLast[1])

  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const marker = '2025-06-04T00:00:00Z'
  await comparison.getByRole('button', { name: 'New time marker' }).click()
  const editor = comparison.getByRole('form', { name: 'Time marker', exact: true })
  await editor.getByRole('textbox').fill(marker)
  await editor.getByRole('button', { name: 'Save time marker' }).click()
  await expect(comparison.getByText('Time marker ' + marker, { exact: true })).toBeVisible()

  const exact = await downloadWorkspace(page)
  expect(exact.version).toBe(38)
  expect(exact.manifest.preferences.chartTypes).toEqual({ primary: 'step-line', comparison: 'area' })
  expect(exact.manifest.preferences.annotations['LOCAL:TRACE'][0].time).toBe(Date.parse(marker) / 1000)
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
  await expect(primaryType).toHaveValue('step-line')
  await expect(comparisonType).toHaveValue('area')
  await expect(comparison.getByText('Time marker ' + marker, { exact: true })).toBeVisible()
})
