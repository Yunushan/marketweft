import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Fibonacci time zones preserve elapsed UTC through gaps, viewport changes and restore', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('FIBTIME interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.timeZoneLines = []
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (primary(this) && this.strokeStyle === '#829bd6') window.timeZoneLines.push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const opening = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((opening + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const offsets = [0, 60, 240, 300, 480, 780]
  const csv = [header, ...offsets.map(offset => [opening + offset, 5, 8, 3, 6, 10].join(','))].join('\n')
  await openImport(page, 'FIBTIME', csv)
  await submitImport(page, 'FIBTIME')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const legacy = await downloadWorkspace(page)

  await drawings.getByRole('button', { name: 'New fibonacci time zones' }).click()
  const form = drawings.getByRole('form', { name: 'Fibonacci time zones' })
  const start = form.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)')
  const end = form.getByRole('group', { name: 'End' }).getByLabel('Time (UTC)')
  const save = () => form.getByRole('button', { name: 'Save fibonacci time zones' }).click()
  await start.fill(iso(60))
  await end.fill(iso(0))
  await save()
  await expect(form.getByRole('alert')).toContainText('must follow the first')
  await end.fill('10000-01-01T00:00:00Z')
  await save()
  await expect(form.getByRole('alert')).toContainText('YYYY-MM-DDTHH:MM:SSZ')

  await start.fill('9999-12-31T23:59:58Z')
  await end.fill('9999-12-31T23:59:59Z')
  await save()
  await drawings.getByText('Projected times', { exact: true }).click()
  const zones = drawings.getByRole('group', { name: 'Fibonacci projected UTC times' })
  await expect(zones.getByText('0× 9999-12-31T23:59:58Z', { exact: true })).toBeVisible()
  await expect(zones.getByText('2×', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.timeZoneLines)).toHaveLength(0)

  await drawings.getByRole('button', { name: /Edit Fibonacci time zones/ }).click()
  await start.fill(iso(0))
  await end.fill(iso(60))
  await save()
  if (!await zones.isVisible()) await drawings.getByText('Projected times', { exact: true }).click()
  for (const offset of [0, 1, 2, 3, 5, 8, 13, 89]) {
    await expect(zones.getByText(offset + '× ' + iso(offset * 60), { exact: true })).toBeVisible()
  }
  const lines = await page.evaluate(() => window.timeZoneLines)
  expect(lines).toHaveLength(7)
  for (const [[x1, y1], [x2, y2]] of lines) {
    expect(x1).toBeCloseTo(x2)
    expect(y1).toBeLessThan(y2)
  }
  const xs = lines.map(line => line[0][0])
  expect(xs[2] - xs[1]).toBeCloseTo((xs[1] - xs[0]) / 3)
  expect(xs[3] - xs[1]).toBeCloseTo(2 * (xs[1] - xs[0]) / 3)
  expect(xs[4] - xs[0]).toBeCloseTo(3 * (xs[1] - xs[0]))

  const comparisonViewport = await comparison.getByTestId('viewport').textContent()
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(() => page.evaluate(() => window.timeZoneLines.length)).toBe(6)
  await expect(comparison.getByTestId('viewport')).toHaveText(comparisonViewport)
  await expect(zones.getByText('89× ' + iso(5340), { exact: true })).toBeVisible()

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(51)
  expect(saved.manifest.preferences.annotations['LOCAL:FIBTIME'][0]).toMatchObject({
    kind: 'fibonacci-time-zones', lower: opening, upper: opening + 60,
  })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  const restore = async bundle => {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(drawings.getByText('Projected times', { exact: true })).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await drawings.getByText('Projected times', { exact: true }).click()
  await expect(zones.getByText('3× ' + iso(180), { exact: true })).toBeVisible()
})
