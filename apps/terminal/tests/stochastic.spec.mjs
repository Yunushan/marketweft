import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Stochastic %K and %D share a fixed scale and leave precise gaps across flat windows', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-stochastic.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke, fillText } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('STOCH interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.stochPlot = { k: [], d: [], ticks: {} }
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
      if (isPrimary(this)) {
        if (this.strokeStyle === '#a6c9f8') window.stochPlot.k = paths.get(this) ?? []
        if (this.strokeStyle === '#f1a98a') window.stochPlot.d = paths.get(this) ?? []
      }
      return stroke.apply(this, arguments)
    }
    proto.fillText = function (label, x, y, ...args) {
      if (isPrimary(this) && label.endsWith('%')) window.stochPlot.ticks[label] = y
      return fillText.call(this, label, x, y, ...args)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'STOCH', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'STOCH')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:STOCH')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  const keltner = page.getByRole('form', { name: 'Primary chart Keltner Channels' })
  await keltner.getByLabel('Show Keltner Channels').check()
  const saveKeltner = keltner.getByRole('button', { name: 'Apply Keltner Channels' })
  await saveKeltner.click()
  await expect(saveKeltner).toBeEnabled()
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(21)

  await menu.click()
  const form = pane => page.getByRole('form', { name: pane + ' chart Stochastic Oscillator' })
  const lookback = pane => form(pane).getByLabel('Stochastic lookback period (bars)')
  const smooth = pane => form(pane).getByLabel('Stochastic %K smoothing period (bars)')
  const signal = pane => form(pane).getByLabel('Stochastic %D period (bars)')
  const apply = pane => form(pane).getByRole('button', { name: 'Apply Stochastic Oscillator' })
  await expect(lookback('Primary')).toHaveValue('14')
  await expect(smooth('Primary')).toHaveValue('3')
  await expect(signal('Primary')).toHaveValue('3')
  await signal('Primary').fill('0')
  await apply('Primary').click()
  await expect(form('Primary').getByRole('alert')).toContainText('Enter whole Stochastic periods')
  for (const [pane, averaging] of [['Primary', '2'], ['Comparison', '1']]) {
    await form(pane).getByLabel('Show Stochastic Oscillator').check()
    await lookback(pane).fill('2')
    await smooth(pane).fill(averaging)
    await signal(pane).fill(averaging)
    await apply(pane).click()
    await expect(apply(pane)).toBeEnabled()
  }
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const oscillator = pane => pane.getByRole('group', { name: 'Stochastic Oscillator', exact: true })
  const values = pane => oscillator(pane).locator(':scope > span')
  await expect(values(left)).toHaveText(['Stochastic Oscillator 2/2/2', '%K 37.5%', '%D 50%'])
  await expect(values(right)).toHaveText(['Stochastic Oscillator 2/1/1', '%K 50%', '%D 50%'])

  await expect.poll(() => page.evaluate(() => [window.stochPlot?.k.length, window.stochPlot?.d.length])).toEqual([6, 4])
  const trace = await page.evaluate(() => window.stochPlot)
  expect(Object.keys(trace.ticks)).toEqual(['0%', '20%', '80%', '100%'])
  expect(trace.k.map(([type]) => type)).toEqual(['moveTo', 'lineTo', 'lineTo', 'moveTo', 'lineTo', 'lineTo'])
  expect(trace.d.map(([type]) => type)).toEqual(['moveTo', 'lineTo', 'moveTo', 'lineTo'])
  expect(trace.k[1][2]).toBeCloseTo(trace.ticks['20%'])
  expect(trace.d.at(-1)[2]).toBeCloseTo((trace.ticks['0%'] + trace.ticks['100%']) / 2)

  const canvas = left.getByLabel(/^STOCH interactive/)
  const step = trace.k[1][1] - trace.k[0][1]
  await canvas.hover({ position: { x: trace.k[2][1] + step, y: 40 } })
  await expect(values(left)).toHaveText(['Stochastic Oscillator 2/2/2', '%K —', '%D —'])
  await canvas.hover({ position: { x: trace.k[3][1], y: 40 } })
  await expect(values(left)).toHaveText(['Stochastic Oscillator 2/2/2', '%K 75%', '%D —'])

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-2))).toEqual([
    ['stochastic_k_2_2_2', 'stochastic_d_2_2_2'], ['', ''], ['', ''],
    ['50', ''], ['20', '35'], ['45', '32.5'], ['', ''], ['', ''], ['75', ''], ['62.5', '68.75'], ['37.5', '50'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(22)
  expect(current.manifest.preferences.studies.primary.stochastic).toEqual({
    enabled: true, period: 2, smoothPeriod: 2, signalPeriod: 2,
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(left.getByRole('group', { name: 'Keltner Channels' })).toBeVisible()
    if (backup === legacy) await expect(oscillator(left)).toHaveCount(0)
    else await expect(oscillator(right)).toContainText('%K 50%')
  }
  await page.reload()
  await expect(oscillator(right)).toContainText('%D 50%')
})
