import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('close waterfall plots exact transitions, breaks at gaps and rewinds offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { fillRect, scale } = proto
    const isPrimary = ctx => ctx.canvas.getAttribute('aria-label')?.includes('WATERFALL interactive close waterfall') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (isPrimary(this)) window.waterfallBodies = []
      return scale.apply(this, args)
    }
    proto.fillRect = function (...args) {
      const beforeAxisTag = args[0] + args[2] < this.canvas.width / devicePixelRatio - 1
      if (isPrimary(this) && beforeAxisTag && this.globalAlpha === 1 &&
          ['#68d7b1', '#ec817e', '#93a19e'].includes(this.fillStyle))
        window.waterfallBodies.push([this.fillStyle, ...args])
      return fillRect.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const csv = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-close-waterfall.csv', import.meta.url), 'utf8')
  await openImport(page, 'WATERFALL', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted')
  await submitImport(page, 'WATERFALL')
  await page.getByRole('button', { name: 'Compare charts', exact: true }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:WATERFALL')
  const primary = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane', exact: true })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  const evidence = pane => pane.getByRole('group', { name: 'Close waterfall evidence', exact: true })
  const epoch = 1748872800
  async function cutoff(pane, seconds) {
    const form = pane.getByRole('form', { name: 'Close waterfall history cutoff', exact: true })
    await form.getByLabel('Known through (UTC)').fill(new Date((epoch + seconds) * 1000).toISOString().replace('.000Z', 'Z'))
    await form.getByRole('button', { name: 'Apply cutoff', exact: true }).click()
  }
  async function analysis(pane) {
    const contents = pane.getByLabel('Contents')
    if (!await contents.isVisible()) await pane.getByText('Export CSV', { exact: true }).click()
    await contents.selectOption('analysis')
    const pending = page.waitForEvent('download')
    await pane.getByRole('button', { name: 'Download CSV', exact: true }).click()
    return readFile(await (await pending).path(), 'utf8')
  }
  function transitions(csv) {
    const [header, ...rows] = csv.trimEnd().split(/\r?\n/).map(row => row.split(','))
    const columns = ['close_waterfall_known_through', 'previous_close_time', 'previous_close', 'close_change']
      .map(name => header.indexOf(name))
    expect(columns.every(column => column > 0)).toBe(true)
    return rows.map(row => columns.map(column => row[column]))
  }
  const earlier = await downloadWorkspace(page)
  await primaryType.selectOption('close-waterfall')
  await primary.getByLabel('Close-change interval (seconds)').fill('60')
  await primary.getByRole('button', { name: 'Apply interval', exact: true }).click()
  await cutoff(primary, -1)
  await expect(primary.getByText('No observed closes through this cutoff.')).toBeVisible()
  await cutoff(primary, 120)
  await expect(evidence(primary)).toContainText('Observed close 4')
  await expect(evidence(primary)).toContainText('Close change 3')
  await cutoff(primary, 180)
  await expect(evidence(primary)).toContainText('Close change 0')
  const savedCutoff = await analysis(primary)
  await cutoff(primary, 300)
  await expect(evidence(primary)).toContainText('Close change Missing')
  await cutoff(primary, 360)
  await expect(evidence(primary)).toContainText('Close change -1')
  const bodies = await page.evaluate(() => window.waterfallBodies)
  expect(bodies.map(body => body[0])).toEqual(['#68d7b1', '#68d7b1', '#93a19e', '#ec817e'])
  const [firstRise, secondRise, flat, drop] = bodies
  expect(secondRise[2] + secondRise[4]).toBeCloseTo(firstRise[2])
  expect(flat[2]).toBeCloseTo(secondRise[2] - 0.5)
  expect(drop[1] - flat[1]).toBeCloseTo(2 * (flat[1] - secondRise[1]))
  expect(drop[4] * 3).toBeCloseTo(firstRise[4])
  expect(transitions(await analysis(primary))).toEqual([
    [String(epoch + 360), '', '', ''],
    [String(epoch + 360), String(epoch), '-2', '3'],
    [String(epoch + 360), String(epoch + 60), '1', '3'],
    [String(epoch + 360), String(epoch + 120), '4', '0'],
    [String(epoch + 360), '', '', ''],
    [String(epoch + 360), String(epoch + 300), '-3', '-1'],
  ])
  await cutoff(primary, 180)
  expect(await analysis(primary)).toBe(savedCutoff)

  await comparisonType.selectOption('close-waterfall')
  await comparison.getByText('Timeframe', { exact: true }).click()
  await comparison.getByLabel('Source interval (seconds)').fill('60')
  await comparison.getByLabel('Target interval (seconds)').fill('120')
  await comparison.getByRole('button', { name: 'Apply timeframe', exact: true }).click()
  await cutoff(comparison, 239)
  await expect(evidence(comparison)).toContainText('Close change Missing')
  await cutoff(comparison, 240)
  await expect(evidence(comparison)).toContainText('Close change 3')
  await cutoff(comparison, 480)
  await expect(evidence(comparison)).toContainText('Close change Missing')
  await cutoff(comparison, 600)
  await expect(evidence(comparison)).toContainText('Close change 2')
  const rolled = transitions(await analysis(comparison))
  expect(rolled.map(row => row.at(-1))).toEqual(['', '3', '', '', '2'])
  expect(await analysis(primary)).toBe(savedCutoff)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(94)
  expect(saved.manifest.preferences.chartTypes).toEqual({ primary: 'close-waterfall', comparison: 'close-waterfall' })
  expect(saved.manifest.preferences.closeChangeSeconds.primary).toBe(60)
  for (const backup of [earlier, saved]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible()
    await expect(primaryType).toHaveValue(backup === earlier ? 'candles' : 'close-waterfall')
  }
  await page.reload()
  await expect(primaryType).toHaveValue('close-waterfall')
  await expect(comparisonType).toHaveValue('close-waterfall')
})
