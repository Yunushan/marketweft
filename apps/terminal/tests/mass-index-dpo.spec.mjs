import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Mass Index and Detrended Price Oscillator restore exact studies and export observed values offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-mass-index-dpo.csv', import.meta.url), 'utf8')
  await openImport(page, 'MASSDPO', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'MASSDPO')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:MASSDPO')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })

  async function setStudy(pane, study, fields) {
    const form = page.getByRole('form', { name: pane + ' chart ' + study, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + study, exact: true }).check()
    for (const [name, value] of fields) {
      await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(value))
    }
    const apply = form.getByRole('button', { name: 'Apply ' + study, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }

  await page.getByRole('button', { name: /Indicators/ }).click()
  await setStudy('Primary', 'Choppiness Index', [['Choppiness Index', 2]])
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(72)

  await page.getByRole('button', { name: /Indicators/ }).click()
  for (const [pane, massSum, dpoPeriod] of [['Primary', 2, 3], ['Comparison', 1, 2]]) {
    await setStudy(pane, 'Mass Index', [['Mass Index EMA', 1], ['Mass Index sum', massSum]])
    await setStudy(pane, 'Detrended Price Oscillator', [['Detrended Price Oscillator', dpoPeriod]])
  }
  await page.keyboard.press('Escape')

  const mass = pane => pane.getByRole('group', { name: 'Mass Index', exact: true })
  const dpo = pane => pane.getByRole('group', { name: 'Detrended Price Oscillator', exact: true })
  async function verifyReadouts() {
    await expect(mass(primary)).toHaveText('Mass Index 1/2 2')
    await expect(mass(comparison)).toHaveText('Mass Index 1/1 1')
    await expect(dpo(primary)).toHaveText('Detrended Price Oscillator 3 0')
    await expect(dpo(comparison)).toHaveText('Detrended Price Oscillator 2 0')
    await expect(primary.getByRole('group', { name: 'Choppiness Index', exact: true })).toBeVisible()
  }
  await verifyReadouts()
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const columns = ['detrended_price_3', 'mass_index_1_2'].map(name => header.split(',').indexOf(name))
  expect(columns.every(index => index > 0)).toBe(true)
  expect(rows.map(row => columns.map(index => row.split(',')[index]).join(','))).toEqual([
    ',', ',', '-2,', '-2,', '-2,2', '-0.333333,2', '2,2', '0,2',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(73)
  expect(current.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(mass(primary)).toHaveCount(backup === prior ? 0 : 1)
    await expect(primary.getByRole('group', { name: 'Choppiness Index', exact: true })).toBeVisible()
  }
  await page.reload()
  await verifyReadouts()
})
