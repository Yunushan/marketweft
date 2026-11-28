import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Gann box projects exact price and UTC divisions across data gaps and restores them offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = canvas
    const paths = new WeakMap()
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('GANNBOX interactive') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    window.boxGeometry = {}
    canvas.scale = function (...args) {
      const name = pane(this)
      if (name) window.boxGeometry[name] = { grid: [], wicks: [] }
      return scale.apply(this, args)
    }
    canvas.beginPath = function () {
      if (pane(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      canvas[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    canvas.stroke = function (...args) {
      const geometry = window.boxGeometry[pane(this)]
      const path = paths.get(this)
      if (geometry && path?.length === 2) {
        if (['#7cbaad', '#5c8d84'].includes(this.strokeStyle)) geometry.grid.push(path)
        if (this.strokeStyle === '#68d7b1' && path[0][0] === path[1][0]) geometry.wicks.push(path)
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((start + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const csv = [header, ...[0, 60, 240, 300, 480, 780].map(offset => [start + offset, 0, 20, -20, 1, 10].join(','))].join('\n')
  await openImport(page, 'GANNBOX', csv)
  await submitImport(page, 'GANNBOX')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:GANNBOX')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await page.getByRole('button', { name: /Indicators/ }).click()
  const pivots = page.getByRole('form', { name: 'Primary chart Daily Floor Pivots' })
  await pivots.getByLabel('Show Daily Floor Pivots').check()
  await pivots.getByRole('button', { name: 'Apply Daily Floor Pivots' }).click()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(60)

  await drawings.getByRole('button', { name: 'New gann box', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Gann box', exact: true })
  const first = form.getByRole('group', { name: 'Start' })
  const last = form.getByRole('group', { name: 'End' })
  const save = () => form.getByRole('button', { name: 'Save gann box' }).click()
  await first.getByLabel('Time (UTC)').fill(iso(0))
  await first.getByLabel('Price').fill('-8')
  await last.getByLabel('Time (UTC)').fill(iso(3))
  await last.getByLabel('Price').fill('8')
  await save()
  await expect(form.getByRole('alert')).toContainText('one second and one price tick per division')
  await last.getByLabel('Time (UTC)').fill(iso(240))
  await save()
  const show = drawings.getByText('Gann box levels', { exact: true })
  await show.click()
  const levels = drawings.getByRole('table', { name: 'Gann box price and UTC divisions' })
  await expect(levels.locator('tbody tr').nth(2).locator('th,td')).toHaveText(['2/4', iso(120), '0'])
  const geometry = name => page.evaluate(pane => window.boxGeometry[pane], name)
  for (const pane of ['Primary chart pane', 'Comparison chart pane']) {
    await expect.poll(async () => (await geometry(pane))?.grid.length).toBe(10)
    const { grid, wicks } = await geometry(pane)
    const [[[startX, highY], [, lowY]], [[nextX]], [[endX]]] = wicks
    const vertical = grid.filter(([[x], [end]]) => x === end)
    const horizontal = grid.filter(([[, y], [, end]]) => y === end)
    expect(vertical).toHaveLength(5)
    expect(horizontal).toHaveLength(5)
    expect(vertical[2][0][0]).toBeCloseTo(nextX + (endX - nextX) / 3)
    expect(vertical[3][0][0]).toBeCloseTo(nextX + (endX - nextX) * 2 / 3)
    expect(horizontal[0][0][0]).toBeCloseTo(startX)
    expect(horizontal[0][1][0]).toBeCloseTo(endX)
    expect(horizontal[0][0][1]).toBeCloseTo(highY + (lowY - highY) * 0.7)
    expect(horizontal[2][0][1]).toBeCloseTo((highY + lowY) / 2)
  }

  await drawings.getByRole('button', { name: /Edit Gann box/ }).click()
  await form.getByLabel('Divisions on each axis').selectOption('8')
  await first.getByLabel('Price').fill('8')
  await last.getByLabel('Price').fill('-8')
  await save()
  if (!await levels.isVisible()) await show.click()
  await expect(levels.locator('tbody tr').nth(6).locator('th,td')).toHaveText(['6/8', iso(180), '-4'])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(61)
  expect(saved.manifest.preferences.annotations['LOCAL:GANNBOX'][0]).toMatchObject({
    kind: 'gann-box', divisions: 8,
    start: { time: start, ticks: 8000000 }, end: { time: start + 240, ticks: -8000000 },
  })
  expect(saved.manifest.preferences.studies).toEqual(prior.manifest.preferences.studies)
  for (const bundle of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(show).toHaveCount(bundle === prior ? 0 : 1)
  }
  await page.reload()
  await show.click()
  await expect(levels.locator('tbody tr').nth(6).locator('th,td')).toHaveText(['6/8', iso(180), '-4'])
  await expect(primary.getByRole('group', { name: 'Daily Floor Pivots' })).toBeVisible()
})
