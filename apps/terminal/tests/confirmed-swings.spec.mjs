import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const from = Date.parse('2025-06-03T14:00:00Z') / 1000
const iso = seconds => new Date((from + seconds) * 1000).toISOString().replace('.000Z', 'Z')
const csv = observations => [header, ...observations.map(([minute, close]) =>
  [from + minute * 60, close, close, close, close, 1].join(','))].join('\n')

async function cutoff(pane, seconds) {
  await pane.getByLabel('Known through (UTC)').fill(iso(seconds))
  await pane.getByRole('button', { name: 'Apply cutoff' }).click()
}

async function swingWindow(pane, seconds) {
  await pane.getByLabel('Left bars').fill('1')
  await pane.getByLabel('Right bars').fill('1')
  if (seconds) await pane.getByLabel('Swing interval (seconds)').fill(String(seconds))
  await pane.getByRole('button', { name: 'Apply swing window' }).click()
  await expect(pane.getByLabel('Left bars')).toHaveValue('1')
}

async function exportSwings(page, pane) {
  const download = pane.getByRole('button', { name: 'Download CSV' })
  if (!await download.isVisible()) await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Range').selectOption('all')
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await download.click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const offset = rows[0].indexOf('swing_left_bars')
  expect(rows[0].slice(offset, offset + 8)).toEqual(['swing_left_bars', 'swing_right_bars', 'swing_interval_seconds',
    'swing_known_through', 'swing_pivot_at', 'swing_confirmed_at', 'swing_pivot_close', 'swing_side'])
  return rows.slice(1).map(row => [row[0], ...row.slice(offset, offset + 8)])
}

test('swing markers stay hidden before confirmation, keep earliest ties and restore pane settings', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, arc } = proto
    const owns = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('SWINGS interactive confirmed close swing')
    proto.scale = function (...args) {
      if (owns(this)) window.swingMarkers = []
      return scale.apply(this, args)
    }
    proto.arc = function (x, y, radius, ...angles) {
      if (radius === 4 && owns(this)) window.swingMarkers.push([x, y])
      return arc.call(this, x, y, radius, ...angles)
    }
  })
  await page.goto('/')
  await openImport(page, 'SWINGS', csv([[0, 0], [1, 5], [2, 5], [3, 0], [4, -1],
    [6, 10], [7, -3], [8, -3], [9, 4], [10, 2]]))
  await submitImport(page, 'SWINGS')
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('drawdown')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:SWINGS')
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('area')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(44)

  await primaryType.selectOption('confirmed-swings')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const plot = pane.getByRole('region', { name: 'confirmed close swing chart' })
  await expect(pane.getByRole('status')).toContainText('Set an interval')
  await swingWindow(pane, 60)

  await cutoff(pane, 60)
  await expect(pane.getByRole('status')).toContainText('No confirmed swings')
  await expect(plot.getByText('Swing None')).toBeVisible()
  expect(await page.evaluate(() => window.swingMarkers)).toEqual([])
  const before = await exportSwings(page, pane)
  expect(before).toEqual([0, 60].map(seconds => [String(from + seconds), '1', '1', '60',
    String(from + 60), '', '', '', '']))

  await cutoff(pane, 120)
  await expect(plot.getByText('Swing High')).toBeVisible()
  await expect(plot.getByText('Pivot close 5')).toBeVisible()
  await expect(plot.getByText(/Pivot at.*14:01/)).toBeVisible()
  await expect(plot.getByText(/Confirmed at.*14:02/)).toBeVisible()
  expect(await page.evaluate(() => window.swingMarkers)).toHaveLength(1)
  const confirmed = await exportSwings(page, pane)
  expect(confirmed).toHaveLength(3)
  expect(confirmed.at(-1)).toEqual([String(from + 120), '1', '1', '60', String(from + 120),
    String(from + 60), String(from + 120), '5', 'high'])

  await cutoff(pane, -1)
  await expect(pane.getByRole('status')).toContainText('No observations are known')
  await expect(plot).toHaveCount(0)
  await pane.getByRole('button', { name: 'Show latest' }).click()
  await expect(plot.getByText('Swing High')).toBeVisible()
  expect(await page.evaluate(() => window.swingMarkers)).toHaveLength(3)
  const latest = await exportSwings(page, pane)
  expect(latest).toHaveLength(10)
  expect(latest.filter(row => row[8]).map(row => row.slice(5))).toEqual([
    [String(from + 60), String(from + 120), '5', 'high'],
    [String(from + 420), String(from + 480), '-3', 'low'],
    [String(from + 540), String(from + 600), '4', 'high'],
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(45)
  expect(saved.manifest.preferences.swingSettings).toEqual({ primary: { left: 1, right: 1, seconds: 60 } })
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'confirmed-swings', comparison: 'area' })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('drawdown')
  await restore(saved)
  await page.reload()
  await expect(primaryType).toHaveValue('confirmed-swings')
  await expect(comparisonType).toHaveValue('area')
  await expect(pane.getByLabel('Swing interval (seconds)')).toHaveValue('60')
  await expect(pane.getByLabel('Known through (UTC)')).toHaveValue('')
})

