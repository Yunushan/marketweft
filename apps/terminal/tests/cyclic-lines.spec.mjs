import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline cyclic lines follow exact UTC and restore both anchors', async ({ page, context }) => {
  await page.addInitScript(() => {
    const prototype = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = prototype
    const paths = new WeakMap()
    const matches = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('CYCLES interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    prototype.scale = function (...args) {
      if (matches(this)) window.cyclicLines = []
      return scale.apply(this, args)
    }
    prototype.beginPath = function () {
      if (matches(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      prototype[name] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    prototype.stroke = function (...args) {
      if (matches(this) && this.strokeStyle === '#70c0ab') window.cyclicLines.push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const origin = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((origin + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const offsets = [0, 60, 240, 300, 480, 780]
  const csv = [header, ...offsets.map(offset => [origin + offset, 5, 8, 3, 6, 10].join(','))].join('\n')
  await openImport(page, 'CYCLES', csv)
  await submitImport(page, 'CYCLES')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  const legacy = await downloadWorkspace(page)

  await drawings.getByRole('button', { name: 'New cyclic lines', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Cyclic lines', exact: true })
  const start = form.getByRole('group', { name: 'Start', exact: true }).getByLabel('Time (UTC)')
  const end = form.getByRole('group', { name: 'End', exact: true }).getByLabel('Time (UTC)')
  const save = () => form.getByRole('button', { name: 'Save cyclic lines', exact: true }).click()
  await start.fill(iso(90))
  await end.fill(iso(0))
  await save()
  await expect(form.getByRole('alert')).toHaveText('The second cycle time must follow the first.')
  const details = drawings.getByText('Cycle times', { exact: true })
  const cycleTimes = drawings.getByRole('group', { name: 'First cyclic UTC times', exact: true })
  await start.fill('9999-12-31T23:59:58Z')
  await end.fill('9999-12-31T23:59:59Z')
  await save()
  await details.click()
  await expect(cycleTimes.locator('span')).toHaveText(['0× 9999-12-31T23:59:58Z', '1× 9999-12-31T23:59:59Z'])
  const edit = () => drawings.getByRole('button', { name: /^Edit Cyclic lines/ }).click()

  await edit()
  await start.fill(iso(0))
  await end.fill(iso(90))
  await save()
  if (!await cycleTimes.isVisible()) await details.click()
  await expect(cycleTimes.locator('span')).toHaveText(Array.from({ length: 8 }, (_, index) => index + '× ' + iso(index * 90)))
  await expect(drawings.getByText('Interval 90 seconds', { exact: true })).toBeVisible()
  const visibleLines = () => page.evaluate(() => window.cyclicLines)
  await expect.poll(async () => (await visibleLines())?.length).toBe(9)
  const lines = await visibleLines()
  for (const [[x1, y1], [x2, y2]] of lines) {
    expect(x1).toBeCloseTo(x2)
    expect(y1).toBeLessThan(y2)
  }
  const xs = lines.map(line => line[0][0])
  expect(xs[2] - xs[1]).toBeCloseTo((xs[1] - xs[0]) * 3 / 7)
  const comparisonViewport = await comparison.getByTestId('viewport').textContent()
  await primary.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await visibleLines())?.length).toBeLessThan(9)
  await expect(comparison.getByTestId('viewport')).toHaveText(comparisonViewport)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(78)
  expect(saved.manifest.preferences.annotations['LOCAL:CYCLES'][0]).toMatchObject({
    kind: 'cyclic-lines', lower: origin, upper: origin + 90,
  })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  await edit()
  await end.fill(iso(1))
  await save()
  if (!await cycleTimes.isVisible()) await details.click()
  await expect(cycleTimes.getByText('7× ' + iso(7), { exact: true })).toBeVisible()
  await expect.poll(async () => (await visibleLines())?.length).toBeGreaterThan(10)
  expect((await visibleLines()).length).toBeLessThanOrEqual(96)
  for (const workspace of [legacy, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, workspace)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(details).toHaveCount(workspace === saved ? 1 : 0)
  }
  await page.reload()
  await details.click()
  await expect(cycleTimes.getByText('7× ' + iso(630), { exact: true })).toBeVisible()
})
