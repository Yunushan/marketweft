import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents, downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const pane = (page, name = 'Primary') => page.getByRole('region', { name: name + ' chart pane' })
const tools = panel => panel.getByRole('region', { name: 'Chart drawings' })
const editor = (panel, kind) => tools(panel).getByRole('form', { name: kind, exact: true })

async function add(panel, kind, value) {
  await tools(panel).getByRole('button', { name: 'New ' + kind.toLowerCase() }).click()
  await editor(panel, kind).getByRole('textbox').fill(value)
  await editor(panel, kind).getByRole('button', { name: 'Save ' + kind.toLowerCase() }).click()
  await expect(tools(panel).getByText(kind + ' ' + value, { exact: true })).toBeVisible()
}

async function compare(page, id) {
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption(id)
  await expect(instrument).toBeEnabled()
  await expect(instrument).toHaveValue(id)
}

async function restore(page, backup) {
  await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
  await selectBackup(page, backup)
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByText('Workspace restored.')).toBeVisible()
}

async function traceDrawings(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('ANNOTATIONS interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.chartMarks = { prices: [], times: [], rays: [], trends: [], grid: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (primary(this)) paths.get(this)?.push([x, y])
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (primary(this)) {
        const path = paths.get(this) ?? []
        if (this.strokeStyle === '#e4b96a') window.chartMarks.prices.push(path)
        if (this.strokeStyle === '#ad9df5') window.chartMarks.times.push(path)
        if (this.strokeStyle === '#83d1ef') window.chartMarks.rays.push(path)
        if (this.strokeStyle === '#ee9dbd') window.chartMarks.trends.push(path)
        if (this.strokeStyle === '#293036' && path.length === 2) window.chartMarks.grid.push(path)
      }
      return stroke.apply(this, arguments)
    }
  })
}

test('draws exact price and UTC anchors, interpolates a gap, and restores measurement-only backups', async ({ page, context }) => {
  await traceDrawings(page)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'ANNOTATIONS', csv)
  await submitImport(page, 'ANNOTATIONS')
  const originalHistory = (await catalogContents(page)).series
  const left = pane(page)
  await left.getByRole('button', { name: 'Draw measurement' }).click()
  await left.getByRole('button', { name: 'Save measurement' }).click()
  await expect(left.getByRole('definition')).toHaveCount(3)
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(3)

  await add(left, 'Price line', '-7.000001')
  await add(left, 'Price line', '9.125')
  await add(left, 'Time marker', '2026-01-01T09:02:00Z')
  await add(left, 'Time marker', '2026-01-01T09:04:00Z')
  await add(left, 'Time marker', '2026-01-01T09:06:00Z')

  const trace = () => page.evaluate(() => window.chartMarks)
  await expect.poll(async () => [(await trace()).prices.length, (await trace()).times.length]).toEqual([2, 3])
  const original = await trace()
  const [priceLow, priceHigh] = original.prices
  expect(priceLow[0][1]).toEqual(priceLow[1][1])
  expect(priceHigh[0][1]).toBeLessThan(priceLow[0][1])
  expect(priceLow.map(([x]) => x)).toEqual(original.grid[0].map(([x]) => x))
  const [before, middle, after] = original.times.map(line => line[0][0])
  expect(middle).toBeCloseTo((before + after) / 2, 6)
  expect(original.times.every(line => line[0][0] === line[1][0])).toBe(true)
  await left.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await trace()).times[1]?.[0][0]).not.toBe(middle)
  expect((await trace()).prices).toHaveLength(2)
  await left.getByRole('button', { name: 'Reset chart view' }).click()

  await compare(page, 'LOCAL:ANNOTATIONS')
  const right = pane(page, 'Comparison')
  await expect(tools(right).getByRole('listitem')).toHaveCount(5)
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('NASDAQ:NVDA')
  await expect(instrument).toBeEnabled()
  await expect(tools(right).getByRole('listitem')).toHaveCount(0)
  await expect(tools(left).getByRole('listitem')).toHaveCount(5)
  await instrument.selectOption('LOCAL:ANNOTATIONS')
  await expect(instrument).toBeEnabled()

  await tools(left).getByRole('button', { name: 'Edit Time marker 2026-01-01T09:06:00Z' }).click()
  const timeEditor = editor(left, 'Time marker')
  await timeEditor.getByRole('button', { name: 'Pick on chart' }).click()
  const canvas = left.getByLabel(/^ANNOTATIONS interactive/)
  const firstLine = (await trace()).times[0]
  await canvas.click({ position: { x: firstLine[0][0], y: 65 } })
  await expect(timeEditor.getByRole('textbox')).toHaveValue('2026-01-01T09:02:00Z')
  await timeEditor.getByRole('button', { name: 'Save time marker' }).click()
  await expect(tools(right).getByText('Time marker 2026-01-01T09:02:00Z', { exact: true })).toHaveCount(2)

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(31)
  const records = current.manifest.preferences.annotations['LOCAL:ANNOTATIONS']
  expect(new Set(records.map(record => record.id)).size).toBe(5)
  expect(records.map(({ id, ...record }) => record)).toEqual([
    { kind: 'price', ticks: -7000001 }, { kind: 'price', ticks: 9125000 },
    { kind: 'time', time: Date.parse('2026-01-01T09:02:00Z') / 1000 },
    { kind: 'time', time: Date.parse('2026-01-01T09:04:00Z') / 1000 },
    { kind: 'time', time: Date.parse('2026-01-01T09:02:00Z') / 1000 },
  ])
  expect(current.manifest.preferences.drawings).toEqual(legacy.manifest.preferences.drawings)
  await restore(page, legacy)
  await expect(tools(left).getByRole('listitem')).toHaveCount(0)
  await expect(left.getByRole('definition')).toHaveCount(3)
  await restore(page, current)
  await page.reload()
  await expect(tools(left).getByRole('listitem')).toHaveCount(5)
  expect((await catalogContents(page)).series).toEqual(originalHistory)
})

