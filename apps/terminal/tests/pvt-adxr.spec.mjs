import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('PVT and ADX Rating preserve signed volume, warmup gaps and pane settings offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-pvt-adxr.csv', import.meta.url), 'utf8')
  await openImport(page, 'PVTADXR', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'PVTADXR')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:PVTADXR')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  await drawings.getByRole('button', { name: 'New fibonacci circles', exact: true }).click()
  const circles = drawings.getByRole('form', { name: 'Fibonacci circles', exact: true })
  await circles.getByRole('group', { name: 'Centre', exact: true }).getByLabel('Time (UTC)').fill('2025-06-02T14:04:00Z')
  await circles.getByRole('group', { name: 'Radius anchor', exact: true }).getByLabel('Time (UTC)').fill('2025-06-02T14:02:00Z')
  await circles.getByRole('button', { name: 'Save fibonacci circles', exact: true }).click()
  const retainedDrawing = drawings.getByText('Fibonacci circle levels', { exact: true })
  await expect(retainedDrawing).toBeVisible()
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(74)

  await page.getByRole('button', { name: /Indicators/ }).click()
  async function setStudy(pane, name, fields = []) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    for (const [label, value] of fields) {
      await form.getByLabel(label + ' period (bars)', { exact: true }).fill(String(value))
    }
    const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await setStudy('Primary', 'Price Volume Trend')
  await setStudy('Primary', 'ADX Rating', [['ADXR DI', 1], ['ADX smoothing', 2]])
  await setStudy('Comparison', 'ADX Rating', [['ADXR DI', 1], ['ADX smoothing', 1]])
  await page.keyboard.press('Escape')

  const pvt = primary.getByRole('group', { name: 'Price Volume Trend', exact: true })
  const adxr = pane => pane.getByRole('group', { name: 'Average Directional Movement Index Rating', exact: true })
  async function verifyReadouts() {
    await expect(pvt).toHaveText('Price Volume Trend -1')
    await expect(adxr(primary)).toHaveText('ADX Rating 1/2 32.8125%')
    await expect(adxr(comparison)).toHaveText('ADX Rating 1/1 0%')
  }
  await verifyReadouts()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['pvt', 'adxr_1_2'].map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    '0,', '-1.25,', '-2.5,', ',100', '-2.5,75', '-3.5,62.5', '-1,81.25', '-1,65.625', '-1,32.8125',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(75)
  expect(current.manifest.preferences.annotations).toEqual(prior.manifest.preferences.annotations)
  expect(current.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(pvt).toHaveCount(backup === prior ? 0 : 1)
    await expect(retainedDrawing).toBeVisible()
  }
  await page.reload()
  await verifyReadouts()
})
