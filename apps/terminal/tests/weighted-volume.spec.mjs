import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('MFI and VWMA share observed data while preserving distinct scales and zero-volume gaps', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-weighted-volume.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('WEIGHTED interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.weightedPlot = { mfi: [], vwma: [], ticks: {}, priceTicks: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (primary(this)) paths.get(this)?.push([name, x, y])
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (primary(this)) {
        const path = paths.get(this) ?? []
        if (this.strokeStyle === '#a9cc89') window.weightedPlot.mfi = path
        if (this.strokeStyle === '#f1c177') window.weightedPlot.vwma = path
        if (this.strokeStyle === '#293036' && path.length === 2) window.weightedPlot.priceTicks.push(path[0][2])
      }
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (label, x, y, ...args) {
      if (primary(this) && label.endsWith('%')) window.weightedPlot.ticks[label] = y
      return fillText.call(this, label, x, y, ...args)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'WEIGHTED', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'WEIGHTED')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:WEIGHTED')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const form = (pane, name) => page.getByRole('form', { name: pane + ' chart ' + name })
  const apply = async (pane, name, period) => {
    const settings = form(pane, name)
    await settings.getByLabel('Show ' + name).check()
    if (period) await settings.getByLabel(name + ' period (bars)').fill(period)
    const button = settings.getByRole('button', { name: 'Apply ' + name })
    await button.click()
    await expect(button).toBeEnabled()
  }
  await menu.click()
  await apply('Comparison', 'Chaikin Money Flow')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(26)
  await menu.click()
  await expect(form('Primary', 'MFI').getByLabel('MFI period (bars)')).toHaveValue('14')
  await expect(form('Primary', 'VWMA').getByLabel('VWMA period (bars)')).toHaveValue('20')
  await apply('Primary', 'MFI', '2')
  await apply('Primary', 'VWMA', '2')
  await apply('Comparison', 'VWMA', '3')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const mfi = left.getByRole('group', { name: 'Money Flow Index' })
  const vwma = pane => pane.getByRole('group', { name: 'Volume-Weighted Moving Average' })
  await expect(mfi).toHaveText('MFI 2 0%')
  await expect(vwma(left)).toHaveText('VWMA 2 0.5')
  await expect(vwma(right)).toHaveText('VWMA 3 4.166667')

  await expect.poll(() => page.evaluate(() => [window.weightedPlot?.mfi.length, window.weightedPlot?.vwma.length])).toEqual([6, 7])
  const trace = await page.evaluate(() => window.weightedPlot)
  expect(Object.keys(trace.ticks)).toEqual(['0%', '20%', '80%', '100%'])
  expect(trace.mfi[0][2]).toBeCloseTo(trace.ticks['100%'])
  expect(trace.mfi.at(-1)[2]).toBeCloseTo(trace.ticks['0%'])
  expect(trace.mfi[3][0]).toBe('moveTo')
  expect(trace.vwma[4][0]).toBe('moveTo')
  expect(trace.vwma.every(([, , y]) => y > Math.min(...trace.priceTicks) && y < trace.ticks['100%'])).toBe(true)

  const canvas = left.getByLabel(/^WEIGHTED interactive/)
  await canvas.hover({ position: { x: (trace.vwma[3][1] + trace.vwma[4][1]) / 2, y: 40 } })
  await expect(mfi).toHaveText('MFI 2 —')
  await expect(vwma(left)).toHaveText('VWMA 2 —')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-2))).toEqual([
    ['mfi_2', 'vwma_2'], ['', ''], ['', '-7'], ['100', '-6.5'], ['0', '-7.8'], ['0', '-9'],
    ['', ''], ['100', '6'], ['89.552239', '5'], ['0', '0.5'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(27)
  expect(current.manifest.preferences.studies.primary).toEqual({
    mfi: { enabled: true, period: 2 }, vwma: { enabled: true, period: 2 },
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Chaikin Money Flow' })).toBeVisible()
    if (backup === legacy) await expect(vwma(left)).toHaveCount(0)
    else await expect(vwma(right)).toHaveText('VWMA 3 4.166667')
  }
  await page.reload()
  await expect(mfi).toHaveText('MFI 2 0%')
})
