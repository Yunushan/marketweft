import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline regression studies preserve slopes, fitted closes and one-bar forecasts', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-rolling-regression.csv', import.meta.url), 'utf8')
  await openImport(page, 'ROLLINGFIT', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'ROLLINGFIT')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:ROLLINGFIT')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })

  const drawings = primary.getByRole('region', { name: 'Chart drawings', exact: true })
  await drawings.getByRole('button', { name: 'New sine line', exact: true }).click()
  const sine = drawings.getByRole('form', { name: 'Sine line', exact: true })
  for (const [label, time, price] of [
    ['Midline', '2025-06-02T14:00:00Z', '0'],
    ['First extremum', '2025-06-02T14:01:00Z', '-1'],
  ]) {
    const anchor = sine.getByRole('group', { name: label, exact: true })
    await anchor.getByLabel('Time (UTC)').fill(time)
    await anchor.getByLabel('Price', { exact: true }).fill(price)
  }
  await sine.getByRole('button', { name: 'Save sine line', exact: true }).click()
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(79)

  await page.getByRole('button', { name: /Indicators/ }).click()
  async function applyStudy(pane, name, period) {
    const form = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await form.getByRole('checkbox', { name: 'Show ' + name, exact: true }).check()
    await form.getByLabel(name + ' period (bars)', { exact: true }).fill(String(period))
    const apply = form.getByRole('button', { name: 'Apply ' + name, exact: true })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await applyStudy('Primary', 'Linear Regression Slope', 3)
  await applyStudy('Primary', 'Time Series Forecast', 3)
  await applyStudy('Comparison', 'Linear Regression Slope', 2)
  await applyStudy('Comparison', 'Time Series Forecast', 2)
  await page.keyboard.press('Escape')
  const slope = pane => pane.getByRole('group', { name: 'Linear Regression Slope', exact: true })
  const forecast = pane => pane.getByRole('group', { name: 'Time Series Forecast', exact: true })
  async function verifyStudies() {
    await expect(slope(primary)).toHaveText('Linear Regression Slope 3 -0.5')
    await expect(forecast(primary)).toHaveText('Time Series Forecast 3 -4')
    await expect(slope(comparison)).toHaveText('Linear Regression Slope 2 1')
    await expect(forecast(comparison)).toHaveText('Time Series Forecast 2 -2')
  }
  await verifyStudies()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [header, ...rows] = (await readFile(await download.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const indexes = ['linear_regression_slope_3', 'time_series_forecast_3'].map(name => header.split(',').indexOf(name))
  expect(indexes.every(index => index > 0)).toBe(true)
  expect(rows.map(row => indexes.map(index => row.split(',')[index]).join(','))).toEqual([
    ',', ',', '2,2', '1,1.333333', '0,0', '-1,-2.666667', '-2,-6', '-0.5,-4',
  ])
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(80)
  expect(current.manifest.series).toEqual(previous.manifest.series)
  expect(current.manifest.preferences.annotations).toEqual(previous.manifest.preferences.annotations)
  for (const backup of [previous, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(forecast(primary)).toHaveCount(backup === current ? 1 : 0)
    await expect(drawings.getByText('Sine cycle', { exact: true })).toBeVisible()
  }
  await page.reload()
  await verifyStudies()

  const fit = pane => pane.getByRole('group', { name: 'Least Squares Moving Average', exact: true })
  await page.getByRole('button', { name: /Indicators/ }).click()
  await applyStudy('Primary', 'Least Squares Moving Average', 3)
  await applyStudy('Comparison', 'Least Squares Moving Average', 4)
  await page.keyboard.press('Escape')
  await expect(fit(primary)).toHaveText('Least Squares Moving Average 3 -3.5')
  await expect(fit(comparison)).toHaveText('Least Squares Moving Average 4 -3.9')
  await verifyStudies()

  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const [withFit] = await Promise.all([
    page.waitForEvent('download'), primary.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ])
  const [fitHeader, ...fitRows] = (await readFile(await withFit.path(), 'utf8')).trimEnd().split(/\r?\n/)
  const column = fitHeader.split(',').indexOf('lsma_3')
  expect(column).toBeGreaterThan(0)
  expect(fitRows.map(row => row.split(',')[column])).toEqual(['', '', '0', '0.333333', '0', '-1.666667', '-4', '-3.5'])

  const withFitBackup = await downloadWorkspace(page)
  expect(withFitBackup.version).toBe(90)
  expect(withFitBackup.manifest.preferences.studies.primary.lsma).toEqual({ enabled: true, period: 3 })
  expect(withFitBackup.manifest.preferences.studies.comparison.lsma).toEqual({ enabled: true, period: 4 })
  for (const backup of [current, withFitBackup]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(fit(primary)).toHaveCount(backup === withFitBackup ? 1 : 0)
    await verifyStudies()
  }
  await page.reload()
  await expect(fit(primary)).toHaveText('Least Squares Moving Average 3 -3.5')
  await expect(fit(comparison)).toHaveText('Least Squares Moving Average 4 -3.9')
})
