import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('DMI plots plus DI, minus DI and ADX with distinct warm-up and exact offline research CSV', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-directional.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('DIRECTIONAL interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (primary(this)) window.dmiPlot = { plus: [], minus: [], adx: [], ticks: {} }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (primary(this)) paths.get(this)?.push([x, y])
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (primary(this)) {
        if (this.strokeStyle === '#6ecb99') window.dmiPlot.plus = paths.get(this) ?? []
        if (this.strokeStyle === '#e68a88') window.dmiPlot.minus = paths.get(this) ?? []
        if (this.strokeStyle === '#aaa3f0') window.dmiPlot.adx = paths.get(this) ?? []
      }
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (label, x, y, ...args) {
      if (primary(this) && label.endsWith('%')) window.dmiPlot.ticks[label] = y
      return fillText.call(this, label, x, y, ...args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'DIRECTIONAL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'DIRECTIONAL')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:DIRECTIONAL')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  const old = page.getByRole('form', { name: 'Comparison chart VWMA' })
  await old.getByLabel('Show VWMA').check()
  const saveOld = old.getByRole('button', { name: 'Apply VWMA' })
  await saveOld.click()
  await expect(saveOld).toBeEnabled()
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(27)

  await menu.click()
  const form = pane => page.getByRole('form', { name: pane + ' chart DMI' })
  const di = pane => form(pane).getByLabel('DI period (bars)')
  const adx = pane => form(pane).getByLabel('ADX smoothing period (bars)')
  await expect(di('Primary')).toHaveValue('14')
  await expect(adx('Primary')).toHaveValue('14')
  for (const [pane, period, smoothing] of [['Primary', '2', '2'], ['Comparison', '1', '3']]) {
    await form(pane).getByLabel('Show DMI').check()
    await di(pane).fill(period)
    await adx(pane).fill(smoothing)
    const apply = form(pane).getByRole('button', { name: 'Apply DMI' })
    await apply.click()
    await expect(apply).toBeEnabled()
  }
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const dmi = pane => pane.getByRole('group', { name: 'Directional Movement System' })
  const values = pane => dmi(pane).locator(':scope > span')
  await expect(values(left)).toHaveText(['DMI 2/2', '+DI 89.567231%', '−DI 4.095827%', 'ADX 83.607629%'])
  await expect(values(right)).toHaveText(['DMI 1/3', '+DI 100%', '−DI 0%', 'ADX 56.378601%'])

  await expect.poll(() => page.evaluate(() => [window.dmiPlot?.plus.length, window.dmiPlot?.minus.length, window.dmiPlot?.adx.length])).toEqual([8, 8, 7])
  const trace = await page.evaluate(() => window.dmiPlot)
  expect(Object.keys(trace.ticks)).toEqual(['0%', '25%', '50%', '75%', '100%'])
  expect(trace.plus[0][1]).toBeCloseTo(trace.ticks['50%'])
  expect(trace.plus.at(-1)[1]).toBeLessThan(trace.adx.at(-1)[1])
  expect(trace.minus.at(-1)[1]).toBeGreaterThan(trace.adx.at(-1)[1])

  const canvas = left.getByLabel(/^DIRECTIONAL interactive/)
  await canvas.hover({ position: { x: trace.plus[0][0], y: 40 } })
  await expect(values(left)).toHaveText(['DMI 2/2', '+DI 50%', '−DI 21.428571%', 'ADX —'])
  await canvas.hover({ position: { x: trace.adx[0][0], y: 40 } })
  await expect(values(left)).toHaveText(['DMI 2/2', '+DI 14%', '−DI 74%', 'ADX 54.090909%'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['dmi_plus_di_2_2', 'dmi_minus_di_2_2', 'dmi_adx_2_2'],
    ["","",""],
    ["","",""],
    ["50","21.428571",""],
    ["14","74","54.090909"],
    ["8.974359","67.948718","65.378788"],
    ["8.974359","67.948718","71.022727"],
    ["8.974378","67.948704","73.844673"],
    ["4.929587","37.323931","75.255646"],
    ["4.929587","37.323931","75.961133"],
    ["89.567231","4.095827","83.607629"],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(28)
  expect(current.manifest.preferences.studies.primary.dmi).toEqual({ enabled: true, period: 2, adxPeriod: 2 })
  expect(current.manifest.preferences.studies.comparison.dmi).toEqual({ enabled: true, period: 1, adxPeriod: 3 })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Volume-Weighted Moving Average' })).toBeVisible()
    if (backup === legacy) await expect(dmi(left)).toHaveCount(0)
    else await expect(dmi(right)).toContainText('ADX 56.378601%')
  }
  await page.reload()
  await expect(dmi(left)).toContainText('ADX 83.607629%')
})
