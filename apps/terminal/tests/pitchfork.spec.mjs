import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

async function tracePitchforks(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('PITCH interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.pitchfork = { classic: [], schiff: [], modified: [] }
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
      const kind = {
        '#bea2f2': 'classic', '#8874af': 'classic',
        '#e8c076': 'schiff', '#b28c53': 'schiff',
        '#63cbc1': 'modified', '#428e8c': 'modified',
      }[this.strokeStyle]
      if (primary(this) && kind) window.pitchfork[kind].push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
}

test('pitchfork rays share the exact UTC midpoint and stay parallel after zoom and restore', async ({ page }) => {
  await tracePitchforks(page)
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

  const geometry = await page.evaluate(() => window.pitchfork.classic)
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
  const afterZoom = await page.evaluate(() => window.pitchfork.classic)
  expect(afterZoom.length).toBeGreaterThanOrEqual(2)
  for (const segment of afterZoom.slice(1)) expect(slope(segment)).toBeCloseTo(slope(afterZoom[0]), 8)
  await expect(comparison.getByTestId('viewport')).toHaveText(comparisonRange)
  await primary.getByRole('button', { name: 'Earlier bars' }).click()
  const afterPan = await page.evaluate(() => window.pitchfork.classic)
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
  expect(await page.evaluate(() => window.pitchfork.classic)).toHaveLength(3)
})

test('Schiff variants use distinct origins and retain exact anchors offline', async ({ page, context }) => {
  await tracePitchforks(page)
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await context.setOffline(true)
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((from + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const offsets = [0, 60, 120, 300, 360, 420, 480, 540, 600, 660]
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  await openImport(page, 'PITCH', [header, ...offsets.map(offset => [from + offset, 0, 12, -12, 0, 1].join(','))].join('\n'))
  await submitImport(page, 'PITCH')
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const anchors = [[0, '-5'], [61, '-2.000001'], [420, '4']]
  async function create(label, points = anchors) {
    await drawings.getByRole('button', { name: 'New ' + label.toLowerCase(), exact: true }).click()
    const editor = drawings.getByRole('form', { name: label, exact: true })
    for (const [index, [offset, price]] of points.entries()) {
      const point = editor.getByRole('group', { name: 'Point ' + (index + 1) })
      await point.getByLabel('Time (UTC)').fill(iso(offset))
      await point.getByLabel('Price').fill(price)
    }
    await editor.getByRole('button', { name: 'Save ' + label.toLowerCase(), exact: true }).click()
    return editor
  }

  await create('Pitchfork')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(47)
  const rejected = await create('Schiff pitchfork', [[60, '-5'], [0, '-2'], [120, '-5']])
  await expect(rejected.getByRole('alert')).toHaveText('Schiff pitchfork needs a distinct median origin and midpoint.')
  await rejected.getByRole('button', { name: 'Cancel' }).click()
  await create('Schiff pitchfork')
  await create('Modified Schiff pitchfork')
  const schiff = drawings.getByText(/^Schiff pitchfork .*Median origin -3\.5000005 at 2025-06-03T14:00:00Z$/)
  const modified = drawings.getByText(/^Modified Schiff pitchfork .*Median origin -3\.5000005 at 2025-06-03T14:00:30\.500Z$/)
  await expect(schiff).toBeVisible()
  await expect(modified).toBeVisible()

  const geometry = await page.evaluate(() => window.pitchfork)
  const slope = ([[x0, y0], [x1, y1]]) => (y1 - y0) / (x1 - x0)
  const [[ax, ay], [bx, by], [cx, cy]] = geometry.classic.map(segment => segment[0])
  const spacing = (cx - ax) / 5
  const midX = ax + spacing * (2 + (240.5 - 120) / (300 - 120))
  for (const [kind, expectedX] of [['schiff', ax], ['modified', (ax + bx) / 2]]) {
    const [median, upper, lower] = geometry[kind]
    expect(geometry[kind]).toHaveLength(3)
    expect(upper[0]).toEqual([bx, by])
    expect(lower[0]).toEqual([cx, cy])
    expect(median[0][0]).toBeCloseTo(expectedX, 8)
    expect(median[0][1]).toBeCloseTo((ay + by) / 2, 8)
    expect(slope(upper)).toBeCloseTo(slope(median), 8)
    expect(slope(lower)).toBeCloseTo(slope(median), 8)
    expect(median[0][1] + slope(median) * (midX - expectedX)).toBeCloseTo((by + cy) / 2, 8)
  }
  expect(slope(geometry.schiff[0])).not.toBeCloseTo(slope(geometry.modified[0]), 4)

  await drawings.getByRole('button', { name: /^Edit Modified Schiff pitchfork / }).click()
  const edit = drawings.getByRole('form', { name: 'Modified Schiff pitchfork', exact: true })
  await edit.getByRole('group', { name: 'Point 2' }).getByLabel('Price').fill('-4.000001')
  await edit.getByRole('button', { name: 'Save modified schiff pitchfork' }).click()
  await expect(drawings.getByText(/^Modified Schiff pitchfork .*Median origin -4\.5000005 at 2025-06-03T14:00:30\.500Z$/)).toBeVisible()
  await expect(schiff).toBeVisible()
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(84)
  const entries = saved.manifest.preferences.annotations['LOCAL:PITCH']
  expect(entries.map(entry => entry.kind)).toEqual(['pitchfork', 'schiff-pitchfork', 'modified-schiff-pitchfork'])
  expect(entries[2].points).toEqual([
    { time: from, ticks: -5000000 }, { time: from + 61, ticks: -4000001 }, { time: from + 420, ticks: 4000000 },
  ])

  for (const [bundle, count] of [[legacy, 0], [saved, 2]]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(drawings.getByText(/Median origin/)).toHaveCount(count)
  }
  await page.reload()
  await expect(schiff).toBeVisible()
  await expect(drawings.getByText(/^Modified Schiff pitchfork .*Median origin -4\.5000005 at 2025-06-03T14:00:30\.500Z$/)).toBeVisible()
  const restored = await page.evaluate(() => window.pitchfork)
  expect(restored.classic).toHaveLength(3)
  expect(restored.schiff).toHaveLength(3)
  expect(restored.modified).toHaveLength(3)
})
