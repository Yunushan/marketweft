import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('anchored TWAP keeps signed elapsed-time evidence through rolls and backup restoration', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const source = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-anchored-twap.csv', import.meta.url), 'utf8')
  await openImport(page, 'TWAP', source)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'TWAP')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:TWAP')
  const comparisonType = page.getByRole('combobox', { name: 'Comparison chart type', exact: true })
  await comparisonType.selectOption('volume-price-scatter')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(70)

  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  await drawings.getByRole('button', { name: 'New anchored twap', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Anchored TWAP', exact: true })
  const input = form.getByLabel('Time (UTC)', { exact: true })
  const apply = form.getByRole('button', { name: 'Save anchored twap', exact: true })
  const at = time => '2025-06-07T' + time + 'Z'
  const second = time => Date.parse(at(time)) / 1000
  await input.fill(at('14:02:00'))
  await apply.click()
  await expect(form.getByRole('alert')).toContainText('Choose the exact UTC time of an observed source bar.')
  await input.fill(at('14:00:00'))
  await apply.click()
  const first = primary.getByRole('group', { name: 'Anchored TWAP values', exact: true })
  await expect(first.locator('span')).toHaveText(['Anchored TWAP 0', 'Anchor ' + at('14:00:00'), 'Elapsed seconds 480'])
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(71)
  const [anchor] = current.manifest.preferences.annotations['LOCAL:TWAP']
  expect(anchor).toMatchObject({ kind: 'anchored-twap', time: second('14:00:00') })
  expect(current.manifest.preferences.chartTypes).toEqual(prior.manifest.preferences.chartTypes)
  expect(current.manifest.series).toEqual(prior.manifest.series)

  async function getExport(pane) {
    await pane.getByText('Export CSV', { exact: true }).click()
    await pane.getByLabel('Contents').selectOption('analysis')
    const [file] = await Promise.all([
      page.waitForEvent('download'), pane.getByRole('button', { name: 'Download CSV', exact: true }).click(),
    ])
    const [header, ...rows] = (await readFile(await file.path(), 'utf8')).trimEnd().split(/\r?\n/)
    const fields = ['anchor_at', 'observed_at', 'price', 'elapsed_seconds'].map(field =>
      header.split(',').indexOf('anchored_twap_' + anchor.id + '_' + field))
    expect(fields.every(index => index > 0)).toBe(true)
    return rows.map(row => fields.map(index => row.split(',')[index]).join(','))
  }
  const row = (observed, price, seconds) => [second('14:00:00'), second(observed), price, seconds].join(',')
  expect(await getExport(primary)).toEqual([
    ',,,', row('14:01:00', '-3', 60), row('14:03:00', '-1.666667', 180),
    row('14:05:00', '0.6', 300), row('14:06:00', '0.166667', 360), row('14:08:00', '0', 480),
  ])
  await comparisonType.selectOption('line')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe', exact: true }).click()
  expect(await getExport(comparison)).toEqual([
    row('14:01:00', '-3', 60), row('14:03:00', '-1.666667', 180),
    row('14:05:00', '0.6', 300), row('14:06:00', '0.166667', 360), row('14:08:00', '0', 480),
  ])

  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(first).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expect(comparisonType).toHaveValue('volume-price-scatter')
  await expect(first).toContainText('Elapsed seconds 480')
  await drawings.getByRole('button', { name: /Edit anchored twap/i }).click()
  await input.fill(at('14:03:00'))
  await apply.click()
  await expect(first.locator('span')).toHaveText(['Anchored TWAP 1', 'Anchor ' + at('14:03:00'), 'Elapsed seconds 300'])
})
