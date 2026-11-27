import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('a regression drawing fits exact observed closes and withholds the fit before its last anchor', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('FIT interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.fittedPaths = []
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [method, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[method] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (primary(this) && ['#decb86', '#a18e60'].includes(this.strokeStyle)) window.fittedPaths.push(paths.get(this))
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((from + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const data = [[0, 90], [60, 1], [180, 3], [240, 2], [480, 6], [600, -30]]
  await openImport(page, 'FIT', [header, ...data.map(([offset, close]) =>
    [from + offset, close, close, close, close, 1].join(','))].join('\n'))
  await submitImport(page, 'FIT')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const plots = pane.getByRole('group', { name: 'Regression channel values' })
  const drawing = pane.getByRole('region', { name: 'Chart drawings' })
  const legacy = await downloadWorkspace(page)
  await drawing.getByRole('button', { name: 'New regression channel' }).click()
  const form = drawing.getByRole('form', { name: 'Regression channel' })
  await form.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)').fill(iso(61))
  await form.getByRole('group', { name: 'End' }).getByLabel('Time (UTC)').fill(iso(480))
  const save = form.getByRole('button', { name: 'Save regression channel' })
  await save.click()
  await expect(form.getByRole('alert')).toHaveText('Choose two exact UTC times from observed source bars.')
  await form.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)').fill(iso(60))
  await save.click()
  await expect(plots.getByText('Fitted start 0.9')).toBeVisible()
  await expect(plots.getByText('Fitted end 5.1')).toBeVisible()
  await expect(plots.getByText('Maximum residual 1.7')).toBeVisible()
  await expect(plots.getByText('Observations 4')).toBeVisible()
  const [center, low, high] = await page.evaluate(() => window.fittedPaths)
  for (const line of [center, low, high]) expect(line).toHaveLength(4)
  for (let index = 0; index < center.length; index++) {
    expect(high[index][1]).toBeLessThan(center[index][1])
    expect(low[index][1]).toBeGreaterThan(center[index][1])
    expect(center[index][1]).toBeCloseTo((low[index][1] + high[index][1]) / 2)
    expect(low[index][0]).toBe(center[index][0])
    expect(high[index][0]).toBe(center[index][0])
  }

  await page.getByLabel('Primary chart type').selectOption('confirmed-swings')
  await pane.getByLabel('Known through (UTC)').fill(iso(479))
  await pane.getByRole('button', { name: 'Apply cutoff' }).click()
  await expect(plots).toHaveText('Waiting for both source anchors')
  await pane.getByLabel('Known through (UTC)').fill(iso(480))
  await pane.getByRole('button', { name: 'Apply cutoff' }).click()
  await expect(plots.getByText('Fitted end 5.1')).toBeVisible()
  await page.getByLabel('Primary chart type').selectOption('candles')

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(49)
  expect(saved.manifest.preferences.annotations['LOCAL:FIT'][0]).toMatchObject({
    kind: 'regression-channel', lower: from + 60, upper: from + 480,
  })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)
  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(plots).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await expect(plots.getByText('Observations 4')).toBeVisible()
})

test('a flat source window keeps its exact fit and observation count after rollup', async ({ page }) => {
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  await openImport(page, 'FLATFIT', [header, ...[0, 60, 120, 180].map(offset =>
    [from + offset, -2, -2, -2, -2, 1].join(','))].join('\n'))
  await submitImport(page, 'FLATFIT')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByRole('button', { name: 'New regression channel' }).click()
  const form = pane.getByRole('form', { name: 'Regression channel' })
  await form.getByRole('group', { name: 'Start' }).getByLabel('Time (UTC)').fill('2025-06-03T14:00:00Z')
  await form.getByRole('group', { name: 'End' }).getByLabel('Time (UTC)').fill('2025-06-03T14:03:00Z')
  await form.getByRole('button', { name: 'Save regression channel' }).click()
  const readout = pane.getByRole('group', { name: 'Regression channel values' })
  await expect(readout.getByText('Maximum residual 0')).toBeVisible()
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('60')
  await pane.getByLabel('Target interval (seconds)').fill('120')
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–2 of 2')
  await expect(readout.getByText('Fitted start -2')).toBeVisible()
  await expect(readout.getByText('Fitted end -2')).toBeVisible()
  await expect(readout.getByText('Maximum residual 0')).toBeVisible()
  await expect(readout.getByText('Observations 4')).toBeVisible()
})
