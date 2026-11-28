import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Time Underwater preserves peak evidence and incomplete rolled intervals offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-time-underwater.csv', import.meta.url), 'utf8')
  await openImport(page, 'UNDERWATER', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'UNDERWATER')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:UNDERWATER')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  const evidence = pane => pane.getByRole('group', { name: 'Time Underwater evidence', exact: true })
  const epoch = 1748872800
  const utc = seconds => new Date((epoch + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  async function cutoff(pane, seconds) {
    const form = pane.getByRole('form', { name: 'Time Underwater history cutoff', exact: true })
    await form.getByLabel('Known through (UTC)').fill(utc(seconds))
    await form.getByRole('button', { name: 'Apply cutoff', exact: true }).click()
  }
  async function analysis(pane) {
    const contents = pane.getByLabel('Contents')
    if (!await contents.isVisible()) await pane.getByText('Export CSV', { exact: true }).click()
    await contents.selectOption('analysis')
    const pending = page.waitForEvent('download')
    await pane.getByRole('button', { name: 'Download CSV', exact: true }).click()
    return readFile(await (await pending).path(), 'utf8')
  }

  const previous = await downloadWorkspace(page)
  await primaryType.selectOption('time-underwater')
  await cutoff(primary, -1)
  await expect(primary.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(primary, 60)
  await expect(evidence(primary)).toContainText('Time underwater 60 s')
  await expect(evidence(primary)).toContainText('Peak close -3')
  await cutoff(primary, 300)
  await expect(evidence(primary)).toContainText('Time underwater 180 s')
  await expect(evidence(primary)).toContainText('Peak UTC ' + utc(120))
  const earlier = await analysis(primary)
  await cutoff(primary, 360)
  await expect(evidence(primary)).toContainText('Time underwater 0 s')
  await expect(evidence(primary)).toContainText('Peak UTC ' + utc(360))
  await cutoff(primary, 300)
  expect(await analysis(primary)).toBe(earlier)

  await comparisonType.selectOption('time-underwater')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe', exact: true }).click()
  await cutoff(comparison, 119)
  await expect(comparison.getByText('No observations are known at this cutoff.')).toBeVisible()
  await cutoff(comparison, 120)
  await expect(evidence(comparison)).toContainText('Peak UTC ' + utc(120))
  await cutoff(comparison, 240)
  await expect(evidence(comparison)).toContainText('Time underwater Missing')
  await cutoff(comparison, 360)
  await expect(evidence(comparison)).toContainText('Time underwater 240 s')
  await expect(evidence(comparison)).toContainText('Peak close -4')
  const [header, ...rows] = (await analysis(comparison)).trimEnd().split(/\r?\n/)
  const indexes = ['underwater_known_through', 'underwater_peak_time', 'underwater_peak_close', 'underwater_seconds']
    .map(name => header.split(',').indexOf(name))
  expect(indexes.every(index => index > 0)).toBe(true)
  expect(rows.map(row => indexes.map(index => row.split(',')[index]))).toEqual([
    [String(epoch + 360), String(epoch + 120), '-4', '0'],
    [String(epoch + 360), '', '', ''],
    [String(epoch + 360), String(epoch + 120), '-4', '240'],
  ])
  await cutoff(comparison, 480)
  await expect(evidence(comparison)).toContainText('Time underwater 0 s')
  expect(await analysis(primary)).toBe(earlier)

  await comparison.getByLabel('Session calendar CSV (optional)').setInputFiles({
    name: 'underwater-session.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'date,open_utc,close_utc,utc_offset_minutes,kind\n2025-06-02,2025-06-02T14:00:00Z,2025-06-02T14:11:30Z,0,early\n',
    ),
  })
  await comparison.getByRole('button', { name: 'Apply timeframe', exact: true }).click()
  await cutoff(comparison, 689)
  await expect(evidence(comparison)).toContainText('Time underwater Missing')
  await cutoff(comparison, 690)
  await expect(evidence(comparison)).toContainText('Time underwater 0 s')
  await expect(evidence(comparison)).toContainText('Peak UTC ' + utc(690))

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(91)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'time-underwater', comparison: 'time-underwater' })
  for (const backup of [previous, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    await expect(primaryType).toHaveValue(backup === previous ? 'candles' : 'time-underwater')
  }
  await page.reload()
  await expect(comparisonType).toHaveValue('time-underwater')
  await expect(evidence(primary)).toContainText('Time underwater 300 s')
})
