import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Heikin-Ashi plots the fixed-point bars and keeps observed exports and mixed pane choices', async ({ page, context }) => {
  const source = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-heikin-ashi.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { moveTo, lineTo, stroke, fillRect } = proto
    const paths = new WeakMap()
    const isChart = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('ASHI interactive Heikin-Ashi')
    window.ashiMarks = { wick: null, body: null }
    proto.moveTo = function (x, y) {
      paths.set(this, [[x, y]])
      return moveTo.call(this, x, y)
    }
    proto.lineTo = function (x, y) {
      paths.get(this)?.push([x, y])
      return lineTo.call(this, x, y)
    }
    proto.stroke = function () {
      const path = paths.get(this)
      if (isChart(this) && this.strokeStyle === '#ec817e' && path?.length === 2 &&
          path[0][0] === path[1][0]) window.ashiMarks.wick = path
      return stroke.apply(this, arguments)
    }
    proto.fillRect = function (...rect) {
      const wick = window.ashiMarks.wick
      if (isChart(this) && this.fillStyle === '#ec817e' && this.globalAlpha === 1 &&
          wick && Math.abs(rect[0] + rect[2] / 2 - wick[0][0]) < 1e-8) {
        window.ashiMarks.body = rect
      }
      return fillRect.apply(this, rect)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('heikin-ashi')
  await expect(page.getByLabel(/interactive Heikin-Ashi and volume chart$/)).toBeVisible()
  await primaryType.selectOption('ohlc')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(6)

  await openImport(page, 'ASHI', source)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'ASHI')
  await primaryType.selectOption('heikin-ashi')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const canvas = pane.getByLabel(/^ASHI interactive Heikin-Ashi/)
  await expect(canvas).toBeVisible()
  const prices = pane.getByRole('group', { name: 'Heikin-Ashi prices' })
  await expect(prices).toContainText('Observed close 8.00')
  await expect(prices).toContainText('C 10.00')
  await expect(prices).toContainText('O 17.00')
  await expect.poll(() => page.evaluate(() => Boolean(window.ashiMarks.wick && window.ashiMarks.body))).toBe(true)
  const { wick, body } = await page.evaluate(() => window.ashiMarks)
  expect(body[0] + body[2] / 2).toBeCloseTo(wick[0][0], 9)
  expect(body[1]).toBeCloseTo(wick[0][1], 9)
  expect(body[3] / (wick[1][1] - wick[0][1])).toBeCloseTo(0.7, 9)

  const bounds = await canvas.boundingBox()
  await canvas.hover({ position: { x: Math.floor((bounds.width - 65) / 2), y: 50 } })
  await expect(prices).toContainText('2025-06-03')
  await expect(prices).toContainText('Observed close 24.00')
  await expect(prices).toContainText('C 22.00')

  await pane.getByText('Export CSV', { exact: true }).click()
  const waiting = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  const exported = await waiting
  const csv = await readFile(await exported.path(), 'utf8')
  expect(csv).toContain(',20,26,18,24,0.125')
  expect(csv).not.toContain(',12,26,12,22,0.125')

  await page.getByRole('button', { name: 'Compare charts' }).click()
  const otherType = page.getByLabel('Comparison chart type')
  await otherType.selectOption('line')
  await page.reload()
  await expect(primaryType).toHaveValue('heikin-ashi')
  await expect(otherType).toHaveValue('line')
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(9)
  expect(backup.manifest.preferences.chartTypes).toEqual({ primary: 'heikin-ashi', comparison: 'line' })
  expect(backup.manifest.series[0].csv).toBe(source)
  for (const [bundle, type] of [[legacy, 'ohlc'], [backup, 'heikin-ashi']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await expect(otherType).toHaveValue('line')
})
