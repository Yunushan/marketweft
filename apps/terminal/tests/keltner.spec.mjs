import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Keltner Channels store two periods per pane and export exact EMA and ATR bands offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-atr.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('KELTNER interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.keltnerPlot = { outer: [], middle: [], grid: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (isPrimary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (isPrimary(this)) paths.get(this)?.push([x, y])
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (isPrimary(this)) {
        const trace = paths.get(this) ?? []
        if (this.strokeStyle === '#d99970') window.keltnerPlot.outer.push(trace)
        if (this.strokeStyle === '#f4cba4') window.keltnerPlot.middle = trace
        if (this.strokeStyle === '#293036' && trace.length === 2) window.keltnerPlot.grid.push(trace[0][1])
      }
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'KELTNER', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'KELTNER')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:KELTNER')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  const donchian = page.getByRole('form', { name: 'Primary chart Donchian Channels' })
  await donchian.getByLabel('Show Donchian Channels').check()
  await donchian.getByLabel('Donchian Channels period (bars)').fill('2')
  const saveDonchian = donchian.getByRole('button', { name: 'Apply Donchian Channels' })
  await saveDonchian.click()
  await expect(saveDonchian).toBeEnabled()
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(20)

  await menu.click()
  const form = pane => page.getByRole('form', { name: pane + ' chart Keltner Channels' })
  const emaInput = pane => form(pane).getByLabel('Keltner EMA period (bars)')
  const atrInput = pane => form(pane).getByLabel('Keltner ATR period (bars)')
  const applyButton = pane => form(pane).getByRole('button', { name: 'Apply Keltner Channels' })
  await expect(emaInput('Primary')).toHaveValue('20')
  await expect(atrInput('Primary')).toHaveValue('10')
  await atrInput('Primary').fill('0')
  await applyButton('Primary').click()
  await expect(form('Primary').getByRole('alert')).toContainText('Enter whole EMA and ATR periods')
  await atrInput('Primary').fill('5')
  await applyButton('Primary').click()
  await expect(applyButton('Primary')).toBeEnabled()
  await page.keyboard.press('Escape')
  const disabled = await downloadWorkspace(page)
  expect(disabled.manifest.preferences.studies.primary.keltner).toEqual({ enabled: false, period: 20, atrPeriod: 5 })
  await menu.click()
  await expect(atrInput('Primary')).toHaveValue('5')
  for (const [pane, ema, atr] of [['Primary', '3', '2'], ['Comparison', '2', '1']]) {
    await form(pane).getByLabel('Show Keltner Channels').check()
    await emaInput(pane).fill(ema)
    await atrInput(pane).fill(atr)
    await applyButton(pane).click()
    await expect(applyButton(pane)).toBeEnabled()
    await expect(atrInput(pane)).toHaveValue(atr)
  }
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const channels = pane => pane.getByRole('group', { name: 'Keltner Channels', exact: true })
  const values = pane => channels(pane).locator(':scope > span')
  await expect(values(left)).toHaveText(['Keltner 3/2', 'Lower -10.093752', 'Middle -5.375', 'Upper -0.656248'])
  await expect(values(right)).toHaveText(['Keltner 2/1', 'Lower -6.617286', 'Middle -6.617284', 'Upper -6.617282'])
  await expect(left.getByRole('group', { name: 'Donchian Channels' })).toBeVisible()

  await expect.poll(() => page.evaluate(() => window.keltnerPlot?.outer.map(trace => trace.length))).toEqual([5, 5])
  const trace = await page.evaluate(() => window.keltnerPlot)
  const [lower, upper] = trace.outer
  expect(trace.middle).toHaveLength(5)
  expect(upper[1][1]).toBeLessThan(trace.middle[1][1])
  expect(lower[1][1]).toBeGreaterThan(trace.middle[1][1])
  expect(upper[1][1]).toBeGreaterThan(Math.min(...trace.grid))
  expect(lower[2][1]).toBeLessThan(Math.max(...trace.grid))

  const canvas = left.getByLabel(/^KELTNER interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(values(left)).toHaveText(['Keltner 3/2', 'Lower —', 'Middle —', 'Upper —'])
  await canvas.hover({ position: { x: lower[1][0], y: 40 } })
  await expect(values(left)).toHaveText(['Keltner 3/2', 'Lower -17.75', 'Middle 6', 'Upper 29.75'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['keltner_lower_3_2', 'keltner_middle_3_2', 'keltner_upper_3_2'],
    ['', '', ''], ['', '', ''], ['2.5', '14', '25.5'], ['-17.75', '6', '29.75'],
    ['-19.375', '-0.5', '18.375'], ['-13.1875', '-3.75', '5.6875'], ['-10.093752', '-5.375', '-0.656248'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(21)
  expect(current.manifest.preferences.studies.primary.keltner).toEqual({ enabled: true, period: 3, atrPeriod: 2 })
  expect(current.manifest.preferences.studies.comparison.keltner).toEqual({ enabled: true, period: 2, atrPeriod: 1 })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(left.getByRole('group', { name: 'Donchian Channels' })).toBeVisible()
    if (backup === legacy) await expect(channels(left)).toHaveCount(0)
    else await expect(channels(right)).toContainText('Upper -6.617282')
  }
  await page.reload()
  await expect(channels(right)).toContainText('Upper -6.617282')
})
