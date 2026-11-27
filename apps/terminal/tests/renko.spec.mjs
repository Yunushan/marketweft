import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('Renko uses fixed-size close-based bricks and keeps original source prices and pane settings', async ({ page, context }) => {
  const source = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-renko.csv', import.meta.url), 'utf8')
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect } = proto
    const isRenko = ctx => ctx.canvas.getAttribute('aria-label') === 'RENKO interactive Renko chart'
    window.renkoMarks = []
    proto.scale = function (...args) {
      if (isRenko(this)) window.renkoMarks = []
      return scale.apply(this, args)
    }
    proto.fillRect = function (x, y, width, height) {
      if (isRenko(this) && (this.fillStyle === '#68d7b1' || this.fillStyle === '#ec817e')) {
        window.renkoMarks.push({ x: x + width / 2, width, height, color: this.fillStyle })
      }
      return fillRect.apply(this, arguments)
    }
  })

  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const primaryType = page.getByLabel('Primary chart type')
  await primaryType.selectOption('heikin-ashi')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(9)

  await openImport(page, 'RENKO', source)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'RENKO')
  await primaryType.selectOption('renko')
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  const brickSize = pane.getByLabel('Brick size (price units)')
  const apply = pane.getByRole('button', { name: 'Apply brick size' })
  const canvas = pane.getByLabel('RENKO interactive Renko chart')
  await expect(canvas).toBeVisible()
  await brickSize.fill('0')
  await apply.click()
  await expect(pane.getByRole('alert')).toContainText('Brick size must be between')
  await brickSize.fill('999')
  await apply.click()
  await expect(pane.getByRole('status')).toContainText('No source close has moved far enough')
  await brickSize.fill('2')
  await apply.click()
  const readout = pane.getByRole('group', { name: 'Renko brick' })
  await expect(pane.getByTestId('viewport')).toHaveText('1–10 of 10')
  await expect(readout).toContainText('Brick 10')
  await expect(readout).toContainText('Open 102')
  await expect(readout).toContainText('Close 104')
  const marks = await page.evaluate(() => window.renkoMarks.slice(0, 10))
  expect(marks).toHaveLength(10)
  expect(marks.map(mark => mark.color)).toEqual([
    '#68d7b1', '#68d7b1', '#68d7b1', '#ec817e', '#ec817e',
    '#ec817e', '#ec817e', '#68d7b1', '#68d7b1', '#68d7b1',
  ])
  for (const [i, open, close] of [[0, 100, 102], [1, 102, 104], [2, 104, 106], [3, 104, 102]]) {
    await canvas.hover({ position: { x: marks[i].x, y: 50 } })
    await expect(readout).toContainText(i < 3 ? '2025-06-05' : '2025-06-09')
    await expect(readout).toContainText('Brick ' + (i + 1))
    await expect(readout).toContainText('Open ' + open)
    await expect(readout).toContainText('Close ' + close)
    await expect(readout).toContainText('Observed close ' + (i < 3 ? '106' : '102'))
  }

  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Range').selectOption('all')
  const waiting = page.waitForEvent('download')
  await pane.getByRole('button', { name: 'Download CSV' }).click()
  const exported = await waiting
  const csv = await readFile(await exported.path(), 'utf8')
  expect(csv).toContain(',100,120,80,101.9,25')
  expect(csv).toContain(',102,107,101,106,3')
  expect(csv).not.toContain(',100,102,100,102,0')

  await page.getByRole('button', { name: 'Compare charts' }).click()
  const otherType = page.getByLabel('Comparison chart type')
  await otherType.selectOption('line')
  await page.reload()
  await expect(primaryType).toHaveValue('renko')
  await expect(brickSize).toHaveValue('2')
  await expect(otherType).toHaveValue('line')
  const current = await downloadWorkspace(page)
  expect(current.version).toBe(10)
  expect(current.manifest.preferences.chartTypes).toEqual({ primary: 'renko', comparison: 'line' })
  expect(current.manifest.preferences.renkoTicks).toEqual({ primary: 2_000_000 })
  expect(current.manifest.series[0].csv).toBe(source)
  for (const [bundle, type] of [[legacy, 'heikin-ashi'], [current, 'renko']]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(primaryType).toHaveValue(type)
  }
  await expect(brickSize).toHaveValue('2')
  await expect(otherType).toHaveValue('line')
})
