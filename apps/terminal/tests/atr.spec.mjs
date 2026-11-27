import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Wilder ATR uses observed gaps on an independent scale and restores alongside an existing RSI setting', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-atr.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('ATR interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    window.studies = { atr: [], rsi: [] }
    proto.scale = function (...args) {
      if (isPrimary(this)) window.studies = { atr: [], rsi: [] }
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
      if (isPrimary(this) && this.strokeStyle === '#e6ab66') window.studies.atr = paths.get(this) ?? []
      if (isPrimary(this) && this.strokeStyle === '#8eb3fa') window.studies.rsi = paths.get(this) ?? []
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'ATR', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'ATR')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:ATR')
  await expect(instrument).toBeEnabled()

  const indicators = page.getByRole('button', { name: /Indicators/ })
  const configure = async (pane, kind, period) => {
    const form = page.getByRole('form', { name: pane + ' chart ' + kind })
    await form.getByLabel('Show ' + kind).check()
    await form.getByLabel(kind + ' period (bars)').fill(period)
    const action = form.getByRole('button', { name: 'Apply ' + kind })
    await action.click()
    await expect(action).toBeEnabled()
    await expect(form.getByLabel(kind + ' period (bars)')).toHaveValue(period)
  }
  await indicators.click()
  await configure('Primary', 'RSI', '2')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(16)
  expect(legacy.manifest.preferences.rsi).toEqual({ primary: { enabled: true, period: 2 } })

  await indicators.click()
  await configure('Primary', 'ATR', '3')
  await configure('Comparison', 'ATR', '1')
  await page.keyboard.press('Escape')
  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const atr = pane => pane.getByRole('group', { name: 'Average True Range' })
  const rsi = left.getByRole('group', { name: 'Relative Strength Index' })
  await expect(atr(left)).toHaveText('ATR 3 4')
  await expect(atr(right)).toHaveText('ATR 1 0.000001')
  await expect(rsi).toBeVisible()
  await expect.poll(() => page.evaluate(() => [window.studies.atr.length, window.studies.rsi.length])).toEqual([5, 5])
  const chart = await page.evaluate(() => window.studies)
  expect(Math.min(...chart.atr.map(point => point[1]))).toBeGreaterThan(Math.max(...chart.rsi.map(point => point[1])))
  expect(chart.atr[1][1]).toBeLessThan(chart.atr[2][1])
  const canvas = left.getByLabel(/^ATR interactive/)
  await canvas.hover({ position: { x: 14, y: 40 } })
  await expect(atr(left)).toHaveText('ATR 3 —')
  await expect(atr(right)).toHaveText('ATR 1 4')
  await canvas.hover({ position: { x: chart.atr[1][0], y: chart.atr[1][1] } })
  await expect(atr(left)).toHaveText('ATR 3 10')
  await expect(atr(right)).toHaveText('ATR 1 18')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const exported = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(exported[0]).toMatch(/,rsi_2,atr_3$/)
  expect(exported[2]).toMatch(/,,$/)
  expect(exported[4]).toMatch(/,10$/)
  expect(exported.at(-1)).toMatch(/,4$/)

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(17)
  expect(current.manifest.preferences.studies).toEqual({
    primary: { rsi: { enabled: true, period: 2 }, atr: { enabled: true, period: 3 } },
    comparison: { atr: { enabled: true, period: 1 } },
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(rsi).toBeVisible()
    if (backup === legacy) await expect(atr(left)).toHaveCount(0)
    else await expect(atr(left)).toHaveText('ATR 3 4')
  }
  await page.reload()
  await expect(atr(right)).toHaveText('ATR 1 0.000001')
})
