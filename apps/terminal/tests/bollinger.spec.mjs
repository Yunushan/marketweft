import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Bollinger Bands use the price scale and export exact independent pane values offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-bollinger.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('BANDS interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    window.bandPlot = { outer: [], middle: [], grid: [] }
    proto.scale = function (...args) {
      if (isPrimary(this)) window.bandPlot = { outer: [], middle: [], grid: [] }
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
        if (this.strokeStyle === '#8393e1') window.bandPlot.outer.push(trace)
        if (this.strokeStyle === '#bcb9f2') window.bandPlot.middle = trace
        if (this.strokeStyle === '#293036' && trace.length === 2) window.bandPlot.grid.push(trace[0][1])
      }
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'BANDS', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'BANDS')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:BANDS')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const apply = async (pane, name, period) => {
    const form = page.getByRole('form', { name: pane + ' chart ' + name })
    await form.getByLabel('Show ' + name).check()
    const input = form.getByLabel(name + ' period (bars)')
    await input.fill(period)
    const button = form.getByRole('button', { name: 'Apply ' + name })
    await button.click()
    await expect(button).toBeEnabled()
    await expect(input).toHaveValue(period)
  }
  await menu.click()
  await apply('Comparison', 'ATR', '2')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(17)

  await menu.click()
  const primaryForm = page.getByRole('form', { name: 'Primary chart Bollinger Bands' })
  await expect(primaryForm.getByLabel('Bollinger Bands period (bars)')).toHaveValue('20')
  await apply('Primary', 'Bollinger Bands', '3')
  await apply('Comparison', 'Bollinger Bands', '2')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const bands = pane => pane.getByRole('group', { name: 'Bollinger Bands' })
  await expect(bands(left).locator(':scope > span')).toHaveText([
    'BB 3', 'Lower -9.797959', 'Middle 0', 'Upper 9.797959',
  ])
  await expect(bands(right)).toContainText('Upper 12')
  await expect.poll(() => page.evaluate(() => window.bandPlot.outer.map(trace => trace.length))).toEqual([4, 4])
  const trace = await page.evaluate(() => window.bandPlot)
  const [lower, upper] = trace.outer
  expect(trace.middle).toHaveLength(4)
  expect(lower.at(-1)[1]).toBeLessThan(Math.max(...trace.grid))
  expect(upper.at(-1)[1]).toBeGreaterThan(Math.min(...trace.grid))
  expect(lower.at(-1)[1]).toBeGreaterThan(trace.middle.at(-1)[1])
  expect(upper.at(-1)[1]).toBeLessThan(trace.middle.at(-1)[1])

  const canvas = left.getByLabel(/^BANDS interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(bands(left).locator(':scope > span')).toHaveText(['BB 3', 'Lower —', 'Middle —', 'Upper —'])
  await canvas.hover({ position: { x: lower[1][0], y: 40 } })
  await expect(bands(left).locator(':scope > span')).toHaveText(['BB 3', 'Lower 0', 'Middle 0', 'Upper 0'])
  await expect(bands(right)).toContainText('Upper 0')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows[0]).toMatch(/,bb_lower_3,bb_middle_3,bb_upper_3$/)
  expect(rows[2]).toMatch(/,,,$/)
  expect(rows[3]).toMatch(/,-2\.552285,-0\.666667,1\.218951$/)
  expect(rows[4]).toMatch(/,0,0,0$/)

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(18)
  expect(current.manifest.preferences.studies).toEqual({
    primary: { bb: { enabled: true, period: 3 } },
    comparison: { atr: { enabled: true, period: 2 }, bb: { enabled: true, period: 2 } },
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Average True Range' })).toBeVisible()
    if (backup === legacy) await expect(bands(left)).toHaveCount(0)
    else await expect(bands(left)).toContainText('Upper 9.797959')
  }
  await page.reload()
  await expect(bands(right)).toContainText('Upper 12')
})