test('a rolled close confirms a swing only when its confirming bucket is available', async ({ page }) => {
  await page.goto('/')
  await openImport(page, 'ROLLSWING', csv([[0, 1], [1, 1], [2, 8], [3, 8], [4, 2], [5, 2], [6, 20]]))
  await submitImport(page, 'ROLLSWING')
  await page.getByLabel('Primary chart type').selectOption('confirmed-swings')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByLabel('Swing interval (seconds)')).toBeDisabled()
  await swingWindow(pane)
  await cutoff(pane, 359)
  await expect(pane.getByRole('status')).toContainText('No confirmed swings')
  expect(await exportSwings(page, pane)).toHaveLength(2)
  await cutoff(pane, 360)
  await expect(pane.getByText(/Confirmed at.*14:06/)).toBeVisible()
  const rows = await exportSwings(page, pane)
  expect(rows).toHaveLength(3)
  expect(rows.at(-1)).toEqual([String(from + 240), '1', '1', '120', String(from + 360),
    String(from + 120), String(from + 360), '8', 'high'])
  await pane.getByRole('button', { name: 'Show latest' }).click()
  const latest = await exportSwings(page, pane)
  expect(latest).toHaveLength(4)
  expect(latest.at(-1).slice(5)).toEqual(['', '', '', ''])
})

test('an early session close is the confirmation time for its shortened bucket', async ({ page }) => {
  await page.goto('/')
  await openImport(page, 'EARLYSWING', csv([[0, 1], [1, 1], [2, 8], [3, 8], [4, 2], [5, 2]]))
  await submitImport(page, 'EARLYSWING')
  await page.getByLabel('Primary chart type').selectOption('confirmed-swings')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByLabel('Session calendar CSV (optional)').setInputFiles({
    name: 'early.csv', mimeType: 'text/csv', buffer: Buffer.from([
      'date,open_utc,close_utc,utc_offset_minutes,kind',
      '2025-06-03,2025-06-03T14:00:00Z,2025-06-03T14:05:30Z,0,early',
    ].join('\n')),
  })
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByLabel('Swing interval (seconds)')).toBeDisabled()
  await swingWindow(pane)
  await cutoff(pane, 329)
  await expect(pane.getByRole('status')).toContainText('No confirmed swings')
  await cutoff(pane, 330)
  await expect(pane.getByText(/Confirmed at.*14:05:30/)).toBeVisible()
  const rows = await exportSwings(page, pane)
  expect(rows.at(-1)).toEqual([String(from + 240), '1', '1', '120', String(from + 330),
    String(from + 120), String(from + 330), '8', 'high'])
})
