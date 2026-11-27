import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Fibonacci fan rays use signed prices, interpolate a UTC gap and survive edits and restore', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('FIBFAN interactive') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    window.fanGeometry = {}
    proto.scale = function (...args) {
      const key = pane(this)
      if (key) window.fanGeometry[key] = { rays: [], wicks: [] }
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
    proto.stroke = function (...args) {
      const info = window.fanGeometry[pane(this)]
      const path = paths.get(this)
      if (info && path?.length === 2) {
        if (this.strokeStyle === '#64c7b6') info.rays.push(path)
        if (this.strokeStyle === '#68d7b1' && path[0][0] === path[1][0]) info.wicks.push(path)
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const opening = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((opening + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const csv = [header, ...[0, 60, 240, 300, 480, 780].map(offset =>
    [opening + offset, 0, 12, -12, 1, 10].join(','))].join('\n')
  await openImport(page, 'FIBFAN', csv)
  await submitImport(page, 'FIBFAN')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:FIBFAN')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const legacy = await downloadWorkspace(page)

  await drawings.getByRole('button', { name: 'New fibonacci fan' }).click()
  const form = drawings.getByRole('form', { name: 'Fibonacci fan' })
  const start = form.getByRole('group', { name: 'Start' })
  const end = form.getByRole('group', { name: 'End' })
  const save = () => form.getByRole('button', { name: 'Save fibonacci fan' }).click()
  await start.getByLabel('Time (UTC)').fill(iso(0))
  await end.getByLabel('Time (UTC)').fill(iso(0))
  await start.getByLabel('Price').fill('-5')
  await end.getByLabel('Price').fill('0.000001')
  await save()
  await expect(form.getByRole('alert')).toContainText('needs a later end time')
  await end.getByLabel('Time (UTC)').fill(iso(120))
  await end.getByLabel('Price').fill('-5')
  await save()
  await expect(form.getByRole('alert')).toContainText('two different prices')
  await end.getByLabel('Price').fill('0.000001')
  await save()
  await drawings.getByText('Fan levels', { exact: true }).click()
  const levels = drawings.getByRole('group', { name: 'Fibonacci fan prices at the end time' })
  for (const label of ['38.2% -3.09', '50% -2.5', '61.8% -1.909999'])
    await expect(levels.getByText(label, { exact: true })).toBeVisible()

  const geometry = pane => page.evaluate(name => window.fanGeometry[name], pane)
  const primaryName = 'Primary chart pane'
  const comparisonName = 'Comparison chart pane'
  await expect.poll(async () => (await geometry(primaryName))?.rays.length).toBe(3)
  const { rays, wicks } = await geometry(primaryName)
  expect(wicks).toHaveLength(6)
  const [[[firstX, highY], [, lowY]], [[secondX]], [[thirdX]]] = wicks
  const targetX = secondX + (thirdX - secondX) / 3
  const priceY = price => highY + (lowY - highY) * (12 - price) / 24
  for (const [index, price] of [-3.09, -2.5, -1.909999].entries()) {
    const [[x1, y1], [x2, y2]] = rays[index]
    expect(x1).toBeCloseTo(firstX)
    expect(y1).toBeCloseTo(priceY(-5))
    expect(x2).toBeGreaterThan(targetX)
    expect(y2).toBeLessThan(y1)
    expect(y1 + (y2 - y1) * (targetX - x1) / (x2 - x1)).toBeCloseTo(priceY(price))
  }
  await expect.poll(async () => (await geometry(comparisonName))?.rays.length).toBe(3)
  const otherViewport = await comparison.getByTestId('viewport').textContent()
  const otherRays = (await geometry(comparisonName)).rays
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => (await geometry(primaryName))?.rays[0]?.[0][0]).toBeCloseTo(10)
  await expect(comparison.getByTestId('viewport')).toHaveText(otherViewport)
  expect((await geometry(comparisonName)).rays).toEqual(otherRays)

  await drawings.getByRole('button', { name: /Edit Fibonacci fan/ }).click()
  await start.getByLabel('Price').fill('2')
  await end.getByLabel('Price').fill('-7')
  await save()
  if (!await levels.isVisible()) await drawings.getByText('Fan levels', { exact: true }).click()
  for (const label of ['38.2% -1.438', '50% -2.5', '61.8% -3.562'])
    await expect(levels.getByText(label, { exact: true })).toBeVisible()
  const falling = (await geometry(primaryName)).rays
  expect(falling).toHaveLength(3)
  for (const [[, y1], [, y2]] of falling) expect(y2).toBeGreaterThan(y1)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(53)
  expect(saved.manifest.preferences.annotations['LOCAL:FIBFAN'][0]).toMatchObject({
    kind: 'fibonacci-fan',
    start: { time: opening, ticks: 2000000 },
    end: { time: opening + 120, ticks: -7000000 },
  })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(drawings.getByText('Fan levels', { exact: true })).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await drawings.getByText('Fan levels', { exact: true }).click()
  await expect(levels.getByText('61.8% -3.562', { exact: true })).toBeVisible()
})
