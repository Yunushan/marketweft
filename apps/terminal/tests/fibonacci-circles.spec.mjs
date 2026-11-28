import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Fibonacci circles keep their signed anchors and circular geometry through offline edits and restore', async ({ page, context }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { arc, scale } = proto
    proto.scale = function (...args) {
      if (this.canvas.getAttribute('aria-label')?.startsWith('FIBCIRCLES interactive ')) this.canvas.fibonacciCircles = []
      return scale.apply(this, args)
    }
    proto.arc = function (x, y, radius, ...rest) {
      if (this.canvas.fibonacciCircles && ['#86d2c9', '#629db1'].includes(this.strokeStyle)) {
        this.canvas.fibonacciCircles.push({ x, y, radius, anchor: this.strokeStyle === '#86d2c9' })
      }
      return arc.call(this, x, y, radius, ...rest)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((start + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const csv = [header, ...[0, 60, 240, 360, 540, 660, 780, 960].map((offset, index) =>
    [start + offset, 0, 20, -20, 1, index + 1].join(','))].join('\n')
  await openImport(page, 'FIBCIRCLES', csv)
  await submitImport(page, 'FIBCIRCLES')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:FIBCIRCLES')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  await page.getByLabel('Comparison chart type').selectOption('equivolume')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(64)

  await drawings.getByRole('button', { name: 'New fibonacci circles', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Fibonacci circles', exact: true })
  const save = () => form.getByRole('button', { name: 'Save fibonacci circles', exact: true }).click()
  async function anchor(label, offset, price) {
    const group = form.getByRole('group', { name: label, exact: true })
    await group.getByLabel('Time (UTC)').fill(iso(offset))
    await group.getByLabel('Price').fill(String(price))
  }
  await anchor('Centre', 240, -4)
  await anchor('Radius anchor', 240, -4)
  await save()
  await expect(form.getByRole('alert')).toContainText('two different anchor points')
  await anchor('Radius anchor', 150, 5)
  await save()

  const summary = drawings.getByText('Fibonacci circle levels', { exact: true })
  const table = drawings.getByRole('table', { name: 'Fibonacci circle anchor projections', exact: true })
  const level = label => table.getByRole('row', { name: new RegExp('^' + label + '× ') }).locator('th,td')
  await summary.click()
  await expect(level('0\\.236')).toHaveText(['0.236×', '-21', '-1.876'])
  await expect(level('1')).toHaveText(['1×', '-90', '5'])
  await expect(level('2\\.618')).toHaveText(['2.618×', '-236', '19.562'])

  async function readCircles(pane) {
    const canvas = pane.locator('canvas')
    await expect.poll(() => canvas.evaluate(element => element.fibonacciCircles?.length)).toBe(9)
    const circles = await canvas.evaluate(element => element.fibonacciCircles)
    const base = circles.find(circle => circle.anchor)
    expect(base.radius).toBeGreaterThan(0)
    expect(circles.map(circle => Math.round(circle.radius * 1000 / base.radius)))
      .toEqual([236, 382, 500, 618, 786, 1000, 1272, 1618, 2618])
    for (const circle of circles) {
      expect(circle.x).toBe(base.x)
      expect(circle.y).toBe(base.y)
    }
    return base.radius
  }
  const beforeZoom = await readCircles(primary)
  await readCircles(comparison)
  await primary.getByRole('button', { name: 'Zoom in', exact: true }).click()
  expect(await readCircles(primary)).not.toBeCloseTo(beforeZoom)

  await drawings.getByRole('button', { name: /Edit Fibonacci circles/ }).click()
  await anchor('Radius anchor', 240, 5)
  await save()
  if (!await table.isVisible()) await summary.click()
  await expect(level('2\\.618')).toHaveText(['2.618×', '0', '19.562'])
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(74)
  expect(saved.manifest.preferences.annotations['LOCAL:FIBCIRCLES'][0]).toMatchObject({
    kind: 'fibonacci-circles', start: { time: start + 240, ticks: -4000000 },
    end: { time: start + 240, ticks: 5000000 },
  })
  expect(saved.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(summary).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await summary.click()
  await expect(level('1')).toHaveText(['1×', '0', '5'])
  await readCircles(primary)
})
