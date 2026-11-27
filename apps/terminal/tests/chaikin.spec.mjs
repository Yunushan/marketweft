import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Chaikin charts preserve signed scales, zero-volume gaps and exact independent CSV columns', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-cumulative-volume.csv', import.meta.url), 'utf8')
  const extended = csv.trimEnd() + '\n' + [
    '2026-01-01T09:10:00Z,0,1,0,0,0',
    '2026-01-01T09:11:00Z,0,1,0,0,0',
    '2026-01-01T09:12:00Z,0,1,0,1,2.5',
  ].join('\n')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('CHAIKIN interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.chaikinPlot = { flow: [], oscillator: [], zeroes: [] }
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
        const path = paths.get(this) ?? []
        if (this.strokeStyle === '#7ed2ca') window.chaikinPlot.flow = path
        if (this.strokeStyle === '#d39ce1') window.chaikinPlot.oscillator = path
        if (this.strokeStyle === '#3e4c6a' && path.length === 2) window.chaikinPlot.zeroes.push(path[0][2])
      }
      return stroke.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'CHAIKIN', extended)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'CHAIKIN')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:CHAIKIN')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  const form = (pane, name) => page.getByRole('form', { name: pane + ' chart ' + name })
  const apply = async (pane, name) => {
    await form(pane, name).getByLabel('Show ' + name).check()
    const button = form(pane, name).getByRole('button', { name: 'Apply ' + name })
    await button.click()
    await expect(button).toBeEnabled()
  }
  await menu.click()
  await apply('Comparison', 'On-Balance Volume')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(25)

  await menu.click()
  const flowForm = form('Primary', 'Chaikin Money Flow')
  const flowPeriod = flowForm.getByLabel('Chaikin Money Flow period (bars)')
  await expect(flowPeriod).toHaveValue('20')
  await flowPeriod.fill('2')
  await apply('Primary', 'Chaikin Money Flow')

  const oscillatorForm = form('Primary', 'Chaikin Oscillator')
  const fast = oscillatorForm.getByLabel('Chaikin fast period (bars)')
  const slow = oscillatorForm.getByLabel('Chaikin slow period (bars)')
  await expect(fast).toHaveValue('3')
  await expect(slow).toHaveValue('10')
  await slow.fill('3')
  await oscillatorForm.getByRole('button', { name: 'Apply Chaikin Oscillator' }).click()
  await expect(oscillatorForm.getByRole('alert')).toHaveText('The Chaikin Oscillator fast period must be shorter than the slow period.')
  await fast.fill('1')
  await slow.fill('2')
  await apply('Primary', 'Chaikin Oscillator')
  await form('Comparison', 'Chaikin Money Flow').getByLabel('Chaikin Money Flow period (bars)').fill('3')
  await apply('Comparison', 'Chaikin Money Flow')
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const flow = pane => pane.getByRole('group', { name: 'Chaikin Money Flow' })
  const oscillator = left.getByRole('group', { name: 'Chaikin Oscillator' })
  await expect(flow(left)).toHaveText('Chaikin Money Flow 2 100%')
  await expect(oscillator).toHaveText('Chaikin Oscillator 1/2 0.832717')
  await expect(flow(right)).toHaveText('Chaikin Money Flow 3 100%')

  await expect.poll(() => page.evaluate(() => [window.chaikinPlot?.flow.length, window.chaikinPlot?.oscillator.length])).toEqual([9, 10])
  const trace = await page.evaluate(() => window.chaikinPlot)
  expect(trace.zeroes).toHaveLength(2)
  expect(trace.flow[0][2]).toBeLessThan(trace.zeroes[0])
  expect(trace.flow[2][2]).toBeGreaterThan(trace.zeroes[0])
  expect(trace.flow.at(-1)[0]).toBe('moveTo')
  expect(trace.oscillator[0][2]).toBeLessThan(trace.zeroes[1])
  expect(trace.oscillator[2][2]).toBeGreaterThan(trace.zeroes[1])
  expect(trace.oscillator.at(-1)[0]).toBe('lineTo')

  const canvas = left.getByLabel(/^CHAIKIN interactive/)
  await canvas.hover({ position: { x: trace.oscillator[8][1], y: 40 } })
  await expect(flow(left)).toHaveText('Chaikin Money Flow 2 —')
  await expect(oscillator).toHaveText('Chaikin Oscillator 1/2 -0.001848')

  await left.getByText('Export CSV', { exact: true }).click()
  await left.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await left.getByRole('button', { name: 'Download CSV' }).click()
  const rows = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
  expect(rows.map(row => row.split(',').slice(-2))).toEqual([
    ['chaikin_money_flow_2', 'chaikin_oscillator_1_2'],
    ['', ''], ['20', '1.25'], ['27.272722', '0.083333'], ['-71.929814', '-1.347222'],
    ['-67.346939', '-0.449074'], ['0', '-0.149691'], ['-100', '-0.049897'],
    ['66.666667', '-0.016631'], ['100', '-0.005544'], ['', '-0.001848'], ['100', '0.832717'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(26)
  expect(current.manifest.preferences.studies.primary.chaikin_oscillator).toEqual({
    enabled: true, period: 1, chaikinSlowPeriod: 2,
  })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(right.getByRole('group', { name: 'On-Balance Volume' })).toBeVisible()
    if (backup === legacy) await expect(flow(left)).toHaveCount(0)
    else await expect(flow(right)).toHaveText('Chaikin Money Flow 3 100%')
  }
  await page.reload()
  await expect(oscillator).toHaveText('Chaikin Oscillator 1/2 0.832717')
})
