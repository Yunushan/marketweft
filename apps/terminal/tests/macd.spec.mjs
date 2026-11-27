import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('MACD charts a signed histogram and exports exact line and signal warm-up offline', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-atr.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillRect } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('MACD interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.macdPlot = { line: [], signal: [], up: [], down: [] }
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
        const path = paths.get(this) ?? []
        if (this.strokeStyle === '#9abdfd') window.macdPlot.line = path
        if (this.strokeStyle === '#f4c384') window.macdPlot.signal = path
        if (this.strokeStyle === '#3e4c6a' && path.length === 2) window.macdPlot.zero = path[0][1]
      }
      return stroke.apply(this, arguments)
    }
    proto.fillRect = function (x, y, width, height) {
      if (isPrimary(this)) {
        if (this.fillStyle === '#458b77') window.macdPlot.up.push([x, y, width, height])
        if (this.fillStyle === '#a3687f') window.macdPlot.down.push([x, y, width, height])
      }
      return fillRect.call(this, x, y, width, height)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'MACD', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'MACD')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:MACD')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  const williams = page.getByRole('form', { name: 'Comparison chart Williams %R' })
  await williams.getByLabel('Show Williams %R').check()
  const saveWilliams = williams.getByRole('button', { name: 'Apply Williams %R' })
  await saveWilliams.click()
  await expect(saveWilliams).toBeEnabled()
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(23)

  await menu.click()
  const form = pane => page.getByRole('form', { name: pane + ' chart MACD' })
  const fast = pane => form(pane).getByLabel('MACD fast period (bars)')
  const slow = pane => form(pane).getByLabel('MACD slow period (bars)')
  const signal = pane => form(pane).getByLabel('MACD signal period (bars)')
  const apply = pane => form(pane).getByRole('button', { name: 'Apply MACD' })
  await expect(fast('Primary')).toHaveValue('12')
  await expect(slow('Primary')).toHaveValue('26')
  await expect(signal('Primary')).toHaveValue('9')
  await slow('Primary').fill('12')
  await apply('Primary').click()
  await expect(form('Primary').getByRole('alert')).toHaveText('The MACD fast period must be shorter than the slow period.')
  await fast('Primary').fill('1')
  await slow('Primary').fill('2')
  await signal('Primary').fill('0')
  await apply('Primary').click()
  await expect(form('Primary').getByRole('alert')).toHaveText('Enter whole MACD periods from 1 through 100,000 bars.')

  for (const [pane, slowBars, signalBars] of [['Primary', '2', '2'], ['Comparison', '3', '1']]) {
    await form(pane).getByLabel('Show MACD').check()
    await fast(pane).fill('1')
    await slow(pane).fill(slowBars)
    await signal(pane).fill(signalBars)
    await apply(pane).click()
    await expect(apply(pane)).toBeEnabled()
  }
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const macd = pane => pane.getByRole('group', { name: 'Moving Average Convergence Divergence' })
  const values = pane => macd(pane).locator(':scope > span')
  await expect(values(left)).toHaveText(['MACD 1/2/2', 'Line -0.382716', 'Signal -0.872428', 'Histogram 0.489712'])
  await expect(values(right)).toHaveText(['MACD 1/3/1', 'Line -1.625', 'Signal -1.625', 'Histogram 0'])

  await expect.poll(() => page.evaluate(() => [window.macdPlot?.line.length, window.macdPlot?.signal.length])).toEqual([6, 5])
  const trace = await page.evaluate(() => window.macdPlot)
  expect(trace.up).toHaveLength(2)
  expect(trace.down).toHaveLength(3)
  expect(trace.zero).toBeGreaterThan(0)
  expect(trace.line[1][1]).toBeCloseTo(trace.zero)
  for (const [, top, , height] of trace.up) {
    expect(height).toBeGreaterThan(0)
    expect(top + height).toBeCloseTo(trace.zero)
  }
  for (const [, top, , height] of trace.down) {
    expect(height).toBeGreaterThan(0)
    expect(top).toBeCloseTo(trace.zero)
  }

  const canvas = left.getByLabel(/^MACD interactive/)
  await canvas.hover({ position: { x: trace.line[0][0], y: 40 } })
  await expect(values(left)).toHaveText(['MACD 1/2/2', 'Line 4', 'Signal —', 'Histogram —'])
  await canvas.hover({ position: { x: trace.line[1][0], y: 40 } })
  await expect(values(left)).toHaveText(['MACD 1/2/2', 'Line 0', 'Signal 2', 'Histogram -2'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-3))).toEqual([
    ['macd_line_1_2_2', 'macd_signal_1_2_2', 'macd_histogram_1_2_2'],
    ['', '', ''], ['4', '', ''], ['0', '2', '-2'], ['-5.333333', '-2.888889', '-2.444444'],
    ['-3.444444', '-3.259259', '-0.185185'], ['-1.148148', '-1.851852', '0.703704'],
    ['-0.382716', '-0.872428', '0.489712'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(24)
  expect(current.manifest.preferences.studies.primary.macd).toEqual({
    enabled: true, period: 1, slowPeriod: 2, macdSignalPeriod: 2,
  })
  expect(current.manifest.preferences.studies.comparison.macd).toEqual({
    enabled: true, period: 1, slowPeriod: 3, macdSignalPeriod: 1,
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'Williams %R' })).toBeVisible()
    if (backup === legacy) await expect(macd(left)).toHaveCount(0)
    else await expect(macd(right)).toContainText('Histogram 0')
  }
  await page.reload()
  await expect(macd(right)).toContainText('Line -1.625')
})
