import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const OBV = 'On-Balance Volume'
const ADL = 'Accumulation/Distribution Line'

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

async function show(page, pane, name) {
  const form = page.getByRole('form', { name: pane + ' chart ' + name })
  await form.getByLabel('Show ' + name).check()
  const button = form.getByRole('button', { name: 'Apply ' + name })
  await button.click()
  await expect(button).toBeEnabled()
}

async function analysisCsv(page, pane) {
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const pending = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  return (await readFile(await (await pending).path(), 'utf8')).trimEnd().split(/\r?\n/)
}

test('OBV and A/D render separate signed volume panels and preserve their exact offline history', async ({ page, context }) => {
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-cumulative-volume.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('CUMULATIVE interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    const paths = new WeakMap()
    proto.scale = function (...args) {
      if (isPrimary(this)) window.volumeStudies = { obv: [], adl: [] }
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
        if (this.strokeStyle === '#79c9b2') window.volumeStudies.obv = paths.get(this) ?? []
        if (this.strokeStyle === '#e4ac7f') window.volumeStudies.adl = paths.get(this) ?? []
      }
      return stroke.apply(this, arguments)
    }
  })
  await importOffline(page, context, 'CUMULATIVE', csv)
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const instrument = page.getByLabel('Comparison instrument')
  await instrument.selectOption('LOCAL:CUMULATIVE')
  await expect(instrument).toBeEnabled()

  const menu = page.getByRole('button', { name: /Indicators/ })
  await menu.click()
  await show(page, 'Comparison', 'MACD')
  await page.keyboard.press('Escape')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(24)

  await menu.click()
  const obvForm = page.getByRole('form', { name: 'Primary chart ' + OBV })
  const adlForm = page.getByRole('form', { name: 'Primary chart ' + ADL })
  for (const form of [obvForm, adlForm]) await expect(form.getByRole('textbox')).toHaveCount(0)
  await show(page, 'Primary', OBV)
  await show(page, 'Primary', ADL)
  await show(page, 'Comparison', OBV)
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  const study = (pane, name) => pane.getByRole('group', { name, exact: true })
  await expect(study(left, OBV)).toHaveText(OBV + ' 0.375004')
  await expect(study(left, ADL)).toHaveText(ADL + ' -2.624996')
  await expect(study(right, OBV)).toHaveText(OBV + ' 0.375004')
  await expect(study(right, ADL)).toHaveCount(0)

  await expect.poll(() => page.evaluate(() => [window.volumeStudies?.obv.length, window.volumeStudies?.adl.length])).toEqual([8, 8])
  const trace = await page.evaluate(() => window.volumeStudies)
  expect(Math.max(...trace.obv.map(([, y]) => y))).toBeLessThan(Math.min(...trace.adl.map(([, y]) => y)))
  expect(trace.obv[1][1]).toBeCloseTo(trace.obv[2][1])
  expect(trace.adl[2][1]).toBeGreaterThan(trace.adl[1][1])
  expect(trace.adl[4][1]).toBeCloseTo(trace.adl[3][1])

  const canvas = left.getByLabel(/^CUMULATIVE interactive/)
  await canvas.hover({ position: { x: trace.obv[3][0], y: 40 } })
  await expect(study(left, OBV)).toHaveText(OBV + ' -1.625')
  await expect(study(left, ADL)).toHaveText(ADL + ' -2.625')
  const rows = await analysisCsv(page, left)
  expect(rows.map(row => row.split(',').slice(-2))).toEqual([
    ['obv', 'adl'], ['0', '0'], ['2.5', '2.5'], ['2.5', '1.5'], ['-1.625', '-2.625'],
    ['0.375', '-2.625'], ['0.375', '-2.625'], ['0.374999', '-2.625001'], ['0.375004', '-2.624996'],
  ])

  const current = await downloadWorkspace(page)
  expect(current.version).toBe(25)
  expect(current.manifest.preferences.studies.primary).toEqual({ obv: { enabled: true }, adl: { enabled: true } })
  expect(current.manifest.preferences.studies.comparison.obv).toEqual({ enabled: true })
  for (const backup of [legacy, current]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(study(right, 'Moving Average Convergence Divergence')).toBeVisible()
    if (backup === legacy) await expect(study(left, OBV)).toHaveCount(0)
    else await expect(study(left, ADL)).toHaveText(ADL + ' -2.624996')
  }
  await page.reload()
  await expect(study(right, OBV)).toHaveText(OBV + ' 0.375004')
})

test('wide cumulative volume keeps its last millionth in both readouts and CSV', async ({ page, context }) => {
  const rows = ['time,open,high,low,close,volume']
  for (let i = 0; i <= 4_620; i++) {
    const close = ((i + 1) / 1e6).toFixed(6)
    rows.push([1_760_000_000 + i * 60, 0, close, 0, close, i === 4_620 ? '0.000001' : '2000000000'].join(','))
  }
  await importOffline(page, context, 'WIDEVOL', rows.join('\n'))
  await page.getByRole('button', { name: /Indicators/ }).click()
  await show(page, 'Primary', OBV)
  await show(page, 'Primary', ADL)
  await page.keyboard.press('Escape')

  const left = page.getByRole('region', { name: 'Primary chart pane' })
  await expect(left.getByRole('group', { name: OBV })).toHaveText(OBV + ' 9238000000000.000001')
  await expect(left.getByRole('group', { name: ADL })).toHaveText(ADL + ' 9240000000000.000001')
  const exported = await analysisCsv(page, left)
  expect(exported.at(-1).split(',').slice(-2)).toEqual(['9238000000000.000001', '9240000000000.000001'])
})
