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
    const { scale, beginPath, moveTo, lineTo, stroke, strokeRect, fillText, ellipse } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('ANNOTATIONS interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.chartMarks = {
        prices: [], times: [], rays: [], trends: [], rectangles: [], channels: [],
        polylines: [], retracements: [], ellipses: [], triangles: [], labels: [], grid: [],
      }
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
    proto.strokeRect = function (...box) {
      if (primary(this) && this.strokeStyle === '#7eb4e2') window.chartMarks.rectangles.push(box)
      return strokeRect.apply(this, box)
    }
    proto.ellipse = function (...args) {
      if (primary(this) && this.strokeStyle === '#77c0a2') window.chartMarks.ellipses.push(args)
      return ellipse.apply(this, args)
    }
    proto.fillText = function (value, ...coords) {
      if (primary(this) && this.fillStyle === '#cbbce8') window.chartMarks.labels.push(value)
      return fillText.call(this, value, ...coords)
    }
    proto.stroke = function () {
      if (primary(this)) {
        const path = paths.get(this) ?? []
        if (this.strokeStyle === '#e4b96a') window.chartMarks.prices.push(path)
        if (this.strokeStyle === '#ad9df5') window.chartMarks.times.push(path)
        if (this.strokeStyle === '#83d1ef') window.chartMarks.rays.push(path)
        if (this.strokeStyle === '#ee9dbd') window.chartMarks.trends.push(path)
        if (this.strokeStyle === '#c3a662') window.chartMarks.channels.push(path)
        if (this.strokeStyle === '#9aaef0') window.chartMarks.polylines.push(path)
        if (this.strokeStyle === '#b99969') window.chartMarks.triangles.push(path)
        if (this.strokeStyle === '#cbbce8') window.chartMarks.retracements.push(path)
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

test('rectangles and channels preserve area coordinates, parallel offsets and earlier backups', async ({ page }) => {
  await traceDrawings(page)
  const trace = () => page.evaluate(() => window.chartMarks)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await openImport(page, 'ANNOTATIONS', csv)
  await submitImport(page, 'ANNOTATIONS')
  const left = pane(page)
  const first = '2026-01-01T09:02:00Z'
  const middle = '2026-01-01T09:04:00Z'
  const last = '2026-01-01T09:06:00Z'
  for (const time of [first, middle, last]) await add(left, 'Time marker', time)
  for (const price of ['-5', '5']) await add(left, 'Price line', price)
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(31)

  async function draw(kind, from, to) {
    await tools(left).getByRole('button', { name: 'New ' + kind.toLowerCase() }).click()
    const form = editor(left, kind)
    for (const [index, [time, price]] of [from, to].entries()) {
      const point = form.getByRole('group', { name: index === 0 ? 'Start' : 'End', exact: true })
      await point.getByRole('textbox', { name: 'Time (UTC)' }).fill(time)
      await point.getByRole('textbox', { name: 'Price' }).fill(price)
    }
    return { form, save: () => form.getByRole('button', { name: 'Save ' + kind.toLowerCase() }).click() }
  }

  const rectangle = await draw('Rectangle', [last, '5'], [first, '5'])
  await rectangle.save()
  await expect(rectangle.form.getByRole('alert')).toContainText('two different prices')
  await rectangle.form.getByRole('group', { name: 'End', exact: true }).getByRole('textbox', { name: 'Price' }).fill('-5')
  await rectangle.save()
  const boxText = 'Rectangle 5 at ' + last + ' to -5 at ' + first
  await expect(tools(left).getByText(boxText, { exact: true })).toBeVisible()
  const box = await trace()
  const [x1, xMid, x2] = box.times.map(path => path[0][0])
  const [lower, upper] = box.prices.map(path => path[0][1])
  expect(box.rectangles).toEqual([[x1, upper, x2 - x1, lower - upper]])

  const channel = await draw('Parallel channel', [middle, '0.000001'], [last, '5'])
  const offset = channel.form.getByRole('textbox', { name: 'Price offset' })
  await offset.fill('0')
  await channel.save()
  await expect(channel.form.getByRole('alert')).toContainText('nonzero price offset')
  await offset.fill('-2.000001')
  await channel.save()
  const channelText = 'Parallel channel 0.000001 at ' + middle + ' to 5 at ' + last + ', offset -2.000001'
  await expect(tools(left).getByText(channelText, { exact: true })).toBeVisible()
  const [base, edge] = (await trace()).channels
  expect(base.map(([x]) => x)).toEqual([xMid, x2])
  expect(edge.map(([x]) => x)).toEqual([xMid, x2])
  expect(edge[0][1]).toBeGreaterThan(base[0][1])
  expect(edge[0][1] - base[0][1]).toBeCloseTo(edge[1][1] - base[1][1], 9)

  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(33)
  const entries = backup.manifest.preferences.annotations['LOCAL:ANNOTATIONS']
  const seconds = value => Date.parse(value) / 1000
  expect(entries.slice(-2).map(({ id, ...entry }) => entry)).toEqual([
    { kind: 'rectangle', start: { time: seconds(last), ticks: 5000000 }, end: { time: seconds(first), ticks: -5000000 } },
    { kind: 'channel', start: { time: seconds(middle), ticks: 1 }, end: { time: seconds(last), ticks: 5000000 }, offsetTicks: -2000001 },
  ])

  const invalid = structuredClone(backup)
  invalid.manifest.preferences.annotations['LOCAL:ANNOTATIONS'].at(-1).offsetTicks = 2_000_000_000_000_000
  invalid.sha256 = createHash('sha256').update(canonical(invalid.manifest)).digest('hex')
  await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
  await selectBackup(page, invalid)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('shifted channel prices')
  await page.keyboard.press('Escape')
  await expect(tools(left).getByText(channelText, { exact: true })).toBeVisible()

  await restore(page, legacy)
  await expect(tools(left).getByRole('listitem')).toHaveCount(5)
  await restore(page, backup)
  await page.reload()
  await expect(tools(left).getByText(boxText, { exact: true })).toBeVisible()
  await expect(tools(left).getByText(channelText, { exact: true })).toBeVisible()
})

test('polylines preserve point order and Fibonacci levels round exact signed prices', async ({ page }) => {
  await traceDrawings(page)
  const trace = () => page.evaluate(() => window.chartMarks)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await openImport(page, 'ANNOTATIONS', csv)
  await submitImport(page, 'ANNOTATIONS')
  const left = pane(page)
  const first = '2026-01-01T09:02:00Z'
  const middle = '2026-01-01T09:04:00Z'
  const last = '2026-01-01T09:06:00Z'
  for (const time of [first, middle, last]) await add(left, 'Time marker', time)
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(31)
  const [x1, xMid, x2] = (await trace()).times.map(path => path[0][0])

  async function setPoint(form, group, time, price) {
    const point = form.getByRole('group', { name: group, exact: true })
    await point.getByRole('textbox', { name: 'Time (UTC)' }).fill(time)
    await point.getByRole('textbox', { name: 'Price' }).fill(price)
    return point
  }

  await tools(left).getByRole('button', { name: 'New polyline' }).click()
  const polyline = editor(left, 'Polyline')
  await polyline.getByRole('button', { name: 'Add point' }).click()
  await expect(polyline.getByRole('group', { name: 'Point 4', exact: true })).toBeVisible()
  await polyline.getByRole('button', { name: 'Remove point 4' }).click()
  await expect(polyline.getByRole('group')).toHaveCount(3)
  await setPoint(polyline, 'Point 1', first, '-5')
  await setPoint(polyline, 'Point 2', last, '4')
  await setPoint(polyline, 'Point 3', last, '4')
  await polyline.getByRole('button', { name: 'Save polyline' }).click()
  await expect(polyline.getByRole('alert')).toContainText('Consecutive polyline points')
  await setPoint(polyline, 'Point 3', middle, '1')
  await polyline.getByRole('button', { name: 'Save polyline' }).click()
  const polylineText = 'Polyline 3 points, -5 at ' + first + ' to 1 at ' + middle
  await expect(tools(left).getByText(polylineText, { exact: true })).toBeVisible()
  expect((await trace()).polylines[0].map(([x]) => x)).toEqual([x1, x2, xMid])

  await tools(left).getByRole('button', { name: 'New Fibonacci retracement' }).click()
  const fib = editor(left, 'Fibonacci retracement')
  const start = await setPoint(fib, 'Start', first, '-5.000001')
  await fib.getByRole('button', { name: 'Pick start on chart' }).click()
  await expect(fib.getByRole('status')).toContainText('Select a point')
  await left.getByLabel(/^ANNOTATIONS interactive/).click({ position: { x: x1, y: 80 } })
  await expect(start.getByRole('textbox', { name: 'Time (UTC)' })).toHaveValue(first)
  await start.getByRole('textbox', { name: 'Price' }).fill('-5.000001')
  await setPoint(fib, 'End', last, '4')
  await fib.getByRole('button', { name: 'Save Fibonacci retracement' }).click()
  const fibText = 'Fibonacci retracement -5.000001 at ' + first + ' to 4 at ' + last
  await expect(tools(left).getByText(fibText, { exact: true })).toBeVisible()
  const marks = await trace()
  expect(marks.labels).toEqual([
    '0% 4', '23.6% 1.876', '38.2% 0.562', '50% -0.500001',
    '61.8% -1.562001', '78.6% -3.074001', '100% -5.000001',
  ])
  expect(marks.retracements).toHaveLength(7)
  for (const [start, end] of marks.retracements) {
    expect([start[0], end[0]]).toEqual([x1, x2])
    expect(start[1]).toEqual(end[1])
  }

  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(34)
  const entries = backup.manifest.preferences.annotations['LOCAL:ANNOTATIONS']
  const seconds = time => Date.parse(time) / 1000
  expect(entries.slice(-2).map(({ id, ...entry }) => entry)).toEqual([
    { kind: 'polyline', points: [
      { time: seconds(first), ticks: -5000000 }, { time: seconds(last), ticks: 4000000 },
      { time: seconds(middle), ticks: 1000000 },
    ] },
    { kind: 'fibonacci', start: { time: seconds(first), ticks: -5000001 }, end: { time: seconds(last), ticks: 4000000 } },
  ])

  await restore(page, legacy)
  await expect(tools(left).getByRole('listitem')).toHaveCount(3)
  await restore(page, backup)
  await page.reload()
  await expect(tools(left).getByText(polylineText, { exact: true })).toBeVisible()
  await expect(tools(left).getByText(fibText, { exact: true })).toBeVisible()
})

test('ellipse bounds and noncollinear triangle vertices project and restore exactly', async ({ page }) => {
  await traceDrawings(page)
  const trace = () => page.evaluate(() => window.chartMarks)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await openImport(page, 'ANNOTATIONS', csv)
  await submitImport(page, 'ANNOTATIONS')
  const left = pane(page)
  const first = '2026-01-01T09:02:00Z'
  const middle = '2026-01-01T09:04:00Z'
  const last = '2026-01-01T09:06:00Z'
  for (const time of [first, middle, last]) await add(left, 'Time marker', time)
  for (const price of ['-5', '5']) await add(left, 'Price line', price)
  const legacy = await downloadWorkspace(page)

  async function setPoint(form, group, time, price) {
    const point = form.getByRole('group', { name: group, exact: true })
    await point.getByRole('textbox', { name: 'Time (UTC)' }).fill(time)
    await point.getByRole('textbox', { name: 'Price' }).fill(price)
  }

  await tools(left).getByRole('button', { name: 'New ellipse' }).click()
  const ellipse = editor(left, 'Ellipse')
  await setPoint(ellipse, 'Start', last, '5')
  await setPoint(ellipse, 'End', first, '5')
  await ellipse.getByRole('button', { name: 'Save ellipse' }).click()
  await expect(ellipse.getByRole('alert')).toContainText('two different prices')
  await setPoint(ellipse, 'End', first, '-5')
  await ellipse.getByRole('button', { name: 'Save ellipse' }).click()
  const ellipseText = 'Ellipse 5 at ' + last + ' to -5 at ' + first
  await expect(tools(left).getByText(ellipseText, { exact: true })).toBeVisible()
  const marks = await trace()
  const [x1, xMid, x2] = marks.times.map(path => path[0][0])
  const [lower, upper] = marks.prices.map(path => path[0][1])
  expect(marks.ellipses).toEqual([[(x1 + x2) / 2, (upper + lower) / 2, (x2 - x1) / 2, (lower - upper) / 2, 0, 0, 2 * Math.PI]])

  await tools(left).getByRole('button', { name: 'New triangle' }).click()
  const triangle = editor(left, 'Triangle')
  await setPoint(triangle, 'Point 1', first, '-8')
  await setPoint(triangle, 'Point 2', middle, '0')
  await setPoint(triangle, 'Point 3', last, '8')
  await triangle.getByRole('button', { name: 'Save triangle' }).click()
  await expect(triangle.getByRole('alert')).toContainText('nonzero area')
  await setPoint(triangle, 'Point 2', middle, '-2.000001')
  await triangle.getByRole('button', { name: 'Save triangle' }).click()
  const triangleText = 'Triangle -8 at ' + first + ', -2.000001 at ' + middle + ', 8 at ' + last
  await expect(tools(left).getByText(triangleText, { exact: true })).toBeVisible()
  expect((await trace()).triangles[0].map(([x]) => x)).toEqual([x1, xMid, x2])

  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(35)
  const entries = backup.manifest.preferences.annotations['LOCAL:ANNOTATIONS']
  const seconds = value => Date.parse(value) / 1000
  expect(entries.slice(-2).map(({ id, ...entry }) => entry)).toEqual([
    { kind: 'ellipse', start: { time: seconds(last), ticks: 5000000 }, end: { time: seconds(first), ticks: -5000000 } },
    { kind: 'triangle', points: [
      { time: seconds(first), ticks: -8000000 }, { time: seconds(middle), ticks: -2000001 }, { time: seconds(last), ticks: 8000000 },
    ] },
  ])
  const invalid = structuredClone(backup)
  invalid.manifest.preferences.annotations['LOCAL:ANNOTATIONS'].at(-1).points[1].ticks = 0
  invalid.sha256 = createHash('sha256').update(canonical(invalid.manifest)).digest('hex')
  await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
  await selectBackup(page, invalid)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('nonzero area')
  await page.keyboard.press('Escape')

  expect(legacy.version).toBe(31)
  await restore(page, legacy)
  await expect(tools(left).getByRole('listitem')).toHaveCount(5)
  await restore(page, backup)
  await page.reload()
  await expect(tools(left).getByText(ellipseText, { exact: true })).toBeVisible()
  await expect(tools(left).getByText(triangleText, { exact: true })).toBeVisible()
})
