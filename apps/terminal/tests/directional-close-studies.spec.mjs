import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline directional close studies preserve exact ratios, zero and unavailable evidence', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional-close-studies.csv', import.meta.url), 'utf8')
  await openImport(page, 'DIRECTION', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'DIRECTION')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:DIRECTION')

  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  async function applyStudy(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    if (period !== undefined) await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(period))
    const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  const indicators = page.getByRole('button', { name: /Indicators/ })
  await indicators.click()
  await applyStudy('Primary', 'Price Volume Trend')
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(75)

  await indicators.click()
  await applyStudy('Primary', 'Vertical Horizontal Filter', 3)
  await applyStudy('Primary', 'Psychological Line', 3)
  await applyStudy('Comparison', 'Psychological Line', 2)
  await page.keyboard.press('Escape')
  const vhf = primary.getByRole('group', { name: 'Vertical Horizontal Filter', exact: true })
  const psy = pane => pane.getByRole('group', { name: 'Psychological Line', exact: true })
  async function verifyStudies() {
    await expect(vhf).toHaveText('Vertical Horizontal Filter 3 0.5')
    await expect(psy(primary)).toHaveText('Psychological Line 3 33.333333%')
    await expect(psy(comparison)).toHaveText('Psychological Line 2 50%')
  }
  await verifyStudies()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['vhf_3', 'psychological_line_3'].map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',', ',', ',', '0.4,33.333333', '0.5,33.333333', '0.5,33.333333',
    '0,33.333333', ',0', '1,0', '0.5,33.333333',
  ])
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(76)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(vhf).toHaveCount(backup === current ? 1 : 0)
    await expect(primary.getByRole('group', { name: 'Price Volume Trend', exact: true })).toBeVisible()
  }
  await page.reload()
  await verifyStudies()
})
