import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, submitImport } from './catalog-fixtures.mjs'

test('fixed-duration research preserves source history and exports exact buckets with missing coverage', async ({ page, context }) => {
  await page.goto('/')
  const csv = [
    header,
    '0,-1,5,-2,2,0.000001',
    '120,2,3,-7,-1,1.000001',
    '180,1,5,0,3,0.1',
    '240,3,4,1,1,0.2',
    '300,1,6,-2,4,0.000001',
    '540,8,9,6,7,2',
  ].join('\n')
  await openImport(page, 'ROLL', csv)
  await submitImport(page, 'ROLL')
  const before = await downloadWorkspace(page)
  await context.setOffline(true)
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('180')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–3 of 3')
  await expect(pane.getByText('1/3 source bars', { exact: true })).toBeVisible()
  await pane.getByLabel('Target interval (seconds)').fill('181')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByRole('alert')).toHaveText(/larger whole multiple/)
  await expect(pane.getByTestId('viewport')).toHaveText('1–3 of 3')
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), pane.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('LOCAL-ROLL-180s-visible-analysis.csv')
  const [columns, first, second, third] = (await readFile(await download.path(), 'utf8')).trimEnd().split('\r\n')
  expect(columns).toContain('source_interval_seconds,target_interval_seconds,observed_source_bars,expected_source_bars')
  expect(first).toMatch(/^0,-1,5,-7,-1,1\.000002,.+,"180 seconds",.+,60,180,2,3,$/)
  expect(second).toMatch(/^180,1,6,-2,4,0\.300001,.+,60,180,3,3,$/)
  expect(third).toMatch(/^540,8,9,6,7,2,.+,60,180,1,3,$/)
  const after = await downloadWorkspace(page)
  expect(after.manifest).toEqual(before.manifest)
  await pane.getByRole('button', { name: 'Show source bars' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–6 of 6')
})
