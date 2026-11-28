import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const header = 'time,open,high,low,close,volume\n'
const fixture = header + [
  '2025-06-06T14:00:00Z,-4,-4,-4,-4,0',
  '2025-06-06T14:01:00Z,-2,0,-2,-1.125001,2.5',
  '2025-06-06T14:02:00Z,2,5,2,4.5,2.5',
  '2025-06-06T14:03:00Z,4,6,3,5.25,10',
  '2025-06-06T14:05:00Z,-2,0,-2,-1.125001,2.5',
  '2025-06-06T14:06:00Z,-2,-2,-2,-2,0',
].join('\n') + '\n'

async function recordScatter(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect, fillText } = proto
    const target = context => context.canvas.getAttribute('aria-label')?.includes('interactive Close–volume scatter') &&
      context.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (target(this)) window.scatterProof = { points: [], labels: [] }
      return scale.apply(this, args)
    }
    proto.fillRect = function (x, y, width, height) {
      if (target(this) && this.fillStyle === '#8abcf0' && width === 4 && height === 4)
        window.scatterProof.points.push({ x: x + 2, y: y + 2 })
      return fillRect.call(this, x, y, width, height)
    }
    proto.fillText = function (label, ...position) {
      if (target(this)) window.scatterProof.labels.push(label)
      return fillText.call(this, label, ...position)
    }
  })
}

async function offline(page, context) {
  await recordScatter(page)
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
}

test('scatter uses both coordinates, retains exact linked UTC and restores across workspace versions', async ({ page, context }) => {
  await offline(page, context)
  await openImport(page, 'SCATTER', fixture)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'SCATTER')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:SCATTER')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const primaryType = page.getByLabel('Primary chart type', { exact: true })
  await page.getByRole('button', { name: /Indicators/ }).click()
  const indicator = page.getByRole('form', { name: 'Primary chart Normalized ATR', exact: true })
  await indicator.getByRole('checkbox', { name: 'Show Normalized ATR', exact: true }).check()
  const apply = indicator.getByRole('button', { name: 'Apply Normalized ATR', exact: true })
  await apply.click()
  await expect(apply).toBeEnabled()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(69)

  await primaryType.selectOption('volume-price-scatter')
  const chart = primary.getByRole('region', { name: 'Close–volume scatter chart', exact: true })
  const canvas = chart.locator('canvas')
  const readout = chart.getByRole('group', { name: 'Close and volume point', exact: true })
  const linked = comparison.getByRole('region', { name: 'Price and volume chart', exact: true })
  await expect(primary.getByRole('group', { name: 'Normalized Average True Range', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scatterProof?.points.length)).toBe(5)
  const { points, labels } = await page.evaluate(() => window.scatterProof)
  expect(labels).toEqual(expect.arrayContaining(['Close', 'Volume', '0', '2.5', '10']))
  const [zeroLow, zeroHigh, lower, upper, maximum] = points
  expect(zeroLow.x).toBe(zeroHigh.x)
  expect(zeroLow.y).toBeGreaterThan(zeroHigh.y)
  expect(lower.x).toBe(upper.x)
  expect(lower.y).toBeGreaterThan(upper.y)
  expect((lower.x - zeroLow.x) / (maximum.x - zeroLow.x)).toBeCloseTo(0.25)
  expect(maximum.y).toBeLessThan(upper.y)
  // Measure plot interactions in canvas coordinates without depending on page scroll position.
  async function move(point) {
    await canvas.evaluate((element, point) => {
      const rect = element.getBoundingClientRect()
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerType: 'mouse', clientX: rect.left + point.x, clientY: rect.top + point.y,
      }))
    }, point)
  }
  async function checkPoint(time, close, volume) {
    const second = String(Date.parse(time) / 1000)
    await expect(chart).toHaveAttribute('data-crosshair-time', second)
    await expect(linked).toHaveAttribute('data-crosshair-time', second)
    await expect(readout).toContainText('Close ' + close)
    await expect(readout).toContainText('Volume ' + volume)
  }
  async function hover(point, time, close, volume) {
    await move(point)
    await checkPoint(time, close, volume)
  }
  await hover(lower, '2025-06-06T14:05:00Z', '-1.125001', '2.5')
  await hover(upper, '2025-06-06T14:02:00Z', '4.5', '2.5')
  await hover(zeroLow, '2025-06-06T14:00:00Z', '-4', '0')
  await move({ x: (lower.x + maximum.x) / 2, y: lower.y })
  await expect(chart).not.toHaveAttribute('data-crosshair-time', /./)
  await canvas.press('ArrowUp')
  await expect(chart).toHaveAttribute('data-crosshair-time', String(Date.parse('2025-06-06T14:05:00Z') / 1000))
  await canvas.press('ArrowDown')
  await expect(chart).toHaveAttribute('data-crosshair-time', String(Date.parse('2025-06-06T14:06:00Z') / 1000))

  await chart.getByText('Export CSV', { exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'), chart.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const exported = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(exported.slice(1).map(row => row.split(',').slice(-2).join(','))).toEqual([
    '-4,0', '-1.125001,2.5', '4.5,2.5', '5.25,10', '-1.125001,2.5', '-2,0',
  ])

  await primary.getByText('Timeframe', { exact: true }).click()
  await primary.getByLabel('Source interval (seconds)').fill('60')
  await primary.getByLabel('Target interval (seconds)').fill('120')
  await primary.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect.poll(() => page.evaluate(() => window.scatterProof?.points.length)).toBe(3)
  const rolled = (await page.evaluate(() => window.scatterProof)).points.sort((a, b) => a.x - b.x)
  expect((rolled[1].x - rolled[0].x) / (rolled[2].x - rolled[0].x)).toBeCloseTo(0.2)
  await hover(rolled[2], '2025-06-06T14:02:00Z', '5.25', '12.5')

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(70)
  expect(current.manifest.preferences.chartTypes).toEqual({ primary: 'volume-price-scatter' })
  expect(current.manifest.preferences.studies).toEqual(prior.manifest.preferences.studies)
  expect(current.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(backup === prior ? 'candles' : 'volume-price-scatter')
  }
  await page.reload()
  await expect(primaryType).toHaveValue('volume-price-scatter')
  await expect(readout).toContainText('Close -2')
  await primaryType.selectOption('candles')
  await expect(primary.getByRole('group', { name: 'Normalized Average True Range', exact: true })).toBeVisible()
})

test('scatter keeps signed closes selectable when all volumes are zero', async ({ page, context }) => {
  await offline(page, context)
  await openImport(page, 'ZEROS', header +
    '2025-06-06T14:00:00Z,-2,-2,-2,-2,0\n2025-06-06T14:01:00Z,3,3,3,3,0\n')
  await submitImport(page, 'ZEROS')
  await page.getByLabel('Primary chart type', { exact: true }).selectOption('volume-price-scatter')
  const chart = page.getByRole('region', { name: 'Close–volume scatter chart', exact: true })
  await expect.poll(() => page.evaluate(() => window.scatterProof?.points.length)).toBe(2)
  const [low, high] = (await page.evaluate(() => window.scatterProof)).points
  expect(low.x).toBe(high.x)
  expect(low.y).toBeGreaterThan(high.y)
  const bounds = await chart.locator('canvas').boundingBox()
  await page.mouse.move(bounds.x + low.x, bounds.y + low.y)
  const readout = chart.getByRole('group', { name: 'Close and volume point', exact: true })
  await expect(readout).toContainText('Close -2')
  await expect(readout).toContainText('Volume 0')
})
