import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('opening gaps separate signed observed bridges, genuine zero and incomplete rolled evidence at cutoffs', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = canvas
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.closest('[aria-label="Primary chart pane"]') &&
      ctx.canvas.getAttribute('aria-label')?.includes('interactive Opening gaps')
    canvas.scale = function (...args) {
      if (primary(this)) window.openingStems = []
      return scale.apply(this, args)
    }
    canvas.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, draw] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      canvas[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return draw.call(this, x, y)
      }
    }
    canvas.stroke = function (...args) {
      const path = paths.get(this)
      if (primary(this) && this.lineWidth === 1.5 && path?.length === 2 &&
          path[0][0] === path[1][0] && ['#68d7b1', '#ec817e'].includes(this.strokeStyle)) {
        window.openingStems.push({ color: this.strokeStyle, y: path.map(point => point[1]) })
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-opening-gaps.csv', import.meta.url), 'utf8')
  await openImport(page, 'OPENBRIDGE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'OPENBRIDGE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:OPENBRIDGE')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  const values = pane => pane.getByRole('group', { name: 'Opening gap prices' })
  const day = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((day + offset) * 1000).toISOString().replace('.000Z', 'Z')

  await page.getByRole('button', { name: /Indicators/ }).click()
  const demark = page.getByRole('form', { name: 'Primary chart DeMarker' })
  await demark.getByLabel('Show DeMarker').check()
  const save = demark.getByRole('button', { name: 'Apply DeMarker' })
  await save.click()
  await expect(save).toBeEnabled()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(66)

  await primaryType.selectOption('opening-gap')
  async function cutoff(pane, offset) {
    const form = pane.getByRole('form', { name: 'Opening gap history cutoff' })
    await form.getByLabel('Known through (UTC)').fill(iso(offset))
    await form.getByRole('button', { name: 'Apply cutoff' }).click()
  }
  await cutoff(primary, -1)
  await expect(primary.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(primary, 0)
  await expect(values(primary)).toContainText('No eligible prior close.')
  await cutoff(primary, 60)
  await expect(values(primary)).toContainText('Gap +3')
  await expect(values(primary)).toContainText('Prior UTC ' + iso(0))
  await cutoff(primary, 120)
  await expect(values(primary)).toContainText('Gap -3')
  const stems = await page.evaluate(() => window.openingStems)
  expect(stems.map(stem => stem.color)).toEqual(['#68d7b1', '#ec817e'])
  expect(stems[0].y[1]).toBeLessThan(stems[0].y[0])
  expect(stems[1].y[1]).toBeGreaterThan(stems[1].y[0])
  await cutoff(primary, 240)
  await expect(values(primary)).toContainText('Gap 0')
  await expect(values(primary)).toContainText('Prior UTC ' + iso(120))

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  async function analysis() {
    const [download] = await Promise.all([
      page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    return readFile(await download.path(), 'utf8')
  }
  const original = await analysis()
  const [fields, ...rows] = original.trimEnd().split(/\r?\n/)
  const columns = ['opening_gap_known_through', 'opening_gap_prior_time', 'opening_gap_prior_close', 'opening_gap']
    .map(key => fields.split(',').indexOf(key))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    [day + 240, '', '', ''].join(','), [day + 240, day, -2, 3].join(','),
    [day + 240, day + 60, 2, -3].join(','), [day + 240, day + 120, -1, 0].join(','),
  ])

  await comparisonType.selectOption('opening-gap')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe' }).click()
  await cutoff(comparison, 119)
  await expect(comparison.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(comparison, 360)
  await expect(values(comparison)).toContainText('No eligible prior close.')
  await cutoff(comparison, 480)
  await expect(values(comparison)).toContainText('Gap -9')
  await expect(values(comparison)).toContainText('Prior UTC ' + iso(240))
  expect(await analysis()).toBe(original)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(67)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'opening-gap', comparison: 'opening-gap' })
  expect(saved.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(backup === prior ? 'candles' : 'opening-gap')
  }
  await page.reload()
  await expect(comparisonType).toHaveValue('opening-gap')
  await expect(values(primary)).toContainText('Gap +2')
})
