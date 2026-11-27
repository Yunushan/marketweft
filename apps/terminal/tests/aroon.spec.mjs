import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Aroon and its oscillator show latest ties, exact signed recency and independent settings offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-aroon.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('AROON interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (primary(this)) window.aroonPlot = { up: [], down: [], oscillator: [], ticks: [] }
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
        const trace = paths.get(this) ?? []
        if (this.strokeStyle === '#87cb8d') window.aroonPlot.up = trace
        if (this.strokeStyle === '#e39386') window.aroonPlot.down = trace
        if (this.strokeStyle === '#98c9ef') window.aroonPlot.oscillator = trace
      }
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (label, x, y, ...args) {
      if (primary(this) && label.endsWith('%')) window.aroonPlot.ticks.push([label, y])
      return fillText.call(this, label, x, y, ...args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'AROON', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'AROON')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:AROON')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const form = (pane, name) => page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
  const apply = async (pane, name, period) => {
    const settings = form(pane, name)
    await settings.getByLabel('Show ' + name, { exact: true }).check()
    if (period) await settings.getByLabel(name + ' period (bars)').fill(period)
    const button = settings.getByRole('button', { name: 'Apply ' + name, exact: true })
    await button.click()
    await expect(button).toBeEnabled()
  }
  await menu.click()
  await apply('Comparison', 'ROC')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(29)

  await menu.click()
  await expect(form('Primary', 'Aroon').getByLabel('Aroon period (bars)')).toHaveValue('25')
  await expect(form('Primary', 'Aroon Oscillator').getByLabel('Aroon Oscillator period (bars)')).toHaveValue('25')
  await apply('Primary', 'Aroon', '3')
  await apply('Primary', 'Aroon Oscillator', '3')
  await apply('Comparison', 'Aroon Oscillator', '2')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const pair = left.getByRole('group', { name: 'Aroon', exact: true }).locator(':scope > span')
  const oscillator = pane => pane.getByRole('group', { name: 'Aroon Oscillator' })
  await expect(pair).toHaveText(['Aroon 3', 'Up 66.666667%', 'Down 33.333333%'])
  await expect(oscillator(left)).toHaveText('Aroon Oscillator 3 33.333333%')
  await expect(oscillator(right)).toHaveText('Aroon Oscillator 2 50%')

  await expect.poll(() => page.evaluate(() => [window.aroonPlot?.up.length, window.aroonPlot?.down.length, window.aroonPlot?.oscillator.length])).toEqual([9, 9, 9])
  const trace = await page.evaluate(() => window.aroonPlot)
  expect(trace.ticks.map(([tick]) => tick)).toEqual(['0%', '50%', '100%', '-100%', '-50%', '0%', '50%', '100%'])
  expect(trace.up[0][1]).toBeCloseTo(trace.ticks[2][1])
  expect(trace.up[1][1]).toBeCloseTo(trace.ticks[2][1])
  expect(trace.down[0][1]).toBeCloseTo(trace.ticks[0][1])
  expect(trace.oscillator[0][1]).toBeCloseTo(trace.ticks[7][1])
  expect(trace.oscillator[4][1]).toBeCloseTo(trace.ticks[3][1])

  const canvas = left.getByLabel(/^AROON interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(pair).toHaveText(['Aroon 3', 'Up —', 'Down —'])
  await expect(oscillator(left)).toHaveText('Aroon Oscillator 3 —')
  await canvas.hover({ position: { x: trace.up[4][0], y: 40 } })
  await expect(pair).toHaveText(['Aroon 3', 'Up 0%', 'Down 100%'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['aroon_up_3', 'aroon_down_3', 'aroon_oscillator_3'],
    ['', '', ''], ['', '', ''], ['', '', ''], ['100', '0', '100'], ['100', '0', '100'],
    ['66.666667', '100', '-33.333333'], ['33.333333', '100', '-66.666667'],
    ['0', '100', '-100'], ['0', '100', '-100'], ['100', '100', '0'],
    ['100', '66.666667', '33.333333'], ['66.666667', '33.333333', '33.333333'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(30)
  expect(current.manifest.preferences.studies.primary).toEqual({
    aroon: { enabled: true, period: 3 }, aroon_oscillator: { enabled: true, period: 3 },
  })
  expect(current.manifest.preferences.studies.comparison.aroon_oscillator).toEqual({ enabled: true, period: 2 })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Rate of Change' })).toBeVisible()
    if (backup === legacy) await expect(oscillator(left)).toHaveCount(0)
    else await expect(oscillator(right)).toHaveText('Aroon Oscillator 2 50%')
  }
  await page.reload()
  await expect(oscillator(left)).toHaveText('Aroon Oscillator 3 33.333333%')
})
