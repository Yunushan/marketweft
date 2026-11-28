import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('rolling median and percentile rank preserve ties, blanks and pane windows offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-close-order-statistics.csv', import.meta.url), 'utf8')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'CLOSERANK', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'CLOSERANK')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:CLOSERANK')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBeLessThan(92)

  const median = 'Rolling Median'
  const rank = 'Close Percentile Rank'
  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', '3'], ['Comparison', '4']]) {
    for (const name of [median, rank]) {
      const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
      await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
      const input = form.getByLabel(name + ' period (bars)', { exact: true })
      await expect(input).toHaveValue('20')
      await input.fill(period)
      const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
      await apply.click()
      await expect(apply).toBeEnabled()
    }
  }
  await page.keyboard.press('Escape')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const legend = (pane, name) => pane.getByRole('group', { name, exact: true })
  async function verifyLegends() {
    await expect(legend(primary, median)).toHaveText(median + ' 3 -1')
    await expect(legend(primary, rank)).toHaveText(rank + ' 3 25%')
    await expect(legend(comparison, median)).toHaveText(median + ' 4 -0.5')
    await expect(legend(comparison, rank)).toHaveText(rank + ' 4 16.666667%')
  }
  await verifyLegends()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['rolling_median_3', 'close_percentile_rank_3'].map(column => header.split(',').indexOf(column))
  expect(columns.every(column => column > 0)).toBe(true)
  expect(rows.map(row => columns.map(column => row.split(',')[column]).join(','))).toEqual([
    ',', ',', '-2,100', '2,75', '2,50', '2,0', '2,100', '0,50', '0,0', '-1,25',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(92)
  expect(saved.manifest.preferences.studies.primary.rolling_median).toEqual({ enabled: true, period: 3 })
  expect(saved.manifest.preferences.studies.comparison.close_percentile_rank).toEqual({ enabled: true, period: 4 })
  for (const backup of [previous, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    if (backup === previous) await expect(legend(primary, median)).toHaveCount(0)
    else await verifyLegends()
  }
  await page.reload()
  await verifyLegends()
})
