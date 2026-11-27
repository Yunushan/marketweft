import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

async function drawdownCsv(page, pane) {
  if (!await pane.getByRole('button', { name: 'Download CSV' }).isVisible())
    await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const offset = rows[0].indexOf('drawdown_peak_time')
  expect(rows[0].slice(offset, offset + 3)).toEqual(['drawdown_peak_time', 'drawdown_peak_close', 'drawdown_pct'])
  return rows.slice(1).map(row => row.slice(offset, offset + 3))
}

test('drawdown reflects every observed recovery and keeps original peak provenance', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { fillText, scale, fill } = proto
    const isDrawdown = ctx => ctx.canvas.getAttribute('aria-label')?.includes('peak-to-trough drawdown')
    proto.scale = function (...args) {
      if (isDrawdown(this)) window.drawdownFills = 0
      return scale.apply(this, args)
    }
    proto.fill = function (...args) {
      if (isDrawdown(this) && this.fillStyle === 'rgba(236, 129, 126, 0.18)') window.drawdownFills++
      return fill.apply(this, args)
    }
    proto.fillText = function (text, x, ...rest) {
      if (text === '0%' && isDrawdown(this))
        window.drawdownAxisRight = x - 7
      return fillText.call(this, text, x, ...rest)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const prices = [-1, 0, 100, 50, 100, -8, 0, 120, 120, 90]
  await openImport(page, 'PEAK', [header, ...prices.map((price, index) =>
    [from + index * 60, price, price, price, price, 1].join(','))].join('\n'))
  await submitImport(page, 'PEAK')
  const type = page.getByLabel('Primary chart type')
  await type.selectOption('rebased-percent')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(43)
  await type.selectOption('drawdown')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const plot = pane.getByRole('region', { name: 'peak-to-trough drawdown chart' })
  const canvas = plot.locator('canvas')
  const right = await page.evaluate(() => window.drawdownAxisRight)
  expect(await page.evaluate(() => window.drawdownFills)).toBe(2)
  const hover = index => canvas.hover({ position: { x: 10 + (index + 0.5) * (right - 10) / prices.length, y: 60 } })
  await expect(plot.getByText('Drawdown -25%')).toBeVisible()
  await hover(0)
  await expect(plot.getByText('Drawdown Missing')).toBeVisible()
  await hover(3)
  await expect(plot.getByText('Drawdown -50%')).toBeVisible()
  await hover(4)
  await expect(plot.getByText('Drawdown 0%', { exact: true })).toBeVisible()
  await expect(plot.getByText(/Peak close 100/)).toContainText('14:02')
  await hover(5)
  await expect(plot.getByText('Drawdown Missing')).toBeVisible()
  await expect(plot.getByText(/Peak close/)).toHaveCount(0)
  await hover(6)
  await expect(plot.getByText('Drawdown -100%')).toBeVisible()

  const empty = ['', '', '']
  const row = (index, peak, percent) => [String(from + index * 60), peak, percent]
  expect(await drawdownCsv(page, pane)).toEqual([
    empty, empty, row(2, '100', '0'), row(2, '100', '-50'), row(2, '100', '0'),
    empty, row(2, '100', '-100'), row(7, '120', '0'), row(7, '120', '0'), row(7, '120', '-25'),
  ])
  for (let step = 0; step < 3; step++)
    await pane.getByRole('button', { name: 'Zoom in' }).click()
  expect(await drawdownCsv(page, pane)).toEqual([
    empty, row(2, '100', '-100'), row(7, '120', '0'), row(7, '120', '0'), row(7, '120', '-25'),
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(44)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'drawdown' })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(type).toHaveValue('rebased-percent')
  await restore(saved)
  await page.reload()
  await expect(type).toHaveValue('drawdown')
  await expect(plot.getByText('Drawdown -25%')).toBeVisible()
})

test('incomplete timeframe buckets cannot reset the running peak', async ({ page }) => {
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const observed = [[0, 80], [1, 100], [2, 999], [4, 70], [5, 80], [6, 100], [7, 120]]
  await openImport(page, 'PARTIAL', [header, ...observed.map(([offset, price]) =>
    [from + offset * 60, price, price, price, price, 1].join(','))].join('\n'))
  await submitImport(page, 'PARTIAL')
  await page.getByLabel('Primary chart type').selectOption('drawdown')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByText('Drawdown 0%', { exact: true })).toBeVisible()
  expect(await drawdownCsv(page, pane)).toEqual([
    [String(from), '100', '0'], ['', '', ''], [String(from), '100', '-20'], [String(from + 360), '120', '0'],
  ])
})
