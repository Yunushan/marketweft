import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const quotes = [header, ...[10, 14, 20, 32].map((close, i) =>
  `2025-06-0${i + 1},${close},${close},${close},${close},10`)].join('\n')

test('independent saved periods produce exact SMA and EMA prefixes offline', async ({ page, context, browser, baseURL }) => {
  await page.goto('/')
  await openImport(page, 'AVERAGES', quotes)
  await submitImport(page, 'AVERAGES')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const settings = page.getByRole('group', { name: 'Comparison chart settings' })
  await settings.getByLabel('Comparison instrument').selectOption('LOCAL:AVERAGES')
  await settings.getByLabel('EMA 9', { exact: true }).check()
  await expect(settings.getByLabel('EMA 9', { exact: true })).toBeEnabled()
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(2)
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: /Indicators/ }).click()
  await page.getByRole('checkbox', { name: /Exponential/ }).check()
  const primary = page.getByRole('form', { name: 'Primary chart periods' })
  const compare = page.getByRole('form', { name: 'Comparison chart periods' })
  await primary.getByLabel('SMA period (bars)').fill('0')
  await primary.getByRole('button', { name: 'Apply periods' }).click()
  await expect(primary.getByRole('alert')).toContainText('1 through 100,000')
  async function setPeriods(form, sma, ema) {
    await form.getByLabel('SMA period (bars)').fill(sma)
    await form.getByLabel('EMA period (bars)').fill(ema)
    await form.getByRole('button', { name: 'Apply periods' }).click()
    await expect(form.getByRole('button', { name: 'Apply periods' })).toBeEnabled()
  }
  await setPeriods(primary, '2', '2')
  await setPeriods(compare, '3', '3')
  await page.keyboard.press('Escape')
  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const averages = pane => pane.getByRole('group', { name: 'Moving average values' }).locator(':scope > span')
  const checkFinal = async () => {
    await expect(averages(left)).toHaveText(['SMA 2 26.00', 'EMA 2 27.111111'])
    await expect(averages(right)).toHaveText(['SMA 3 22.00', 'EMA 3 23.333334'])
  }
  await checkFinal()
  const canvas = left.getByLabel(/^AVERAGES interactive/)
  await canvas.hover({ position: { x: 14, y: 60 } })
  await expect(averages(left)).toHaveText(['SMA 2 —', 'EMA 2 —'])
  await expect(averages(right)).toHaveText(['SMA 3 —', 'EMA 3 —'])
  await page.reload()
  await checkFinal()
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(4)
  expect(backup.manifest.preferences.overlayPeriods).toEqual({
    primary: { sma: 2, ema: 2 }, comparison: { sma: 3, ema: 3 },
  })
  const clean = await browser.newContext({ baseURL })
  try {
    const restored = await clean.newPage()
    await restored.goto('/')
    async function restore(bundle) {
      await restored.getByRole('button', { name: 'Workspace backup', exact: true }).click()
      await selectBackup(restored, bundle)
      await restored.getByRole('button', { name: 'Restore workspace', exact: true }).click()
      await expect(restored.getByText('Workspace restored.')).toBeVisible()
    }
    await restore(backup)
    const restoredPrimary = restored.getByRole('region', { name: 'Primary chart pane' })
    await expect(averages(restoredPrimary)).toHaveText(['SMA 2 26.00', 'EMA 2 27.111111'])
    await restore(legacy)
    await expect(averages(restoredPrimary)).toHaveText('SMA 20 —')
  } finally {
    await clean.close()
  }
})
