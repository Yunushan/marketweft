import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('EquiVolume uses adjacent high-low boxes, volume-width picking and offline workspace restore', async ({ page, context }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const { fillRect, scale } = canvas
    const pane = ctx => ctx.canvas.getAttribute('aria-label')?.endsWith('interactive EquiVolume chart') &&
      ctx.canvas.closest('[aria-label$="chart pane"]')?.getAttribute('aria-label')
    window.equiVolumeBoxes = {}
    canvas.scale = function (...args) {
      const name = pane(this)
      if (name) window.equiVolumeBoxes[name] = []
      return scale.apply(this, args)
    }
    canvas.fillRect = function (x, y, width, height) {
      const name = pane(this)
      if (name && this.lineWidth === 1 && this.globalAlpha === 1 &&
          ['#93a19e', '#68d7b1', '#ec817e'].includes(this.fillStyle)) {
        window.equiVolumeBoxes[name].push({ color: this.fillStyle, x, y, width, height })
      }
      return fillRect.call(this, x, y, width, height)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const start = Date.parse('2025-06-03T14:00:00Z') / 1000
  const source = [[4, 11, 2, 5, 1], [5, 15, 3, 10, 6], [10, 13, 0, 12, 0], [12, 13, -2, 7, 3]]
  const csv = rows => [header, ...rows.map((values, index) => [start + index * 60, ...values].join(','))].join('\n')
  await openImport(page, 'EQUIZERO', csv(source.map(([open, high, low, close]) => [open, high, low, close, 0])))
  await submitImport(page, 'EQUIZERO')
  await openImport(page, 'EQUISHAPE', csv(source))
  await submitImport(page, 'EQUISHAPE')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const selected = page.getByLabel('Comparison instrument')
  await selected.selectOption('LOCAL:EQUISHAPE')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  const primaryCanvas = primary.locator('canvas[aria-label$="interactive EquiVolume chart"]')
  await page.getByRole('button', { name: /Indicators/ }).click()
  const ray = page.getByRole('form', { name: 'Primary chart Elder-Ray Index' })
  await ray.getByLabel('Show Elder-Ray Index').check()
  const save = ray.getByRole('button', { name: 'Apply Elder-Ray Index' })
  await save.click()
  await expect(save).toBeEnabled()
  await page.keyboard.press('Escape')
  const prior = await downloadWorkspace(page)
  expect(prior.version).toBe(63)

  await primaryType.selectOption('equivolume')
  const trace = name => page.evaluate(pane => window.equiVolumeBoxes[pane], name)
  await expect.poll(async () => (await trace('Primary chart pane'))?.length).toBe(3)
  const [first, second, last] = await trace('Primary chart pane')
  expect([first.color, second.color, last.color]).toEqual(['#93a19e', '#68d7b1', '#ec817e'])
  expect(second.x).toBeCloseTo(first.x + first.width)
  expect(last.x).toBeCloseTo(second.x + second.width)
  expect(second.width / first.width).toBeCloseTo(6)
  expect(last.width / first.width).toBeCloseTo(3)
  expect(second.height / first.height).toBeCloseTo(12 / 9)
  expect(last.height / first.height).toBeCloseTo(15 / 9)
  await primaryCanvas.hover({ position: { x: second.x + first.width / 2, y: 65 } })
  await expect(primary.getByRole('region', { name: 'EquiVolume chart' })).toHaveAttribute('data-crosshair-time', String(start + 60))
  await expect(comparison.getByRole('region', { name: 'Price and volume chart' })).toHaveAttribute('data-crosshair-time', String(start + 60))
  await expect(primary.getByRole('group', { name: /EQUISHAPE OHLCV.*close 10.00, volume 6/ })).toBeVisible()

  await comparisonType.selectOption('equivolume')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect.poll(async () => (await trace('Comparison chart pane'))?.length).toBe(2)
  const [rolledFirst, rolledLast] = await trace('Comparison chart pane')
  expect(rolledFirst.width / rolledLast.width).toBeCloseTo(7 / 3)

  await selected.selectOption('LOCAL:EQUIZERO')
  await expect.poll(async () => (await trace('Comparison chart pane'))?.length).toBe(4)
  const zero = await trace('Comparison chart pane')
  for (const box of zero) expect(box.width).toBeCloseTo(zero[0].width)
  await comparisonType.selectOption('ohlc')
  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(64)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'equivolume', comparison: 'ohlc' })
  expect(saved.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(backup === prior ? 'candles' : 'equivolume')
    await expect(primary.getByRole('group', { name: 'Elder-Ray Index' })).toBeVisible()
  }
  await page.reload()
  await expect(primaryType).toHaveValue('equivolume')
  await expect(comparisonType).toHaveValue('ohlc')
  await expect.poll(async () => (await trace('Primary chart pane'))?.length).toBe(3)

  const dense = Array.from({ length: 1440 }, (_, index) => [3, index === 17 ? 18 : 5, 1, 3, 1])
  await openImport(page, 'EQUIDENSE', csv(dense))
  await submitImport(page, 'EQUIDENSE')
  await primary.getByRole('button', { name: 'All', exact: true }).click()
  await expect(primary.getByTestId('viewport')).toHaveText('1–1440 of 1440')
  const reduced = await trace('Primary chart pane')
  expect(reduced.length).toBeGreaterThan(60)
  expect(reduced.length).toBeLessThan(1440)
  const heights = reduced.map(box => box.height)
  expect(Math.max(...heights) / Math.min(...heights)).toBeCloseTo(17 / 4)
})
