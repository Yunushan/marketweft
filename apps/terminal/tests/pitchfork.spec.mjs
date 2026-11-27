import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('pitchfork rays share the exact UTC midpoint and stay parallel after zoom and restore', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('PITCH interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.pitchfork = []
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
      if (primary(this) && ['#bea2f2', '#8874af'].includes(this.strokeStyle)) window.pitchfork.push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((from + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const offsets = [0, 60, 120, 300, 360, 420, 480, 540, 600, 660]
  await openImport(page, 'PITCH', [header, ...offsets.map(offset => [from + offset, 0, 12, -12, 0, 1].join(','))].join('\n'))
  await submitImport(page, 'PITCH')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:PITCH')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await drawings.getByRole('button', { name: 'New anchored vwap' }).click()
  await drawings.getByRole('button', { name: 'Save anchored vwap' }).click()
  await expect(drawings.getByText(/Anchored VWAP 2025/)).toBeVisible()
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(46)

  await drawings.getByRole('button', { name: 'New pitchfork' }).click()
  const editor = drawings.getByRole('form', { name: 'Pitchfork' })
  const anchors = [0, 60, 420].map((offset, index) => ({
    point: editor.getByRole('group', { name: 'Point ' + (index + 1) }), offset,
  }))
  for (const { point, offset } of anchors) {
    await point.getByLabel('Time (UTC)').fill(iso(offset))
    await point.getByLabel('Price').fill('0')
  }
  await editor.getByRole('button', { name: 'Save pitchfork' }).click()
  await expect(editor.getByRole('alert')).toContainText('Pitchfork points must enclose a nonzero area')
  const prices = ['-5', '-2.000001', '4']
  for (const [index, { point }] of anchors.entries()) await point.getByLabel('Price').fill(prices[index])
  await editor.getByRole('button', { name: 'Save pitchfork' }).click()
  await expect(drawings.getByText(/Pitchfork -5 at/)).toBeVisible()

  const geometry = await page.evaluate(() => window.pitchfork)
  expect(geometry).toHaveLength(3)
  const slope = ([[x0, y0], [x1, y1]]) => (y1 - y0) / (x1 - x0)
  expect(slope(geometry[1])).toBeCloseTo(slope(geometry[0]), 8)
  expect(slope(geometry[2])).toBeCloseTo(slope(geometry[0]), 8)
  const [[ax, ay], [bx, by], [cx, cy]] = geometry.map(segment => segment[0])
  const columnWidth = (cx - bx) / 4
  // The exact UTC midpoint is 14:04, two thirds through the gap from 14:02 to 14:05.
  const midX = bx + columnWidth * (1 + 2 / 3)
  expect(ay + slope(geometry[0]) * (midX - ax)).toBeCloseTo((by + cy) / 2, 8)

  const comparisonRange = await comparison.getByTestId('viewport').textContent()
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  const afterZoom = await page.evaluate(() => window.pitchfork)
  expect(afterZoom.length).toBeGreaterThanOrEqual(2)
  for (const segment of afterZoom.slice(1)) expect(slope(segment)).toBeCloseTo(slope(afterZoom[0]), 8)
  await expect(comparison.getByTestId('viewport')).toHaveText(comparisonRange)
  await primary.getByRole('button', { name: 'Earlier bars' }).click()
  const afterPan = await page.evaluate(() => window.pitchfork)
  expect(afterPan.length).toBeGreaterThanOrEqual(2)
  for (const segment of afterPan.slice(1)) expect(slope(segment)).toBeCloseTo(slope(afterPan[0]), 8)
  await expect(comparison.getByTestId('viewport')).toHaveText(comparisonRange)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(47)
  expect(saved.manifest.preferences.annotations['LOCAL:PITCH'][1]).toMatchObject({
    kind: 'pitchfork', points: [{ time: from, ticks: -5000000 },
      { time: from + 60, ticks: -2000001 }, { time: from + 420, ticks: 4000000 }],
  })
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(drawings.getByText(/Pitchfork -5 at/)).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await expect(drawings.getByText(/Pitchfork -5 at/)).toBeVisible()
  expect(await page.evaluate(() => window.pitchfork)).toHaveLength(3)
})
