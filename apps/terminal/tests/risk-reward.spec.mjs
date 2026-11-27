import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('risk/reward draws both directions from exact signed levels and restores independent panes', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, fillRect } = proto
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('PLAN interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.planBoxes = []
      return scale.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (primary(this) && ['rgba(104, 215, 177, 0.19)', 'rgba(236, 129, 126, 0.19)'].includes(this.fillStyle))
        window.planBoxes.push([this.fillStyle, ...args])
      return fillRect.apply(this, args)
    }
  })
  await page.goto('/')
  const from = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = minutes => new Date((from + minutes * 60) * 1000).toISOString().replace('.000Z', 'Z')
  const data = [header, ...Array.from({ length: 12 }, (_, index) =>
    [from + index * 60, index / 10, 10, -10, -index / 10, 1].join(','))].join('\n')
  await openImport(page, 'PLAN', data)
  await submitImport(page, 'PLAN')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:PLAN')
  await page.getByLabel('Comparison chart type').selectOption('area')
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const drawings = primary.getByRole('region', { name: 'Chart drawings' })
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(38)

  async function newPlan(direction, entryTime, endTime, entry, stop, target) {
    await drawings.getByRole('button', { name: 'New risk/reward' }).click()
    const form = drawings.getByRole('form', { name: 'Risk/reward' })
    await form.getByLabel('Direction').selectOption(direction)
    await form.getByRole('group', { name: 'Entry' }).getByLabel('Time (UTC)').fill(iso(entryTime))
    await form.getByRole('group', { name: 'Target' }).getByLabel('Time (UTC)').fill(iso(endTime))
    await form.getByRole('group', { name: 'Entry' }).getByLabel('Price').fill(entry)
    await form.getByRole('group', { name: 'Stop' }).getByLabel('Price').fill(stop)
    await form.getByRole('group', { name: 'Target' }).getByLabel('Price').fill(target)
    return form
  }

  const long = await newPlan('long', 1, 1, '-2.000001', '-1.000001', '0.999999')
  const save = form => form.getByRole('button', { name: 'Save risk/reward' }).click()
  await save(long)
  await expect(long.getByRole('alert')).toHaveText('The target time must be later than the entry time.')
  await long.getByRole('group', { name: 'Target' }).getByLabel('Time (UTC)').fill(iso(7))
  await save(long)
  await expect(long.getByRole('alert')).toContainText('stop below entry')
  await long.getByRole('group', { name: 'Stop' }).getByLabel('Price').fill('-3.000001')
  await save(long)
  const first = drawings.getByRole('group', { name: 'Risk/reward values' }).first()
  await expect(first.getByText('Risk 1', { exact: true })).toBeVisible()
  await expect(first.getByText('Reward 3', { exact: true })).toBeVisible()
  await expect(first.getByText('Reward per unit of risk 3', { exact: true })).toBeVisible()

  const short = await newPlan('short', 3, 9, '-2', '-1.5', '-1')
  await save(short)
  await expect(short.getByRole('alert')).toContainText('target below entry')
  await short.getByRole('group', { name: 'Target' }).getByLabel('Price').fill('-3.25')
  await save(short)
  const second = drawings.getByRole('group', { name: 'Risk/reward values' }).nth(1)
  await expect(second.getByText('Risk 0.5', { exact: true })).toBeVisible()
  await expect(second.getByText('Reward per unit of risk 2.5', { exact: true })).toBeVisible()
  await expect(comparison.getByRole('group', { name: 'Risk/reward values' })).toHaveCount(2)

  const boxes = await page.evaluate(() => window.planBoxes)
  expect(boxes).toHaveLength(4)
  const [longReward, longRisk, shortReward, shortRisk] = boxes
  expect(longReward[2] + longReward[4]).toBeCloseTo(longRisk[2])
  expect(longReward[4] / longRisk[4]).toBeCloseTo(3)
  expect(shortRisk[2] + shortRisk[4]).toBeCloseTo(shortReward[2])
  expect(shortReward[4] / shortRisk[4]).toBeCloseTo(2.5)
  expect(longReward[3]).toBeCloseTo(longRisk[3])
  expect(shortReward[3]).toBeCloseTo(shortRisk[3])

  const otherRange = await comparison.getByTestId('viewport').textContent()
  await primary.getByRole('button', { name: 'Zoom in' }).click()
  await primary.getByRole('button', { name: 'Earlier bars' }).click()
  await expect(comparison.getByTestId('viewport')).toHaveText(otherRange)
  expect((await page.evaluate(() => window.planBoxes)).length).toBe(4)

  const saved = await downloadWorkspace(page)
  expect(saved.version).toBe(48)
  const [longRecord, shortRecord] = saved.manifest.preferences.annotations['LOCAL:PLAN']
  expect(longRecord).toMatchObject({ kind: 'risk-reward', side: 'long', stopTicks: -3000001,
    start: { time: from + 60, ticks: -2000001 }, end: { time: from + 420, ticks: 999999 } })
  expect(shortRecord).toMatchObject({ kind: 'risk-reward', side: 'short', stopTicks: -1500000,
    start: { time: from + 180, ticks: -2000000 }, end: { time: from + 540, ticks: -3250000 } })
  expect(saved.manifest.series).toEqual(legacy.manifest.series)

  async function restore(bundle) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
  }
  await restore(legacy)
  await expect(drawings.getByRole('group', { name: 'Risk/reward values' })).toHaveCount(0)
  await restore(saved)
  await page.reload()
  await expect(drawings.getByRole('group', { name: 'Risk/reward values' })).toHaveCount(2)
  await drawings.getByRole('button', { name: /Edit Risk\/reward short/ }).click()
  const editing = drawings.getByRole('form', { name: 'Risk/reward' })
  await expect(editing.getByLabel('Direction')).toHaveValue('short')
  await expect(editing.getByRole('group', { name: 'Stop' }).getByLabel('Price')).toHaveValue('-1.5')
  await editing.getByRole('group', { name: 'Target' }).getByLabel('Price').fill('-4')
  await save(editing)
  await expect(second.getByText('Reward per unit of risk 4', { exact: true })).toBeVisible()
})
