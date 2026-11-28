import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Close Standard Deviation preserves warm-up, exact zero and independent periods offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-close-dispersion.csv', import.meta.url), 'utf8')
  const label = 'Close Standard Deviation'
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)

  await openImport(page, 'DISPERSION', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'DISPERSION')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:DISPERSION')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBeLessThan(89)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', '2'], ['Comparison', '3']]) {
    const form = page.getByRole('form', { name: pane + ' chart ' + label, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + label, exact: true }).check()
    const input = form.getByLabel(label + ' period (bars)', { exact: true })
    await expect(input).toHaveValue('20')
    await input.fill(period)
    const apply = form.getByRole('button', { name: 'Apply ' + label, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await page.keyboard.press('Escape')

  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const legend = pane => pane.getByRole('group', { name: label, exact: true })
  await expect(legend(primary)).toHaveText(label + ' 2 0')
  await expect(legend(comparison)).toHaveText(label + ' 3 1.414214')

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').at(-1))).toEqual(['close_stddev_2', '', '3', '0', '1.5', '0'])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(89)
  expect(current.manifest.preferences.studies.primary.close_stddev).toEqual({ enabled: true, period: 2 })
  expect(current.manifest.preferences.studies.comparison.close_stddev).toEqual({ enabled: true, period: 3 })
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    if (backup === previous) await expect(legend(primary)).toHaveCount(0)
    else await expect(legend(comparison)).toHaveText(label + ' 3 1.414214')
  }
  await page.reload()
  await expect(legend(primary)).toHaveText(label + ' 2 0')
  await expect(legend(comparison)).toHaveText(label + ' 3 1.414214')
})
