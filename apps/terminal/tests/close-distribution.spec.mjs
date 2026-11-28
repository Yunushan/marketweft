import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const from = Date.parse('2025-06-03T14:00:00Z') / 1000
const time = minute => from + minute * 60
const source = observations => [header, ...observations.map(([minute, close]) =>
  [time(minute), close, 100, -100, close, 1].join(','))].join('\n')

async function downloadCsv(page, pane, contents) {
  const download = pane.getByRole('button', { name: 'Download CSV' })
  if (!await download.isVisible()) await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Range').selectOption('all')
  await pane.getByLabel('Contents').selectOption(contents)
  const pending = page.waitForEvent('download')
  await download.click()
  return (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
}

test('close distributions plot signed quartiles at completed observations and restore independently', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, strokeRect, beginPath, moveTo, lineTo, stroke } = proto
    const chart = context => context.canvas.getAttribute('aria-label')?.startsWith('BOXES interactive close distribution')
    let path = []
    proto.scale = function (...args) {
      if (chart(this)) window.distributionTrace = { boxes: [], whiskers: [], medians: [] }
      return scale.apply(this, args)
    }
    proto.strokeRect = function (...args) {
      if (chart(this) && this.strokeStyle === '#b59be6') window.distributionTrace.boxes.push(args)
      return strokeRect.apply(this, args)
    }
    proto.beginPath = function () {
      path = []
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        path.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (chart(this) && path.length === 2) {
        if (this.strokeStyle === '#b59be6') window.distributionTrace.whiskers.push(path)
        if (this.strokeStyle === '#e8ba70') window.distributionTrace.medians.push(path)
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await openImport(page, 'BOXES', source([[0, -3], [1, 9], [2, -1], [3, '-0.000001'], [4, 5],
    [7, 25], [8, 15], [9, 12], [10, 30], [11, 20], [12, 80]]))
  await submitImport(page, 'BOXES')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:BOXES')
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('ohlc')
  const legacy = await downloadWorkspace(page)
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const original = await downloadCsv(page, pane, 'bars')
  await primaryType.selectOption('close-distribution')
  await expect(pane.getByRole('group', { name: 'Close distribution values' })).toContainText('Median 20')
  await expect.poll(() => page.evaluate(() => window.distributionTrace?.boxes.length)).toBe(2)
  const { boxes, whiskers, medians } = await page.evaluate(() => window.distributionTrace)
  expect(whiskers).toHaveLength(8)
  expect(medians).toHaveLength(2)
  for (const [index, [left, top, width, height]] of boxes.entries()) {
    const center = left + width / 2
    const [[high, q3], [q1, low]] = whiskers.slice(index * 4, index * 4 + 2)
    const [[medianLeft, medianY], [medianRight]] = medians[index]
    expect(high[0]).toBeCloseTo(center)
    expect(high[1]).toBeLessThan(top)
    expect(q3[1]).toBeCloseTo(top)
    expect(q1[1]).toBeCloseTo(top + height)
    expect(low[1]).toBeGreaterThan(top + height)
    expect(medianLeft).toBe(left)
    expect(medianRight).toBeCloseTo(left + width)
    expect(medianY).toBeGreaterThan(top)
    expect(medianY).toBeLessThan(top + height)
  }
  expect(boxes[1][0]).toBeGreaterThan(boxes[0][0])
  const [fields, ...rows] = await downloadCsv(page, pane, 'analysis')
  const offset = fields.indexOf('distribution_size')
  expect(fields.slice(offset, offset + 8)).toEqual(['distribution_size', 'distribution_first_time',
    'distribution_last_time', 'distribution_minimum', 'distribution_q1', 'distribution_median',
    'distribution_q3', 'distribution_maximum'])
  expect(rows.map(row => row.slice(offset, offset + 8))).toEqual(rows.map((_, index) => {
    if (index === 4) return ['5', String(time(0)), String(time(4)), '-3', '-1', '-0.000001', '5', '9']
    if (index === 9) return ['5', String(time(7)), String(time(11)), '12', '15', '20', '25', '30']
    return Array(8).fill('')
  }))
  expect(await downloadCsv(page, pane, 'bars')).toEqual(original)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(54)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'close-distribution', comparison: 'ohlc' })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  for (const [backup, type] of [[legacy, 'candles'], [saved, 'close-distribution']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await page.reload()
  await expect(primaryType).toHaveValue('close-distribution')
  await expect(comparisonType).toHaveValue('ohlc')
})

test('incomplete timeframe buckets stay out of close distributions', async ({ page }) => {
  await page.goto('/')
  await openImport(page, 'ROLLBOX', source([[0, 1], [1, 1], [2, 99], [4, 2], [5, 2], [6, 3], [7, 3],
    [8, 4], [9, 4], [10, 5]]))
  await submitImport(page, 'ROLLBOX')
  await page.getByLabel('Primary chart type').selectOption('close-distribution')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByText('A box needs five complete closes.')).toBeVisible()
  const [fields, ...rows] = await downloadCsv(page, pane, 'analysis')
  expect(rows).toHaveLength(6)
  const sizeColumn = fields.indexOf('distribution_size')
  expect(sizeColumn).toBeGreaterThan(0)
  expect(rows.map(row => row[sizeColumn])).toEqual(Array(6).fill(''))
})
