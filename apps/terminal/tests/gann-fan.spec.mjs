import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Gann fan draws signed anchored rays and restores together with version 56 studies', async ({ page, context }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('GANN interactive') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    window.gannGeometry = {}
    proto.scale = function (...args) {
      const key = pane(this)
      if (key) window.gannGeometry[key] = { rays: [], wicks: [] }
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
      const info = window.gannGeometry[pane(this)]
      const path = paths.get(this)
      if (info && path?.length === 2) {
        if (['#ecc877', '#bbaee6'].includes(this.strokeStyle)) info.rays.push(path)
        if (this.strokeStyle === '#68d7b1' && path[0][0] === path[1][0]) info.wicks.push(path)
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const opening = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((opening + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const csv = [header, ...[0, 60, 240, 300, 480, 780].map(offset =>
    [opening + offset, 0, 20, -20, 1, 10].join(','))].join('\n')
  await openImport(page, 'GANN', csv)
  await submitImport(page, 'GANN')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:GANN')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await page.getByRole('button', { name: /Indicators/ }).click()
  const wma = page.getByRole('form', { name: 'Primary chart WMA' })
  await wma.getByLabel('Show WMA').check()
  await wma.getByLabel('WMA period (bars)').fill('2')
  await wma.getByRole('button', { name: 'Apply WMA' }).click()
  await expect(wma.getByRole('button', { name: 'Apply WMA' })).toBeEnabled()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(56)

  await drawings.getByRole('button', { name: 'New gann fan', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Gann fan' })
  const start = form.getByRole('group', { name: 'Start' })
  const end = form.getByRole('group', { name: 'End' })
  const save = () => form.getByRole('button', { name: 'Save gann fan', exact: true }).click()
  await start.getByLabel('Time (UTC)').fill(iso(0))
  await end.getByLabel('Time (UTC)').fill(iso(0))
  await start.getByLabel('Price').fill('-1')
  await end.getByLabel('Price').fill('1')
  await save()
  await expect(form.getByRole('alert')).toContainText('needs a later end time')
  await end.getByLabel('Time (UTC)').fill(iso(120))
  await save()
  const show = drawings.getByText('Gann fan levels', { exact: true })
  const levels = drawings.getByRole('group', { name: 'Gann fan prices at the end time' })
  await show.click()
  const prices = [-0.75, -0.5, -0.333333, 0, 1, 3, 5, 7, 15]
  await expect(levels.locator('span')).toHaveText(['1×8 -0.75', '1×4 -0.5', '1×3 -0.333333',
    '1×2 0', '1×1 1', '2×1 3', '3×1 5', '4×1 7', '8×1 15'])
  const geometry = name => page.evaluate(pane => window.gannGeometry[pane], name)
  await expect.poll(async () => (await geometry('Primary chart pane'))?.rays.length).toBe(9)
  await expect.poll(async () => (await geometry('Comparison chart pane'))?.rays.length).toBe(9)
  const { rays, wicks } = await geometry('Primary chart pane')
  const [[[firstX, highY], [, lowY]], [[secondX]], [[thirdX]]] = wicks
  const targetX = secondX + (thirdX - secondX) / 3
  const priceY = price => highY + (lowY - highY) * (20 - price) / 40
  for (const [index, price] of prices.entries()) {
    const [[x1, y1], [x2, y2]] = rays[index]
    expect(x1).toBeCloseTo(firstX)
    expect(y1).toBeCloseTo(priceY(-1))
    expect(x2).toBeGreaterThan(targetX)
    expect(y1 + (y2 - y1) * (targetX - x1) / (x2 - x1)).toBeCloseTo(priceY(price))
  }
  await drawings.getByRole('button', { name: /Edit Gann fan/ }).click()
  await start.getByLabel('Price').fill('1')
  await end.getByLabel('Price').fill('-1')
  await save()
  if (!await levels.isVisible()) await show.click()
  await expect(levels.getByText('8×1 -15', { exact: true })).toBeVisible()
  expect((await geometry('Primary chart pane')).rays.every(([[, from], [, to]]) => to > from)).toBe(true)
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(57)
  expect(saved.manifest.preferences.annotations['LOCAL:GANN'][0]).toMatchObject({ kind: 'gann-fan',
    start: { time: opening, ticks: 1000000 }, end: { time: opening + 120, ticks: -1000000 } })
  expect(saved.manifest.preferences.studies).toEqual(prior.manifest.preferences.studies)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(prior)
  await expect(show).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await show.click()
  await expect(levels.getByText('8×1 -15', { exact: true })).toBeVisible()
  await expect(primary.getByRole('group', { name: 'Weighted Moving Average', exact: true })).toHaveText('WMA 2 1')
})
