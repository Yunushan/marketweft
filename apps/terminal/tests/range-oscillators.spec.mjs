import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Vortex and Balance of Power preserve exact gaps, pane settings and version 58 offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const origin = Date.parse('2026-01-01T09:00:00Z') / 1000
  const utc = second => new Date((origin + second) * 1000).toISOString().replace('.000Z', 'Z')
  const decimal = ticks => (ticks / 1e6).toFixed(6)
  const csv = [header, ...[[0, -4, -2, -5, -3], [60, -3, 0, -4, -1], [240, 1, 3, 0, 0],
    [300, 0, 0, 0, 0], [360, 0, 0, 0, 0], [500, 0, 2, -2, 0]].map(([time, ...prices]) =>
    [origin + time, ...prices.map(decimal), 1].join(','))].join('\n')
  await openImport(page, 'RANGEOSCS', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'RANGEOSCS')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:RANGEOSCS')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await drawings.getByRole('button', { name: 'New gann fan', exact: true }).click()
  const gann = drawings.getByRole('form', { name: 'Gann fan' })
  await gann.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)').fill(utc(0))
  await gann.getByRole('group', { name: 'Start' }).getByLabel('Price').fill('-0.000002')
  await gann.getByRole('group', { name: 'End' }).getByLabel('Time (UTC)').fill(utc(60))
  await gann.getByRole('group', { name: 'End' }).getByLabel('Price').fill('0.000001')
  await gann.getByRole('button', { name: 'Save gann fan' }).click()
  await expect(drawings.getByText('Gann fan levels', { exact: true })).toBeVisible()
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(57)

  await page.getByRole('button', { name: /Indicators/ }).click()
  async function apply(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    if (period) await form.getByLabel(name + ' period (bars)').fill(String(period))
    const save = form.getByRole('button', { name: 'Apply ' + name })
    await save.click()
    await expect(save).toBeEnabled()
  }
  await apply('Primary', 'Vortex', 2)
  await apply('Comparison', 'Vortex', 3)
  await apply('Primary', 'Balance of Power')
  await page.keyboard.press('Escape')
  const primaryVortex = primary.getByRole('group', { name: 'Vortex Indicator' })
  const comparisonVortex = comparison.getByRole('group', { name: 'Vortex Indicator' })
  const bop = primary.getByRole('group', { name: 'Balance of Power' })
  await expect(primaryVortex.locator('span')).toHaveText(['Vortex 2', 'VI+ 0.5', 'VI− 0.5'])
  await expect(comparisonVortex.locator('span')).toHaveText(['Vortex 3', 'VI+ 0.5', 'VI− 1.25'])
  await expect(bop).toHaveText('Balance of Power 0')
  await expect(comparison.getByRole('group', { name: 'Balance of Power' })).toHaveCount(0)

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const [fields, ...rows] = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  for (const [column, expected] of Object.entries({
    vortex_positive_2: ['', '', '1.5', '1.75', '', '0.5'],
    vortex_negative_2: ['', '', '0.25', '0.75', '', '0.5'],
    bop: ['0.333333', '0.5', '-0.333333', '', '', '0'],
  })) {
    const index = fields.split(',').indexOf(column)
    expect(index).toBeGreaterThan(0)
    expect(rows.map(row => row.split(',')[index])).toEqual(expected)
  }
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(58)
  expect(saved.manifest.preferences.annotations).toEqual(previous.manifest.preferences.annotations)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { vortex: { enabled: true, period: 2 }, bop: { enabled: true } },
    comparison: { vortex: { enabled: true, period: 3 } },
  })
  for (const backup of [previous, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(drawings.getByText('Gann fan levels', { exact: true })).toBeVisible()
    await expect(primaryVortex).toHaveCount(backup === previous ? 0 : 1)
  }
  await page.reload()
  await expect(comparisonVortex.locator('span')).toHaveText(['Vortex 3', 'VI+ 0.5', 'VI− 1.25'])
  await expect(bop).toHaveText('Balance of Power 0')
})
