import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Donchian Channels share the price scale and export the observed OHLC window offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-donchian.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('CHANNEL interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.channelPlot = { outer: [], middle: [], grid: [], bollinger: 0 }
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
        if (this.strokeStyle === '#6fc290') window.channelPlot.outer.push(trace)
        if (this.strokeStyle === '#c0d481') window.channelPlot.middle = trace
        if (this.strokeStyle === '#8393e1') window.channelPlot.bollinger++
        if (this.strokeStyle === '#293036' && trace.length === 2) window.channelPlot.grid.push(trace[0][1])
      }
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'CHANNEL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'CHANNEL')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:CHANNEL')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const form = (pane, study) => page.getByRole('form', { name: pane + ' chart ' + study })
  const apply = async (pane, name, period) => {
    const settings = form(pane, name)
    await settings.getByLabel('Show ' + name).check()
    const input = settings.getByLabel(name + ' period (bars)')
    await input.fill(period)
    const button = settings.getByRole('button', { name: 'Apply ' + name })
    await button.click()
    await expect(button).toBeEnabled()
    await expect(input).toHaveValue(period)
  }
  await menu.click()
  await apply('Primary', 'Bollinger Bands', '3')
  await apply('Primary', 'BandWidth', '3')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(19)

  await menu.click()
  await expect(form('Primary', 'Donchian Channels').getByLabel('Donchian Channels period (bars)')).toHaveValue('20')
  await apply('Primary', 'Donchian Channels', '3')
  await apply('Comparison', 'Donchian Channels', '5')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const channels = pane => pane.getByRole('group', { name: 'Donchian Channels', exact: true })
  const values = pane => channels(pane).locator(':scope > span')
  await expect(values(left)).toHaveText(['Donchian 3', 'Lower -3', 'Middle -0.5', 'Upper 2'])
  await expect(values(right)).toHaveText(['Donchian 5', 'Lower -3', 'Middle 2.000001', 'Upper 7.000001'])
  await expect(left.getByRole('group', { name: 'Bollinger Bands', exact: true })).toBeVisible()

  await expect.poll(() => page.evaluate(() => window.channelPlot?.outer.map(trace => trace.length))).toEqual([6, 6])
  const trace = await page.evaluate(() => window.channelPlot)
  const [lower, upper] = trace.outer
  expect(trace.bollinger).toBe(2)
  expect(trace.middle).toHaveLength(6)
  expect(lower[0][1]).toBeGreaterThan(trace.middle[0][1])
  expect(upper[0][1]).toBeLessThan(trace.middle[0][1])
  expect(lower[0][1]).toBeLessThan(Math.max(...trace.grid))
  expect(upper[0][1]).toBeGreaterThan(Math.min(...trace.grid))

  const canvas = left.getByLabel(/^CHANNEL interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(values(left)).toHaveText(['Donchian 3', 'Lower —', 'Middle —', 'Upper —'])
  await canvas.hover({ position: { x: lower[1][0], y: 40 } })
  await expect(values(left)).toHaveText(['Donchian 3', 'Lower -8.000001', 'Middle -3.000001', 'Upper 2'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['donchian_lower_3', 'donchian_middle_3', 'donchian_upper_3'],
    ['', '', ''], ['', '', ''],
    ['-22', '-5', '12.000001'], ['-8.000001', '-3.000001', '2'],
    ['-4', '1.500001', '7.000001'], ['-3', '2.000001', '7.000001'],
    ['-3', '2.000001', '7.000001'], ['-3', '-0.5', '2'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(20)
  expect(current.manifest.preferences.studies.primary.donchian).toEqual({ enabled: true, period: 3 })
  expect(current.manifest.preferences.studies.comparison.donchian).toEqual({ enabled: true, period: 5 })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(left.getByRole('group', { name: 'Bollinger Bands', exact: true })).toBeVisible()
    if (backup === legacy) await expect(channels(left)).toHaveCount(0)
    else await expect(channels(right)).toContainText('Upper 7.000001')
  }
  await page.reload()
  await expect(channels(right)).toContainText('Upper 7.000001')
})
