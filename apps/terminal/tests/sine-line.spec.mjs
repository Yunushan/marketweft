import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

test('offline sine lines project one exact cycle from editable UTC and price anchors', async ({ page, context }) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const { scale, beginPath, moveTo, lineTo, stroke } = proto
    const paths = new WeakMap()
    const primary = ctx => ctx.canvas.getAttribute('aria-label')?.startsWith('SINE interactive') &&
      ctx.canvas.closest('[aria-label="Primary chart pane"]')
    proto.scale = function (...args) {
      if (primary(this)) window.sinePath = []
      return scale.apply(this, args)
    }
    proto.beginPath = function () {
      if (primary(this)) paths.set(this, [])
      return beginPath.call(this)
    }
    for (const [name, original] of [['moveTo', moveTo], ['lineTo', lineTo]]) {
      proto[name] = function (x, y) {
        paths.get(this)?.push([x, y])
        return original.call(this, x, y)
      }
    }
    proto.stroke = function (...args) {
      if (primary(this) && this.strokeStyle === '#da9eb9') window.sinePath = paths.get(this)
      return stroke.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)

  const origin = Date.parse('2025-06-03T14:00:00Z') / 1000
  const iso = seconds => new Date((origin + seconds) * 1000).toISOString().replace('.000Z', 'Z')
  const offsets = [0, 60, 120, 180, 240, 420]
  const csv = [header, ...offsets.map(offset => [origin + offset, 5, 8, 2, 6, 10].join(','))].join('\n')
  await openImport(page, 'SINE', csv)
  await submitImport(page, 'SINE')
  const pane = page.getByRole('region', { name: 'Primary chart pane', exact: true })
  const drawings = pane.getByRole('region', { name: 'Chart drawings', exact: true })
  const prior = await downloadWorkspace(page)
  await drawings.getByRole('button', { name: 'New sine line', exact: true }).click()
  const form = drawings.getByRole('form', { name: 'Sine line', exact: true })
  const midline = form.getByRole('group', { name: 'Midline', exact: true })
  const extremum = form.getByRole('group', { name: 'First extremum', exact: true })
  const save = () => form.getByRole('button', { name: 'Save sine line', exact: true }).click()
  await midline.getByLabel('Time (UTC)').fill(iso(0))
  await extremum.getByLabel('Time (UTC)').fill(iso(60))
  await midline.getByLabel('Price', { exact: true }).fill('5')
  await extremum.getByLabel('Price', { exact: true }).fill('5')
  await save()
  await expect(form.getByRole('alert')).toHaveText('A sine line needs a later extremum and two different prices.')
  await midline.getByLabel('Price', { exact: true }).fill('2000000000')
  await extremum.getByLabel('Price', { exact: true }).fill('0')
  await save()
  await expect(form.getByRole('alert')).toHaveText('The full cycle must stay within the chart time and price bounds.')
  await midline.getByLabel('Price', { exact: true }).fill('5')
  await extremum.getByLabel('Price', { exact: true }).fill('3')
  await save()

  const details = drawings.getByText('Sine cycle', { exact: true })
  const values = drawings.locator('dl[aria-label="Sine line cycle values"]')
  const readout = () => values.locator('dd')
  await details.click()
  await expect(readout()).toHaveText(['5', '-2', '240 seconds', '7', iso(240)])
  const path = () => page.evaluate(() => window.sinePath)
  await expect.poll(async () => (await path())?.length).toBe(97)
  const points = await path()
  expect(points[0][1]).toBeCloseTo(points[48][1])
  expect(points[0][1]).toBeCloseTo(points[96][1])
  expect(points[24][1]).toBeGreaterThan(points[0][1])
  expect(points[72][1]).toBeLessThan(points[0][1])
  expect(points[24][0] - points[0][0]).toBeCloseTo(points[96][0] - points[72][0])

  const edit = () => drawings.getByRole('button', { name: /^Edit Sine line/ }).click()
  await edit()
  await extremum.getByLabel('Price', { exact: true }).fill('7')
  await save()
  if (!await values.isVisible()) await details.click()
  await expect(readout()).toHaveText(['5', '2', '240 seconds', '3', iso(240)])
  const after = await downloadWorkspace(page)
  expect(after.version).toBe(79)
  expect(after.manifest.preferences.annotations['LOCAL:SINE'][0]).toMatchObject({
    kind: 'sine-line', start: { time: origin, ticks: 5000000 }, end: { time: origin + 60, ticks: 7000000 },
  })
  expect(after.manifest.series).toEqual(prior.manifest.series)
  for (const backup of [prior, after]) {
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, backup)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await expect(details).toHaveCount(backup === after ? 1 : 0)
  }
  await page.reload()
  await details.click()
  await expect(readout()).toHaveText(['5', '2', '240 seconds', '3', iso(240)])
})
