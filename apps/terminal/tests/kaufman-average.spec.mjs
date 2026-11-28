import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Kaufman average and efficiency use exact signed observed prices and independent pane periods offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = offset => new Date((start + offset) * 1000).toISOString().replace('.000Z', 'Z')
  const csv = [header, ...[-4, -2, 0, -2, 0, 0, 0, 4, 0, -2].map((close, index) =>
    [start + index * 60 + (index >= 6 ? 180 : 0), close, close + 1, close - 1, close, 1].join(','))].join('\n')
  await openImport(page, 'KAMA', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'KAMA')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:KAMA')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  await drawings.getByRole('button', { name: 'New gann box', exact: true }).click()
  const box = drawings.getByRole('form', { name: 'Gann box' })
  await box.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)').fill(iso(0))
  await box.getByRole('group', { name: 'Start' }).getByLabel('Price').fill('-4')
  await box.getByRole('group', { name: 'End' }).getByLabel('Time (UTC)').fill(iso(720))
  await box.getByRole('group', { name: 'End' }).getByLabel('Price').fill('4')
  await box.getByRole('button', { name: 'Save gann box' }).click()
  await expect(drawings.getByText('Gann box levels', { exact: true })).toBeVisible()
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(61)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, period] of [['Primary', 2], ['Comparison', 3]]) {
    for (const name of ['KAMA', 'Kaufman Efficiency Ratio']) {
      const form = page.getByRole('form', { name: pane + ' chart ' + name })
      await form.getByLabel('Show ' + name).check()
      await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(period))
      const save = form.getByRole('button', { name: 'Apply ' + name })
      await save.click()
      await expect(save).toBeEnabled()
    }
  }
  await page.keyboard.press('Escape')
  const average = pane => pane.getByRole('group', { name: 'Kaufman Adaptive Moving Average' })
  const ratio = pane => pane.getByRole('group', { name: 'Kaufman Efficiency Ratio' })
  async function expectStudies() {
    await expect(average(primary)).toHaveText('KAMA 2 -0.187807')
    await expect(average(comparison)).toHaveText('KAMA 3 1.091786')
    await expect(ratio(primary)).toHaveText('Kaufman Efficiency Ratio 2 100%')
    await expect(ratio(comparison)).toHaveText('Kaufman Efficiency Ratio 3 20%')
  }
  await expectStudies()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const [fields, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const indices = ['kama_2', 'kaufman_efficiency_2'].map(key => fields.split(',').indexOf(key))
  expect(indices.every(index => index > 0)).toBe(true)
  expect(rows.map(row => indices.map(index => row.split(',')[index]).join(','))).toEqual([
    ',', '-3,', '-1.666667,100', '-1.668054,0', '-1.661111,0', '-0.922839,100',
    '-0.918998,0', '1.267223,100', '1.261948,0', '-0.187807,100',
  ])

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(62)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { kama: { enabled: true, period: 2 }, kaufman_efficiency: { enabled: true, period: 2 } },
    comparison: { kama: { enabled: true, period: 3 }, kaufman_efficiency: { enabled: true, period: 3 } },
  })
  expect(saved.manifest.preferences.annotations).toEqual(prior.manifest.preferences.annotations)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(drawings.getByText('Gann box levels', { exact: true })).toBeVisible()
    await expect(average(primary)).toHaveCount(backup === prior ? 0 : 1)
  }
  await page.reload()
  await expectStudies()
})
