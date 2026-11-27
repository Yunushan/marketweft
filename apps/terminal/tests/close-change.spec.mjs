import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('the close-change histogram preserves exact signed differences, gaps, provenance and pane settings', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect } = proto
    const isPrimary = context => context.canvas.getAttribute('aria-label')?.includes('CHANGE interactive close-change') &&
      context.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (isPrimary(this)) window.changeBars = []
      return scale.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (isPrimary(this) && this.globalAlpha === 1 &&
        ['#68d7b1', '#a2b4af', '#ec817e'].includes(this.fillStyle))
        window.changeBars.push([this.fillStyle, ...args])
      return fillRect.apply(this, args)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const bars = [[0, '-1.000001'], [60, '-1'], [120, '-1'], [240, '10'], [300, '9.999999']]
  await openImport(page, 'CHANGE', [header, ...bars.map(([offset, price]) =>
    [from + offset, price, price, price, price, 1].join(','))].join('\n'))
  await submitImport(page, 'CHANGE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:CHANGE')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('baseline')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(39)
  await primaryType.selectOption('close-change')
  await comparisonType.selectOption('close-change')
  await expect(primary.getByRole('status')).toContainText('Set an interval')

  async function setInterval(pane, value) {
    await pane.getByLabel('Close-change interval (seconds)').fill(value)
    await pane.getByRole('button', { name: 'Apply interval' }).click()
  }
  await setInterval(primary, '0')
  await expect(primary.getByRole('alert')).toContainText('positive whole-second')
  await setInterval(primary, '60')
  await setInterval(comparison, '120')
  await expect(primary.getByText('Close change -0.000001')).toBeVisible()
  await expect(comparison.getByText('Close change Missing')).toBeVisible()

  const geometry = await page.evaluate(() => window.changeBars)
  expect(geometry.map(row => row[0])).toEqual(['#68d7b1', '#a2b4af', '#ec817e'])
  const [positive, zero, negative] = geometry
  expect(positive[2]).toBeLessThan(zero[2])
  expect(negative[2]).toBeCloseTo(zero[2] + .5)
  expect(negative[1] - zero[1]).toBeCloseTo(2 * (zero[1] - positive[1]))

  const canvas = primary.locator('canvas')
  const x = row => row[1] + row[3] / 2
  const spacing = x(zero) - x(positive)
  await canvas.hover({ position: { x: x(positive) - spacing, y: 60 } })
  await expect(primary.getByText('Close change Missing')).toBeVisible()
  await canvas.hover({ position: { x: x(positive), y: 60 } })
  await expect(primary.getByText('Close change 0.000001')).toBeVisible()
  await canvas.hover({ position: { x: x(zero), y: 60 } })
  await expect(primary.getByText('Close change 0', { exact: true })).toBeVisible()
  await canvas.hover({ position: { x: x(zero) + spacing, y: 60 } })
  await expect(primary.getByText('Close change Missing')).toBeVisible()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const data = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n')
  const fields = data[0].split(',')
  const offset = fields.indexOf('close_change_interval_seconds')
  expect(offset).toBeGreaterThan(0)
  expect(fields.slice(offset, offset + 4)).toEqual([
    'close_change_interval_seconds', 'previous_close_time', 'previous_close', 'close_change',
  ])
  expect(data.slice(1).map(row => row.split(',').slice(offset, offset + 4))).toEqual([
    ['60', '', '', ''], ['60', String(from), '-1.000001', '0.000001'],
    ['60', String(from + 60), '-1', '0'], ['60', '', '', ''],
    ['60', String(from + 240), '10', '-0.000001'],
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(40)
  expect(saved.manifest.preferences.closeChangeSeconds).toEqual({ primary: 60, comparison: 120 })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('baseline')
  await restore(saved)
  await page.reload()
  await expect(primary.getByLabel('Close-change interval (seconds)')).toHaveValue('60')
  await expect(comparison.getByLabel('Close-change interval (seconds)')).toHaveValue('120')
})

test('timeframe changes require consecutive complete buckets', async ({ page }) => {
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const offsets = [0, 1, 2, 4, 5, 6, 7]
  await openImport(page, 'BUCKET', [header, ...offsets.map(offset =>
    [from + offset * 60, offset, offset, offset, offset, 1].join(','))].join('\n'))
  await submitImport(page, 'BUCKET')
  await page.getByLabel('Primary chart type').selectOption('close-change')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByText('Close change 2', { exact: true })).toBeVisible()
  await expect(pane.getByText('Previous close 5', { exact: false })).toBeVisible()
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const offset = rows[0].indexOf('close_change_interval_seconds')
  expect(rows.slice(1).map(row => row.slice(offset, offset + 4))).toEqual([
    ['120', '', '', ''], ['120', '', '', ''], ['120', '', '', ''], ['120', String(from + 240), '5', '2'],
  ])
  await pane.getByRole('button', { name: 'Show source bars' }).click()
  await expect(pane.getByRole('status')).toContainText('Set an interval')
})
