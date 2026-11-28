import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('True Range distinguishes zero, skipped times and incomplete buckets in an offline chart', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const { scale, fillRect } = canvas
    const primary = ctx => ctx.canvas.closest('[aria-label="Primary chart pane"]') &&
      ctx.canvas.getAttribute('aria-label')?.includes('interactive True Range histogram')
    canvas.scale = function (...args) {
      if (primary(this)) window.ranges = []
      return scale.apply(this, args)
    }
    canvas.fillRect = function (x, y, width, height) {
      if (primary(this) && ['#55b5ee', '#a2b4af'].includes(this.fillStyle)) window.ranges.push({ x, y, height })
      return fillRect.call(this, x, y, width, height)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-true-range.csv', import.meta.url), 'utf8')
  await openImport(page, 'TRUERANGE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'TRUERANGE')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:TRUERANGE')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  const evidence = pane => pane.getByRole('group', { name: 'True Range evidence', exact: true })
  const base = 1748872800
  const utc = seconds => new Date((base + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  async function cutoff(pane, seconds) {
    const form = pane.getByRole('form', { name: 'True Range history cutoff', exact: true })
    await form.getByLabel('Known through (UTC)').fill(utc(seconds))
    await form.getByRole('button', { name: 'Apply cutoff', exact: true }).click()
  }

  const previous = await downloadWorkspace(page)
  await primaryType.selectOption('true-range')
  await cutoff(primary, -1)
  await expect(primary.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(primary, 0)
  await expect(evidence(primary)).toContainText('True Range 4')
  await expect(evidence(primary)).not.toContainText('Prior close')
  await cutoff(primary, 60)
  await expect(evidence(primary)).toContainText('True Range 7')
  await expect(evidence(primary)).toContainText('Prior close -3')
  await cutoff(primary, 180)
  await expect(evidence(primary)).toContainText('True Range 0')
  await expect(evidence(primary)).toContainText('Prior UTC ' + utc(60))
  await cutoff(primary, 240)
  await expect(evidence(primary)).toContainText('True Range 8')
  await expect.poll(() => page.evaluate(() => window.ranges?.length)).toBe(4)
  const rectangles = await page.evaluate(() => window.ranges)
  expect(rectangles[0].height).toBeLessThan(rectangles[1].height)
  expect(rectangles[2].height).toBe(1)
  expect(rectangles[1].height).toBeLessThan(rectangles[3].height)

  async function analysis() {
    const contents = primary.getByLabel('Contents')
    if (!await contents.isVisible()) await primary.getByText('Export CSV', { exact: true }).click()
    await contents.selectOption('analysis')
    const pending = page.waitForEvent('download')
    await primary.getByRole('button', { name: 'Download CSV', exact: true }).click()
    return readFile(await (await pending).path(), 'utf8')
  }
  const original = await analysis()
  const [header, ...rows] = original.trimEnd().split(/\r?\n/)
  const columns = ['true_range_known_through', 'true_range_prior_time', 'true_range_prior_close', 'true_range']
    .map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]))).toEqual([
    [String(base + 240), '', '', '4'],
    [String(base + 240), String(base), '-3', '7'],
    [String(base + 240), String(base + 60), '3', '0'],
    [String(base + 240), String(base + 180), '3', '8'],
  ])
  await cutoff(primary, 420)
  await expect(evidence(primary)).toContainText('Prior close 0')
  await cutoff(primary, 240)
  expect(await analysis()).toBe(original)

  await comparisonType.selectOption('true-range')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe', exact: true }).click()
  await cutoff(comparison, 119)
  await expect(comparison.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(comparison, 120)
  await expect(evidence(comparison)).toContainText('True Range 10')
  await cutoff(comparison, 360)
  await expect(evidence(comparison)).toContainText('True Range Missing')
  await cutoff(comparison, 480)
  await expect(evidence(comparison)).toContainText('True Range 5')
  await expect(evidence(comparison)).toContainText('Prior UTC ' + utc(240))
  expect(await analysis()).toBe(original)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(88)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'true-range', comparison: 'true-range' })
  expect(saved.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    await expect(primaryType).toHaveValue(backup === previous ? 'candles' : 'true-range')
  }
  await page.reload()
  await expect(comparisonType).toHaveValue('true-range')
  await expect(evidence(primary)).toContainText('Prior close 0')
})
