import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Williams %R preserves signed values, warm-up and flat-window gaps offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-stochastic.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('WILLIAMS interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.williamsPlot = { line: [], ticks: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (isPrimary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (isPrimary(this)) paths.get(this)?.push([name, x, y])
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (isPrimary(this) && this.strokeStyle === '#ceaeec') window.williamsPlot.line = paths.get(this) ?? []
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (label, x, y, ...args) {
      if (isPrimary(this) && label.endsWith('%')) window.williamsPlot.ticks.push([label, y])
      return fillText.call(this, label, x, y, ...args)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'WILLIAMS', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'WILLIAMS')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:WILLIAMS')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  const stochastic = page.getByRole('form', { name: 'Comparison chart Stochastic Oscillator' })
  await stochastic.getByLabel('Show Stochastic Oscillator').check()
  const saveStochastic = stochastic.getByRole('button', { name: 'Apply Stochastic Oscillator' })
  await saveStochastic.click()
  await expect(saveStochastic).toBeEnabled()
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(22)

  await menu.click()
  const form = pane => page.getByRole('form', { name: pane + ' chart Williams %R' })
  const periodInput = pane => form(pane).getByLabel('Williams %R period (bars)')
  await expect(periodInput('Primary')).toHaveValue('14')
  for (const [pane, period] of [['Primary', '2'], ['Comparison', '1']]) {
    await form(pane).getByLabel('Show Williams %R').check()
    await periodInput(pane).fill(period)
    const apply = form(pane).getByRole('button', { name: 'Apply Williams %R' })
    await apply.click()
    await expect(apply).toBeEnabled()
    await expect(periodInput(pane)).toHaveValue(period)
  }
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const oscillator = pane => pane.getByRole('group', { name: 'Williams %R', exact: true })
  await expect(oscillator(left)).toHaveText('Williams %R 2 -50%')
  await expect(oscillator(right)).toHaveText('Williams %R 1 -43.75%')

  await expect.poll(() => page.evaluate(() => window.williamsPlot?.line.length)).toBe(8)
  const trace = await page.evaluate(() => window.williamsPlot)
  expect(trace.ticks.map(([tick]) => tick)).toEqual(['-100%', '-80%', '-20%', '0%'])
  expect(trace.line.map(([type]) => type)).toEqual([
    'moveTo', 'lineTo', 'lineTo', 'lineTo', 'moveTo', 'lineTo', 'lineTo', 'lineTo',
  ])
  const ticks = Object.fromEntries(trace.ticks)
  expect(trace.line[0][2]).toBeCloseTo(ticks['0%'])
  expect(trace.line[1][2]).toBeCloseTo(ticks['-100%'])
  expect(trace.line.at(-1)[2]).toBeCloseTo((ticks['0%'] + ticks['-100%']) / 2)

  const canvas = left.getByLabel(/^WILLIAMS interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(oscillator(left)).toHaveText('Williams %R 2 —')
  const gap = (trace.line[3][1] + trace.line[4][1]) / 2
  await canvas.hover({ position: { x: gap, y: 40 } })
  await expect(oscillator(left)).toHaveText('Williams %R 2 —')
  await canvas.hover({ position: { x: trace.line[4][1], y: 40 } })
  await expect(oscillator(left)).toHaveText('Williams %R 2 -50%')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').at(-1))).toEqual([
    'williams_r_2', '', '0', '-100', '-60', '-50', '', '-50', '0', '-75', '-50',
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(23)
  expect(current.manifest.preferences.studies.primary.williams_r).toEqual({ enabled: true, period: 2 })
  expect(current.manifest.preferences.studies.comparison.williams_r).toEqual({ enabled: true, period: 1 })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Stochastic Oscillator' })).toBeVisible()
    if (backup === legacy) await expect(oscillator(left)).toHaveCount(0)
    else await expect(oscillator(right)).toHaveText('Williams %R 1 -43.75%')
  }
  await page.reload()
  await expect(oscillator(right)).toHaveText('Williams %R 1 -43.75%')
})