test('independent edits keep other anchors, while stale edits to the same anchor are rejected', async ({ page }) => {
  await page.goto('/')
  await compare(page, 'NASDAQ:NVDA')
  const left = pane(page)
  const right = pane(page, 'Comparison')
  await add(left, 'Price line', '125')
  await add(left, 'Price line', '126')
  const before = (await downloadWorkspace(page)).manifest.preferences.annotations['NASDAQ:NVDA']
  await tools(left).getByRole('button', { name: 'Edit Price line 125', exact: true }).click()
  await tools(right).getByRole('button', { name: 'Edit Price line 126', exact: true }).click()
  await editor(right, 'Price line').getByRole('textbox').fill('127')
  await editor(right, 'Price line').getByRole('button', { name: 'Save price line' }).click()
  await expect(tools(right).getByText('Price line 127', { exact: true })).toBeVisible()
  await editor(left, 'Price line').getByRole('textbox').fill('124')
  await editor(left, 'Price line').getByRole('button', { name: 'Save price line' }).click()
  await expect(tools(right).getByText('Price line 124', { exact: true })).toBeVisible()
  expect((await downloadWorkspace(page)).manifest.preferences.annotations['NASDAQ:NVDA']).toEqual([
    { ...before[0], ticks: 124000000 }, { ...before[1], ticks: 127000000 },
  ])

  for (const chart of [left, right]) await tools(chart).getByRole('button', { name: 'Edit Price line 124', exact: true }).click()
  await editor(right, 'Price line').getByRole('textbox').fill('123')
  await editor(right, 'Price line').getByRole('button', { name: 'Save price line' }).click()
  await expect(tools(right).getByText('Price line 123', { exact: true })).toBeVisible()
  await editor(left, 'Price line').getByRole('textbox').fill('122')
  await editor(left, 'Price line').getByRole('button', { name: 'Save price line' }).click()
  await expect(tools(left).getByRole('alert')).toContainText('changed while you were editing')
  await editor(left, 'Price line').getByRole('button', { name: 'Cancel' }).click()
  await tools(right).getByRole('button', { name: 'Remove Price line 123', exact: true }).click()
  await expect(tools(left).getByRole('listitem')).toHaveCount(1)
  await expect(tools(left).getByText('Price line 127', { exact: true })).toBeVisible()
  await tools(left).getByRole('button', { name: 'Remove Price line 127', exact: true }).click()
  await expect(tools(right).getByRole('listitem')).toHaveCount(0)
  expect((await downloadWorkspace(page)).manifest.preferences.annotations).toBeUndefined()
})

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

