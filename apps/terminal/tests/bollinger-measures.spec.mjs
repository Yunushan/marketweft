import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Bollinger measures plot signed values, leave undefined gaps and restore exact research output offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-bollinger.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const paths = new WeakMap()
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('MEASURES interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    window.measurePlot = { percentB: [], bandwidth: [], labels: [] }
    proto.scale = function (...args) {
      if (isPrimary(this)) window.measurePlot = { percentB: [], bandwidth: [], labels: [] }
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (isPrimary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, fn] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        if (isPrimary(this)) paths.get(this)?.push({ name, x, y })
        return fn.call(this, x, y)
      }
    }
    proto.stroke = function () {
      if (isPrimary(this) && this.strokeStyle === '#e797c7') window.measurePlot.percentB = paths.get(this) ?? []
      if (isPrimary(this) && this.strokeStyle === '#6acec6') window.measurePlot.bandwidth = paths.get(this) ?? []
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (text, x, y, ...args) {
      if (isPrimary(this) && String(text).endsWith('%')) window.measurePlot.labels.push({ text, y })
      return fillText.call(this, text, x, y, ...args)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'MEASURES', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'MEASURES')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:MEASURES')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const configure = async (pane, name, period) => {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    const input = form.getByLabel(name + ' period (bars)')
    await input.fill(period)
    const apply = form.getByRole('button', { name: 'Apply ' + name })
    await apply.click()
    await expect(apply).toBeEnabled()
    await expect(input).toHaveValue(period)
  }
  await menu.click()
  await configure('Primary', 'Bollinger Bands', '3')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(18)
  await menu.click()
  await configure('Primary', 'Bollinger %B', '3')
  await configure('Primary', 'BandWidth', '3')
  await configure('Comparison', 'Bollinger %B', '2')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const percentB = pane => pane.getByRole('group', { name: 'Bollinger %B' })
  const bandwidth = left.getByRole('group', { name: 'Bollinger BandWidth' })
  await expect(percentB(left)).toHaveText('Bollinger %B 3 19.381378%')
  await expect(percentB(right)).toHaveText('Bollinger %B 2 25%')
  await expect(bandwidth).toHaveText('BandWidth 3 —')
  await expect.poll(() => page.evaluate(() => window.measurePlot.percentB.map(point => point.name)))
    .toEqual(['moveTo', 'moveTo', 'lineTo'])
  const trace = await page.evaluate(() => window.measurePlot)
  expect(trace.bandwidth.map(point => point.name)).toEqual(['moveTo', 'moveTo'])
  expect(trace.labels.some(label => label.text === '100.00%')).toBe(true)
  expect(trace.labels.some(label => /^-565\.685/.test(label.text))).toBe(true)
  const canvas = left.getByLabel(/^MEASURES interactive/)
  await canvas.hover({ position: { x: trace.percentB[0].x, y: trace.percentB[0].y } })
  await expect(percentB(left)).toHaveText('Bollinger %B 3 67.677679%')
  await expect(bandwidth).toHaveText('BandWidth 3 -565.685117%')
  await canvas.hover({ position: { x: trace.percentB[1].x, y: trace.percentB[1].y } })
  await expect(percentB(left)).toHaveText('Bollinger %B 3 85.355341%')
  await expect(bandwidth).toHaveText('BandWidth 3 565.6854%')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows[0]).toMatch(/,bb_percent_b_3,bb_bandwidth_3$/)
  expect(rows[3]).toMatch(/,67\.677679,-565\.685117$/)
  expect(rows[4]).toMatch(/,0,0,0,,$/)
  expect(rows.at(-1)).toMatch(/,19\.381378,$/)

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(19)
  expect(current.manifest.preferences.studies).toEqual({
    primary: { bb: { enabled: true, period: 3 }, bb_percent_b: { enabled: true, period: 3 }, bb_bandwidth: { enabled: true, period: 3 } },
    comparison: { bb_percent_b: { enabled: true, period: 2 } },
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(left.getByRole('group', { name: 'Bollinger Bands' })).toBeVisible()
    if (backup === legacy) await expect(percentB(left)).toHaveCount(0)
    else await expect(percentB(left)).toHaveText('Bollinger %B 3 19.381378%')
  }
})

test('large BandWidth values keep every fixed-point digit in the readout and CSV', async ({ page, context }) => {
  const csv = [
    'time,open,high,low,close,volume',
    '2025-08-01,2000000000,2000000000,2000000000,2000000000,1',
    '2025-08-02,-1999999999.999998,-1999999999.999998,-1999999999.999998,-1999999999.999998,1',
  ].join('\n')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'WIDE', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'WIDE')
  await page.getByRole('button', { name: /Indicators/ }).click()
  const form = page.getByRole('form', { name: 'Primary chart BandWidth' })
  await form.getByLabel('Show BandWidth').check()
  await form.getByLabel('BandWidth period (bars)').fill('2')
  await form.getByRole('button', { name: 'Apply BandWidth' }).click()
  await expect(form.getByRole('button', { name: 'Apply BandWidth' })).toBeEnabled()
  await page.keyboard.press('Escape')
  const left = page.getByRole('region', { name: 'Primary chart pane' })
  await expect(left.getByRole('group', { name: 'Bollinger BandWidth' })).toHaveText('BandWidth 2 799999999999999600%')
  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows[0]).toMatch(/,bb_bandwidth_2$/)
  expect(rows[1]).toMatch(/,$/)
  expect(rows[2]).toMatch(/,799999999999999600$/)
})
