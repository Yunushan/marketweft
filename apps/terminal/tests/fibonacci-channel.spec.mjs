import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Fibonacci channel edits signed width and projects parallel rails in both panes offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const { scale, stroke, beginPath, moveTo, lineTo } = canvas
    const paths = new WeakMap()
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('FIBCHANNEL interactive ') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    window.fibChannelRails = {}
    canvas.scale = function (...args) {
      const name = pane(this)
      if (name) window.fibChannelRails[name] = []
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
      const name = pane(this)
      if (name && ['#69b7c7', '#978dc2'].includes(this.strokeStyle)) {
        window.fibChannelRails[name].push(paths.get(this))
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
  const csv = [header, ...[0, 60, 240, 360, 540].map((offset, index) =>
    [start + offset, 0, 20, -20, 1, index + 1].join(','))].join('\n')
  await openImport(page, 'FIBCHANNEL', csv)
  await submitImport(page, 'FIBCHANNEL')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:FIBCHANNEL')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('equivolume')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(64)

  await drawings.getByRole('button', { name: 'New fibonacci channel', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Fibonacci channel', exact: true })
  const width = form.getByRole('group', { name: 'Width anchor' })
  const save = () => form.getByRole('button', { name: 'Save fibonacci channel' }).click()
  async function anchor(name, offset, price) {
    const controls = form.getByRole('group', { name, exact: true })
    await controls.getByLabel('Time (UTC)').fill(iso(offset))
    await controls.getByLabel('Price').fill(String(price))
  }
  await anchor('Baseline start', 0, -4)
  await anchor('Baseline end', 240, 4)
  await anchor('Width anchor', 300, 3)
  await save()
  await expect(form.getByRole('alert')).toContainText('within an increasing baseline')
  await anchor('Width anchor', 120, 0)
  await save()
  await expect(form.getByRole('alert')).toContainText('away from the baseline')
  await width.getByLabel('Price').fill('3')
  await save()
  const show = drawings.getByText('Fibonacci channel levels', { exact: true })
  await show.click()
  const table = drawings.getByRole('table', { name: 'Fibonacci channel price levels' })
  const row = index => table.locator('tbody tr').nth(index).locator('th,td')
  await expect(row(1)).toHaveText(['0.618×', '1.854', '-2.146', '5.854'])
  await expect(row(2)).toHaveText(['1×', '3', '-1', '7'])
  await expect(row(5)).toHaveText(['4.236×', '12.708', '8.708', '16.708'])
  const trace = name => page.evaluate(pane => window.fibChannelRails[pane], name)
  for (const name of ['Primary chart pane', 'Comparison chart pane']) {
    await expect.poll(async () => (await trace(name))?.length).toBe(6)
    const rays = await trace(name)
    const slope = ([[x1, y1], [x2, y2]]) => (y2 - y1) / (x2 - x1)
    for (const [[x1, y1], [x2, y2]] of rays) {
      expect(x1).toBeCloseTo(rays[0][0][0])
      expect(x2).toBeGreaterThan(x1)
      expect(Math.min(y1, y2)).toBeGreaterThanOrEqual(19 - 1e-8)
    }
    for (const ray of rays) expect(slope(ray)).toBeCloseTo(slope(rays[0]), 8)
    expect(rays[5][0][1]).toBeLessThan(rays[0][0][1])
  }

  await drawings.getByRole('button', { name: /Edit Fibonacci channel/ }).click()
  await width.getByLabel('Price').fill('-3')
  await save()
  if (!await table.isVisible()) await show.click()
  await expect(row(5)).toHaveText(['4.236×', '-12.708', '-16.708', '-8.708'])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(65)
  expect(saved.manifest.preferences.annotations['LOCAL:FIBCHANNEL'][0]).toMatchObject({
    kind: 'fibonacci-channel',
    points: [{ time: start, ticks: -4000000 }, { time: start + 240, ticks: 4000000 }, { time: start + 120, ticks: -3000000 }],
  })
  expect(saved.manifest.preferences.chartTypes).toEqual(prior.manifest.preferences.chartTypes)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(comparisonType).toHaveValue('equivolume')
    await expect(show).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await show.click()
  await expect(row(5)).toHaveText(['4.236×', '-12.708', '-16.708', '-8.708'])
})
