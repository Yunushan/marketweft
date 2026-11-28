import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('four signed price overlays have exact readouts and restore per-pane settings offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const colors = { '#79a9ed': 'wma', '#9bd5b1': 'dema', '#efac94': 'tema', '#c0abf3': 'hma' }
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('AVERAGES interactive') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    proto.scale = function (...args) {
      const name = pane(this)
      if (name) (window.averageDraws ??= {})[name] = {}
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (pane(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      const name = pane(this)
      const kind = colors[this.strokeStyle]
      if (name && kind) window.averageDraws[name][kind] = paths.get(this)
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2026-01-01T09:00:00Z') / 1000
  const csv = [header, ...[-5, -2, 4, 9, 3, -6, 0, 7, 11].map((tick, index) => {
    const close = (tick / 1e6).toFixed(6)
    return [start + (index + Number(index >= 4)) * 60, close, close, close, close, 1].join(',')
  })].join('\n')
  await openImport(page, 'AVERAGES', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'AVERAGES')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:AVERAGES')
  const menu = page.getByRole('button', { name: /Indicators/ })
  async function apply(pane, name, period) {
    const settings = page.getByRole('form', { name: pane + ' chart ' + name, exact: true })
    await settings.getByLabel('Show ' + name).check()
    await settings.getByLabel(name + ' period (bars)').fill(String(period))
    const save = settings.getByRole('button', { name: 'Apply ' + name })
    await save.click()
    await expect(save).toBeEnabled()
  }
  await menu.click()
  await apply('Comparison', 'CMO', 2)
  await page.keyboard.press('Escape')
  const previous = await downloadWorkspace(page)
  expect(previous.version).toBe(55)
  await menu.click()
  await apply('Primary', 'WMA', 3)
  await apply('Primary', 'DEMA', 2)
  await apply('Comparison', 'TEMA', 2)
  await apply('Comparison', 'HMA', 4)
  await page.keyboard.press('Escape')

  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const wma = primary.getByRole('group', { name: 'Weighted Moving Average', exact: true })
  const dema = primary.getByRole('group', { name: 'Double Exponential Moving Average' })
  const tema = comparison.getByRole('group', { name: 'Triple Exponential Moving Average' })
  const hma = comparison.getByRole('group', { name: 'Hull Moving Average' })
  await expect(wma).toHaveText('WMA 3 0.000008')
  await expect(dema).toHaveText('DEMA 2 0.000011')
  await expect(tema).toHaveText('TEMA 2 0.000011')
  await expect(hma).toHaveText('HMA 4 0.000012')
  const counts = [['Primary chart pane', 'wma', 7], ['Primary chart pane', 'dema', 7],
    ['Comparison chart pane', 'tema', 6], ['Comparison chart pane', 'hma', 5]]
  await expect.poll(() => page.evaluate(keys => keys.map(([pane, kind]) =>
    window.averageDraws?.[pane]?.[kind]?.length), counts)).toEqual(counts.map(item => item[2]))

  for (const [pane, values] of [
    [primary, { wma_3: ['', '', 1, 6, 5, -1, -2, 3, 8], dema_2: ['', '', 4, 9, 4, -5, -1, 6, 11] }],
    [comparison, { tema_2: ['', '', '', 10, 3, -6, -1, 7, 11], hma_4: ['', '', '', '', 7, -3, -5, 4, 12] }],
  ]) {
    await pane.getByText('Export CSV', { exact: true }).click()
    await pane.getByLabel('Contents').selectOption('analysis')
    const pending = page.waitForEvent('download')
    await pane.getByRole('button', { name: 'Download CSV' }).click()
    const [fields, ...rows] = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
    for (const [column, expected] of Object.entries(values)) {
      const index = fields.split(',').indexOf(column)
      expect(index).toBeGreaterThan(0)
      expect(rows.map(row => row.split(',')[index])).toEqual(expected.map(tick => tick === '' ? '' : String(tick / 1e6)))
    }
  }
  const latest = await downloadWorkspace(page)
  expect(latest.version).toBe(56)
  expect(latest.manifest.series).toEqual(previous.manifest.series)
  expect(latest.manifest.preferences.studies.primary).toEqual({
    wma: { enabled: true, period: 3 }, dema: { enabled: true, period: 2 },
  })
  expect(latest.manifest.preferences.studies.comparison).toEqual({
    cmo: { enabled: true, period: 2 }, tema: { enabled: true, period: 2 }, hma: { enabled: true, period: 4 },
  })
  for (const backup of [previous, latest]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(comparison.getByRole('group', { name: 'Chande Momentum Oscillator' })).toBeVisible()
    await expect(wma).toHaveCount(backup === previous ? 0 : 1)
    await expect(hma).toHaveCount(backup === previous ? 0 : 1)
  }
  await page.reload()
  await expect(wma).toHaveText('WMA 3 0.000008')
  await expect(hma).toHaveText('HMA 4 0.000012')
})