test('rejects out-of-range controls and rehashed invalid backup anchors without replacing the catalog', async ({ page }) => {
  await page.goto('/')
  const left = pane(page)
  for (const [kind, invalid] of [['Price line', '2000000000.000001'], ['Time marker', '2026-02-30T00:00:00Z']]) {
    await tools(left).getByRole('button', { name: 'New ' + kind.toLowerCase() }).click()
    await editor(left, kind).getByRole('textbox').fill(invalid)
    await editor(left, kind).getByRole('button', { name: 'Save ' + kind.toLowerCase() }).click()
    await expect(editor(left, kind).getByRole('alert')).toBeVisible()
    await editor(left, kind).getByRole('button', { name: 'Cancel' }).click()
  }
  await add(left, 'Price line', '125')
  const saved = await downloadWorkspace(page)
  const original = await catalogContents(page)
  for (const mutate of [
    manifest => { manifest.preferences.annotations.UNKNOWN = manifest.preferences.annotations['NASDAQ:NVDA'] },
    manifest => { manifest.preferences.annotations['NASDAQ:NVDA'].push(manifest.preferences.annotations['NASDAQ:NVDA'][0]) },
    manifest => { manifest.preferences.annotations['NASDAQ:NVDA'][0].ticks = 2_000_000_000_000_001 },
  ]) {
    const invalid = structuredClone(saved)
    mutate(invalid.manifest)
    invalid.sha256 = createHash('sha256').update(canonical(invalid.manifest)).digest('hex')
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, invalid)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('alert')).toContainText('Invalid chart annotation')
    await expect(dialog.getByRole('button', { name: 'Restore workspace', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
  }
  expect(await catalogContents(page)).toEqual(original)
})

test('horizontal rays start at their anchor and trend lines retain two exact endpoints through backup', async ({ page }) => {
  await traceDrawings(page)
  const trace = () => page.evaluate(() => window.chartMarks)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await openImport(page, 'ANNOTATIONS', csv)
  await submitImport(page, 'ANNOTATIONS')
  const left = pane(page)
  const first = '2026-01-01T09:02:00Z'
  const anchor = '2026-01-01T09:04:00Z'
  const last = '2026-01-01T09:06:00Z'
  for (const time of [first, anchor, last]) await add(left, 'Time marker', time)
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(31)
  const before = await trace()
  const [firstX, anchorX, lastX] = before.times.map(path => path[0][0])

  await tools(left).getByRole('button', { name: 'New horizontal ray' }).click()
  const ray = editor(left, 'Horizontal ray')
  await ray.getByRole('textbox', { name: 'Time (UTC)' }).fill(anchor)
  await ray.getByRole('textbox', { name: 'Price' }).fill('-2.000001')
  await ray.getByRole('button', { name: 'Save horizontal ray' }).click()
  await expect(tools(left).getByText('Horizontal ray -2.000001 at ' + anchor)).toBeVisible()

  await tools(left).getByRole('button', { name: 'New trend line' }).click()
  const trend = editor(left, 'Trend line')
  const end = point => trend.getByRole('group', { name: point, exact: true })
  const canvas = left.getByLabel(/^ANNOTATIONS interactive/)
  await trend.getByRole('button', { name: 'Pick end on chart' }).click()
  await canvas.click({ position: { x: lastX, y: 75 } })
  await expect(end('End').getByRole('textbox', { name: 'Time (UTC)' })).toHaveValue(last)
  await end('End').getByRole('textbox', { name: 'Price' }).fill('12')
  await end('Start').getByRole('textbox', { name: 'Time (UTC)' }).fill(last)
  await end('Start').getByRole('textbox', { name: 'Price' }).fill('12')
  await trend.getByRole('button', { name: 'Save trend line' }).click()
  await expect(trend.getByRole('alert')).toContainText('two different points')
  await end('Start').getByRole('textbox', { name: 'Time (UTC)' }).fill(first)
  await end('Start').getByRole('textbox', { name: 'Price' }).fill('-7')
  await trend.getByRole('button', { name: 'Save trend line' }).click()
  const trendLabel = 'Trend line -7 at ' + first + ' to 12 at ' + last
  await expect(tools(left).getByText(trendLabel, { exact: true })).toBeVisible()

  await expect.poll(async () => [(await trace()).rays.length, (await trace()).trends.length]).toEqual([1, 1])
  const marks = await trace()
  expect(marks.rays[0].map(([x]) => x)).toEqual([anchorX, marks.grid[0][1][0]])
  expect(marks.rays[0][0][1]).toEqual(marks.rays[0][1][1])
  expect(marks.trends[0].map(([x]) => x)).toEqual([firstX, lastX])
  expect(marks.trends[0][0][1]).toBeGreaterThan(marks.trends[0][1][1])
  await left.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await trace()).trends[0][1][0]).not.toBe(lastX)
  const zoomed = await trace()
  expect(zoomed.rays[0][1][0]).toEqual(zoomed.grid[0][1][0])
  await left.getByRole('button', { name: 'Reset chart view' }).click()

  const observed = value => Date.parse(value) / 1000
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(32)
  const records = backup.manifest.preferences.annotations['LOCAL:ANNOTATIONS']
  expect(records.slice(-2).map(({ id, ...record }) => record)).toEqual([
    { kind: 'ray', start: { time: observed(anchor), ticks: -2000001 } },
    { kind: 'trend', start: { time: observed(first), ticks: -7000000 }, end: { time: observed(last), ticks: 12000000 } },
  ])
  await restore(page, legacy)
  await expect(tools(left).getByRole('listitem')).toHaveCount(3)
  await restore(page, backup)
  await page.reload()
  await expect(tools(left).getByText(trendLabel, { exact: true })).toBeVisible()
  await tools(left).getByRole('button', { name: 'Remove ' + trendLabel, exact: true }).click()
  await expect(tools(left).getByRole('listitem')).toHaveCount(4)
  expect((await downloadWorkspace(page)).version).toBe(32)
  await tools(left).getByRole('button', { name: 'Remove Horizontal ray -2.000001 at ' + anchor, exact: true }).click()
  await expect(tools(left).getByRole('listitem')).toHaveCount(3)
  expect((await downloadWorkspace(page)).version).toBe(31)
})
