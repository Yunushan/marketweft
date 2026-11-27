import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Wilder RSI plots exact warm-up and values on a fixed scale, links panes and restores settings offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-rsi.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const paths = new WeakMap()
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('RSI interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    window.rsiPlot = { points: [], labels: {} }
    proto.scale = function (...args) {
      if (isPrimary(this)) window.rsiPlot = { points: [], labels: {} }
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
      if (isPrimary(this) && this.strokeStyle === '#8eb3fa') window.rsiPlot.points = paths.get(this) ?? []
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (text, x, y, ...args) {
      if (isPrimary(this) && ['0', '30', '70', '100'].includes(text)) window.rsiPlot.labels[text] = y
      return fillText.call(this, text, x, y, ...args)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'RSI', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'RSI')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:RSI')
  await expect(instrument).toBeEnabled()
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(7)

  await page.getByRole('button', { name: /Indicators/ }).click()
  const primaryForm = page.getByRole('form', { name: 'Primary chart RSI' })
  const compareForm = page.getByRole('form', { name: 'Comparison chart RSI' })
  await primaryForm.getByLabel('RSI period (bars)').fill('1')
  await primaryForm.getByRole('button', { name: 'Apply RSI' }).click()
  await expect(primaryForm.getByRole('alert')).toContainText('2 through 100,000')
  for (const [form, period] of [[primaryForm, '3'], [compareForm, '2']]) {
    await form.getByLabel('Show RSI').check()
    await form.getByLabel('RSI period (bars)').fill(period)
    const apply = form.getByRole('button', { name: 'Apply RSI' })
    await apply.click()
    await expect(apply).toBeEnabled()
    await expect(form.getByLabel('RSI period (bars)')).toHaveValue(period)
  }
  await page.keyboard.press('Escape')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const readout = pane => pane.getByRole('group', { name: 'Relative Strength Index' })
  await expect(readout(primary)).toHaveText('RSI 3 26.814268')
  await expect(readout(comparison)).toHaveText('RSI 2 15.529753')

  await expect.poll(() => page.evaluate(() => window.rsiPlot.points.length)).toBe(6)
  const trace = await page.evaluate(() => window.rsiPlot)
  const span = trace.labels['0'] - trace.labels['100']
  expect((trace.labels['0'] - trace.labels['30']) / span).toBeCloseTo(0.3, 8)
  expect((trace.labels['0'] - trace.labels['70']) / span).toBeCloseTo(0.7, 8)
  expect((trace.labels['0'] - trace.points[0][1]) / span).toBeCloseTo(0.77777778, 8)
  expect((trace.labels['0'] - trace.points.at(-1)[1]) / span).toBeCloseTo(0.26814268, 8)

  const canvas = primary.getByLabel(/^RSI interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(readout(primary)).toHaveText('RSI 3 —')
  await expect(readout(comparison)).toHaveText('RSI 2 —')
  await canvas.hover({ position: { x: trace.points[0][0], y: 40 } })
  await expect(readout(primary)).toHaveText('RSI 3 77.777778')
  await expect(readout(comparison)).toHaveText('RSI 2 84.615385')

  const chartType = page.getByLabel('Primary chart type')
  await chartType.selectOption('heikin-ashi')
  await expect(chartType).toBeEnabled()
  const derived = primary.getByLabel(/^RSI interactive Heikin-Ashi/)
  await expect(derived).toBeVisible()
  await derived.hover({ position: { x: trace.points[0][0], y: 40 } })
  await expect(readout(primary)).toHaveText('RSI 3 77.777778')
  await primary.getByText('Export CSV', { exact: true }).click()
  await primary.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await primary.getByRole('button', { name: 'Download CSV' }).click()
  const exported = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(exported[0]).toMatch(/,rsi_3$/)
  expect(exported[3]).toMatch(/,$/)
  expect(exported[4]).toMatch(/,77\.777778$/)
  expect(exported.at(-1)).toMatch(/,26\.814268$/)

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(16)
  expect(current.manifest.preferences.rsi).toEqual({
    primary: { enabled: true, period: 3 }, comparison: { enabled: true, period: 2 },
  })
  expect(current.manifest.series[0].csv).toBe(csv)
  for (const bundle of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    if (bundle === legacy) await expect(readout(primary)).toHaveCount(0)
    else await expect(readout(primary)).toHaveText('RSI 3 26.814268')
  }
  await page.reload()
  await expect(readout(comparison)).toHaveText('RSI 2 15.529753')
})
