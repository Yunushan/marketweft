import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

async function importOffline(page, context, symbol, csv) {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, symbol, csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, symbol)
}

const studyForm = (page, pane, name) => page.getByRole('form', { name: pane + ' chart ' + name })
async function apply(page, pane, name, period) {
  const form = studyForm(page, pane, name)
  await form.getByLabel('Show ' + name).check()
  if (period) await form.getByLabel(name + ' period (bars)').fill(period)
  const button = form.getByRole('button', { name: 'Apply ' + name })
  await button.click()
  await expect(button).toBeEnabled()
}

async function researchRows(page, pane) {
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  return (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
}

test('CCI and ROC plot signed values, leave an absent zero-base result and export exact data offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-price-momentum.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('MOMENTUM interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (primary(this)) window.momentumPlot = { cci: [], roc: [], guides: [] }
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
        if (this.strokeStyle === '#c5adf1') window.momentumPlot.cci = path
        if (this.strokeStyle === '#73c3e4') window.momentumPlot.roc = path
        if (this.strokeStyle === '#3e4c6a' && path.length === 2) window.momentumPlot.guides.push(path[0][2])
      }
      return stroke.apply(this, arguments)
    }
  })
  await importOffline(page, context, 'MOMENTUM', csv)
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:MOMENTUM')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  await apply(page, 'Comparison', 'DMI')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(28)

  await menu.click()
  await expect(studyForm(page, 'Primary', 'CCI').getByLabel('CCI period (bars)')).toHaveValue('20')
  await expect(studyForm(page, 'Primary', 'ROC').getByLabel('ROC period (bars)')).toHaveValue('12')
  await apply(page, 'Primary', 'CCI', '3')
  await apply(page, 'Primary', 'ROC', '2')
  await apply(page, 'Comparison', 'CCI', '2')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const cci = pane => pane.getByRole('group', { name: 'Commodity Channel Index' })
  const roc = left.getByRole('group', { name: 'Rate of Change' })
  await expect(cci(left)).toHaveText('CCI 3 -100')
  await expect(roc).toHaveText('ROC 2 -400%')
  await expect(cci(right)).toHaveText('CCI 2 -66.666667')

  await expect.poll(() => page.evaluate(() => [window.momentumPlot?.cci.length, window.momentumPlot?.roc.length])).toEqual([10, 9])
  const trace = await page.evaluate(() => window.momentumPlot)
  expect(trace.guides).toHaveLength(4)
  expect(trace.cci[1][2]).toBeCloseTo(trace.guides[0])
  expect(trace.cci[3][2]).toBeCloseTo(trace.guides[2])
  expect(trace.roc[1][2]).toBeLessThan(trace.guides[3])
  expect(trace.roc.at(-1)[2]).toBeGreaterThan(trace.guides[3])
  expect(trace.roc.at(-1)[0]).toBe('moveTo')

  const canvas = left.getByLabel(/^MOMENTUM interactive/)
  await canvas.hover({ position: { x: trace.cci[8][1], y: 40 } })
  await expect(cci(left)).toHaveText('CCI 3 100')
  await expect(roc).toHaveText('ROC 2 —')
  const rows = await researchRows(page, left)
  expect(rows.map(row => row.split(',').slice(-2))).toEqual([
    ['cci_3', 'roc_2'],
    ["",""],
    ["",""],
    ["50","-12.5"],
    ["-100","80"],
    ["-40","14.285714"],
    ["100","-77.777778"],
    ["100","-175"],
    ["16.666667","-150"],
    ["-85.714286","-100"],
    ["-33.333333","0"],
    ["100",""],
    ["-100","-400"],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(29)
  expect(current.manifest.preferences.studies.primary).toEqual({
    cci: { enabled: true, period: 3 }, roc: { enabled: true, period: 2 },
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Directional Movement System' })).toBeVisible()
    if (backup === legacy) await expect(cci(left)).toHaveCount(0)
    else await expect(cci(right)).toHaveText('CCI 2 -66.666667')
  }
  await page.reload()
  await expect(roc).toHaveText('ROC 2 -400%')
})

test('CMO and TRIX save independent panes and export exact observed values offline', async ({ page, context }) => {
  const start = Date.parse('2026-01-01T09:00:00Z') / 1000
  const csv = ['time,open,high,low,close,volume', ...[10, 20, 30, 40, 50, 60, 70].map((close, index) =>
    [start + (index + Number(index >= 3)) * 60, close, close, close, close, 1].join(','))].join('\n')
  await importOffline(page, context, 'OSCILLATORS', csv)
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:OSCILLATORS')
  const comparisonType = page.getByLabel('Comparison chart type')
  await comparisonType.selectOption('close-distribution')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(54)

  await page.getByRole('button', { name: /Indicators/ }).click()
  await apply(page, 'Primary', 'CMO', '2')
  await apply(page, 'Comparison', 'TRIX', '2')
  await page.keyboard.press('Escape')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const cmo = primary.getByRole('group', { name: 'Chande Momentum Oscillator' })
  const trix = comparison.getByRole('group', { name: 'TRIX', exact: true })
  await expect(cmo).toHaveText('CMO 2 100%')
  await expect(trix).toHaveText('TRIX 2 22.222222%')

  for (const [pane, key, expected] of [
    [primary, 'cmo_2', ['', '', '100', '100', '100', '100', '100']],
    [comparison, 'trix_2', ['', '', '', '', '40', '28.571429', '22.222222']],
  ]) {
    const [columns, ...rows] = await researchRows(page, pane)
    const offset = columns.split(',').indexOf(key)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(rows.map(row => row.split(',')[offset])).toEqual(expected)
    expect(rows.map(row => Number(row.split(',')[0]))).toEqual([0, 1, 2, 4, 5, 6, 7].map(i => start + i * 60))
  }
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(55)
  expect(saved.manifest.preferences.studies).toEqual({
    primary: { cmo: { enabled: true, period: 2 } },
    comparison: { trix: { enabled: true, period: 2 } },
  })
  expect(saved.manifest.series).toEqual(previous.manifest.series)
  for (const backup of [previous, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(comparisonType).toHaveValue('close-distribution')
    await expect(cmo).toHaveCount(backup === previous ? 0 : 1)
    await expect(trix).toHaveCount(backup === previous ? 0 : 1)
  }
  await page.reload()
  await expect(cmo).toHaveText('CMO 2 100%')
  await expect(trix).toHaveText('TRIX 2 22.222222%')
})

test('ROC carries a magnitude above signed 64-bit ticks through the browser readout and CSV', async ({ page, context }) => {
  const csv = [
    'time,open,high,low,close,volume',
    '2026-01-01T09:00:00Z,0.000001,0.000001,0.000001,0.000001,1',
    '2026-01-01T09:01:00Z,2000000000,2000000000,2000000000,2000000000,1',
  ].join('\n')
  await importOffline(page, context, 'WIDEROC', csv)
  await page.getByRole('button', { name: /Indicators/ }).click()
  await apply(page, 'Primary', 'ROC', '1')
  await page.keyboard.press('Escape')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await expect(pane.getByRole('group', { name: 'Rate of Change' })).toHaveText('ROC 1 199999999999999900%')
  const rows = await researchRows(page, pane)
  expect(rows.at(-1).split(',').at(-1)).toBe('199999999999999900')
})
