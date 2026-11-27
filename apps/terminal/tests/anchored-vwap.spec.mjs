import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const from = Date.parse('2025-06-03T14:00:00Z') / 1000
const iso = seconds => new Date((from + seconds) * 1000).toISOString().replace('.000Z', 'Z')
const fixture = [header,
  [from, 100, 100, 100, 100, 9], [from + 60, 0, 0, 0, 0, 0], [from + 120, 11, 14, 5, 11, 2],
  [from + 180, -4, 8, -7, -4, 1], [from + 240, 20, 20, 20, 20, 0], [from + 300, 7, 7, 7, 7, 3],
].map(row => typeof row === 'string' ? row : row.join(',')).join('\n')

async function editNew(pane) {
  const drawings = pane.getByRole('region', { name: 'Chart drawings' })
  await drawings.getByRole('button', { name: 'New anchored vwap' }).click()
  return drawings.getByRole('form', { name: 'Anchored VWAP' })
}

async function prepareAnalysis(pane) {
  const download = pane.getByRole('button', { name: 'Download CSV' })
  if (!await download.isVisible()) await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  return download
}

async function exportVwap(page, pane, id) {
  const download = await prepareAnalysis(pane)
  const pending = page.waitForEvent('download')
  await download.click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n').map(row => row.split(','))
  const prefix = 'anchored_vwap_' + id
  const offset = rows[0].indexOf(prefix + '_anchor_at')
  expect(rows[0].slice(offset, offset + 4)).toEqual(
    ['_anchor_at', '_observed_at', '_price', '_cumulative_volume'].map(column => prefix + column),
  )
  return rows.slice(1).map(row => [row[0], ...row.slice(offset, offset + 4)])
}

test('anchored VWAP shares exact source weights across panes and projects to the last source bar of a bucket', async ({ page }) => {
  await page.goto('/')
  await openImport(page, 'AVWAP', fixture)
  await submitImport(page, 'AVWAP')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:AVWAP')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryValues = primary.getByRole('group', { name: 'Anchored VWAP values' })
  const comparisonValues = comparison.getByRole('group', { name: 'Anchored VWAP values' })
  const legacy = await downloadWorkspace(page)
  const form = await editNew(primary)
  await form.getByLabel('Time (UTC)').fill(iso(61))
  await form.getByRole('button', { name: 'Save anchored vwap' }).click()
  await expect(form.getByRole('alert')).toHaveText('Choose the exact UTC time of an observed source bar.')
  await form.getByLabel('Time (UTC)').fill(iso(60))
  await form.getByRole('button', { name: 'Save anchored vwap' }).click()
  await expect(primaryValues.getByText('Anchored VWAP 6.666667')).toBeVisible()
  await expect(comparisonValues.getByText('Cumulative volume 6')).toBeVisible()

  const chart = primary.locator('canvas')
  await chart.hover({ position: { x: 20, y: 60 } })
  await expect(primaryValues.getByText('Anchored VWAP Missing')).toBeVisible()
  await expect(comparisonValues.getByText('Anchored VWAP Missing')).toBeVisible()
  await expect(comparison.getByRole('region', { name: 'Price and volume chart' })).toHaveAttribute('data-crosshair-time', String(from))

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(46)
  const drawing = saved.manifest.preferences.annotations['LOCAL:AVWAP'][0]
  expect(drawing).toMatchObject({ kind: 'anchored-vwap', time: from + 60 })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  const row = (seconds, price, volume, observed = seconds) =>
    [String(from + seconds), String(from + 60), String(from + observed), price, volume]
  expect(await exportVwap(page, primary, drawing.id)).toEqual([
    [String(from), '', '', '', ''], [String(from + 60), '', '', '', ''], row(120, '10', '2'),
    row(180, '6.333333', '3'), row(240, '6.333333', '3'), row(300, '6.666667', '6'),
  ])

  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(comparisonValues.getByText(/Observed through.*14:05/)).toBeVisible()
  expect(await exportVwap(page, comparison, drawing.id)).toEqual([
    [String(from), '', '', '', ''], row(120, '6.333333', '3', 180), row(240, '6.666667', '6', 300),
  ])

  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(primaryValues).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await expect(primaryValues.getByText('Anchored VWAP 6.666667')).toBeVisible()
  await expect(comparisonValues.getByText('Cumulative volume 6')).toBeVisible()
})

test('derived VWAP data follows the source redistribution grant', async ({ page }) => {
  await page.goto('/')
  await openImport(page, 'VWAPRIGHTS', fixture.split('\n').filter(row => !row.startsWith(from + ',')).join('\n'))
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('restricted')
  await submitImport(page, 'VWAPRIGHTS')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–3 of 3')
  const form = await editNew(pane)
  await form.getByRole('button', { name: 'Pick on chart' }).click()
  await pane.locator('canvas').click({ position: { x: 20, y: 60 } })
  await expect(form.getByLabel('Time (UTC)')).toHaveValue(iso(60))
  await form.getByRole('button', { name: 'Save anchored vwap' }).click()
  await expect(pane.getByText('Anchored VWAP 6.666667')).toBeVisible()
  const button = await prepareAnalysis(pane)
  const downloads = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  await button.click()
  await expect(pane.getByRole('alert')).toHaveText('Chart CSV export requires a granted redistribution permission.')
  expect(downloads).toEqual([])
})
