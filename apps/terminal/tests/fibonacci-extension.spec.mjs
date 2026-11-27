import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Fibonacci extensions use exact signed prices and restore three independent anchors', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('FIBX interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (isPrimary(this)) window.extensionLines = []
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (isPrimary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (isPrimary(this) && this.strokeStyle === '#cbbce8') window.extensionLines.push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((from + offset * 60) * 1000).toISOString().replace('.000Z', 'Z')
  const data = [header, ...Array.from({ length: 12 }, (_, index) =>
    [from + index * 60, 0, 12, -12, 0, 1].join(','))].join('\n')
  await openImport(page, 'FIBX', data)
  await submitImport(page, 'FIBX')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBeLessThan(50)

  await drawings.getByRole('button', { name: 'New fibonacci price extension' }).click()
  const form = drawings.getByRole('form', { name: 'Fibonacci price extension' })
  const start = form.getByRole('group', { name: 'Move start' })
  const end = form.getByRole('group', { name: 'Move end' })
  const projection = form.getByRole('group', { name: 'Projection anchor' })
  for (const [point, offset, price] of [[start, 1, '-2.000001'], [end, 3, '1'], [projection, 3, '-1.5']]) {
    await point.getByLabel('Time (UTC)').fill(iso(offset))
    await point.getByLabel('Price').fill(price)
  }
  const save = () => form.getByRole('button', { name: 'Save fibonacci price extension' }).click()
  await save()
  await expect(form.getByRole('alert')).toContainText('times must run from earliest to latest')
  await projection.getByLabel('Time (UTC)').fill(iso(6))
  await end.getByLabel('Price').fill('-2.000001')
  await save()
  await expect(form.getByRole('alert')).toContainText('first two Fibonacci prices must differ')
  await end.getByLabel('Price').fill('1')
  await save()
  await drawings.getByText('Projection levels', { exact: true }).click()
  const projections = drawings.getByRole('group', { name: 'Fibonacci extension levels' })
  await expect(projections.getByText('38.2% -0.354', { exact: true })).toBeVisible()
  await expect(projections.getByText('61.8% 0.354001', { exact: true })).toBeVisible()
  await expect(projections.getByText('261.8% 6.354003', { exact: true })).toBeVisible()

  const geometry = await page.evaluate(() => window.extensionLines)
  expect(geometry).toHaveLength(8)
  const [left, right] = geometry[0]
  expect(left[0]).toBeLessThan(right[0])
  for (const [start, end] of geometry) {
    expect(start[0]).toBeCloseTo(left[0])
    expect(end[0]).toBeCloseTo(right[0])
    expect(start[1]).toBeCloseTo(end[1])
  }
  expect(geometry.at(-1)[0][1]).toBeLessThan(left[1])
  const otherViewport = await comparison.getByTestId('viewport').textContent()
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  await expect(comparison.getByTestId('viewport')).toHaveText(otherViewport)

  await drawings.getByRole('button', { name: /Edit Fibonacci price extension/ }).click()
  await end.getByLabel('Price').fill('-3.000001')
  await save()
  if (!await projections.isVisible()) await drawings.getByText('Projection levels', { exact: true }).click()
  await expect(projections.getByText('161.8% -3.118', { exact: true })).toBeVisible()
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(50)
  expect(saved.manifest.preferences.annotations['LOCAL:FIBX'][0]).toMatchObject({
    kind: 'fibonacci-extension',
    points: [{ time: from + 60, ticks: -2000001 },
      { time: from + 180, ticks: -3000001 }, { time: from + 360, ticks: -1500000 }],
  })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)

  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(drawings.getByText('Projection levels', { exact: true })).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await drawings.getByText('Projection levels', { exact: true }).click()
  await expect(projections.getByText('161.8% -3.118', { exact: true })).toBeVisible()
})
