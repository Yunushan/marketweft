import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('linked rebased charts keep independent observed anchors and export exact returns after each anchor', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { fillText } = proto
    proto.fillText = function (text, x, ...rest) {
      if (text === '0%' && this.canvas.closest('[aria-label="Primary chart pane"]'))
        window.returnAxisRight = x - 7
      return fillText.call(this, text, x, ...rest)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const utc = offset => new Date((from + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const observations = [[0, 9], [60, -3], [120, -2], [180, -4], [300, 0], [360, 1]]
  await openImport(page, 'RETURNS', [header, ...observations.map(([offset, price]) =>
    [from + offset, price, price, price, price, 1].join(','))].join('\n'))
  await submitImport(page, 'RETURNS')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:RETURNS')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('high-low-band')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(42)
  await primaryType.selectOption('rebased-percent')
  await comparisonType.selectOption('rebased-percent')
  await expect(primary.getByLabel('Rebase at (UTC)')).toHaveValue(utc(0))

  async function anchor(pane, value) {
    await pane.getByLabel('Rebase at (UTC)').fill(value)
    await pane.getByRole('button', { name: 'Apply anchor' }).click()
  }
  await anchor(primary, '2025-02-30T14:00:00Z')
  await expect(primary.getByRole('alert')).toContainText('YYYY-MM-DDTHH:MM:SSZ')
  await anchor(primary, utc(240))
  await expect(primary.getByRole('status')).toContainText('complete observed close')
  await anchor(primary, utc(300))
  await expect(primary.getByRole('status')).toContainText('nonzero close')
  await expect(primary.getByText('Percent change Missing')).toBeVisible()
  await anchor(primary, utc(60))
  await anchor(comparison, utc(120))

  const plot = primary.getByRole('region', { name: 'rebased percent change chart' })
  const otherPlot = comparison.getByRole('region', { name: 'rebased percent change chart' })
  const canvas = plot.locator('canvas')
  const right = await page.evaluate(() => window.returnAxisRight)
  const hover = index => canvas.hover({ position: { x: 10 + (index + 0.5) * (right - 10) / observations.length, y: 58 } })
  await hover(2)
  await expect(plot).toHaveAttribute('data-crosshair-time', String(from + 120))
  await expect(otherPlot).toHaveAttribute('data-crosshair-time', String(from + 120))
  await expect(plot.getByText('Percent change -33.333333%')).toBeVisible()
  await expect(otherPlot.getByText('Percent change 0%', { exact: true })).toBeVisible()
  await hover(3)
  await expect(plot.getByText('Percent change 33.333333%')).toBeVisible()
  await expect(otherPlot.getByText('Percent change 100%')).toBeVisible()
  await hover(0)
  await expect(plot.getByText('Percent change Missing')).toBeVisible()
  await expect(otherPlot.getByText('Percent change Missing')).toBeVisible()
  await expect(plot.getByText(/Base close/)).toHaveCount(0)

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const offset = rows[0].indexOf('rebased_base_time')
  expect(rows[0].slice(offset, offset + 3)).toEqual(['rebased_base_time', 'rebased_base_close', 'rebased_return_pct'])
  expect(rows.slice(1).map(row => row.slice(offset, offset + 3))).toEqual([
    ['', '', ''],
    ...['0', '-33.333333', '33.333333', '-100', '-133.333333'].map(value => [String(from + 60), '-3', value]),
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(43)
  expect(saved.manifest.preferences.rebaseTimes).toEqual({ primary: from + 60, comparison: from + 120 })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  await primary.getByRole('button', { name: 'Use first close' }).click()
  await expect(primary.getByLabel('Rebase at (UTC)')).toHaveValue(utc(0))
  expect((await downloadWorkspace(page)).manifest.preferences.rebaseTimes).toEqual({ comparison: from + 120 })
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryType).toHaveValue('high-low-band')
  await restore(saved)
  await page.reload()
  await expect(primary.getByLabel('Rebase at (UTC)')).toHaveValue(utc(60))
  await expect(comparison.getByLabel('Rebase at (UTC)')).toHaveValue(utc(120))
})

test('an incomplete aggregate cannot become a return observation or a base', async ({ page }) => {
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const observations = [0, 1, 2, 4, 5, 6, 7]
  await openImport(page, 'RCOVER', [header, ...observations.map(price =>
    [from + price * 60, price, price, price, price, 1].join(','))].join('\n'))
  await submitImport(page, 'RCOVER')
  await page.getByLabel('Primary chart type').selectOption('rebased-percent')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByText('Percent change 600%')).toBeVisible()
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const offset = rows[0].indexOf('rebased_base_time')
  expect(rows.slice(1).map(row => row.slice(offset, offset + 3))).toEqual(
    ['0', '', '400', '600'].map(value => [String(from), '1', value]),
  )
  await pane.getByLabel('Rebase at (UTC)').fill('2025-06-03T14:02:00Z')
  await pane.getByRole('button', { name: 'Apply anchor' }).click()
  await expect(pane.getByRole('status')).toContainText('complete observed close')
  await expect(pane.getByText('Percent change Missing')).toBeVisible()
})
