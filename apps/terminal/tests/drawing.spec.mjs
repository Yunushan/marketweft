import { expect, test } from './fixtures.mjs'
import { catalogContents, downloadWorkspace, microCSV, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const primary = page => page.getByRole('region', { name: 'Primary chart pane' })
const measurement = pane => pane.getByRole('definition')

test('edits exact endpoints and restores the per-instrument measurement offline', async ({ page, context, browser, baseURL }) => {
  await page.goto('/')
  await openImport(page, 'MEASURE', microCSV)
  await submitImport(page, 'MEASURE')
  const original = (await catalogContents(page)).series
  await page.getByRole('button', { name: 'Compare charts' }).click()
  const before = await downloadWorkspace(page)
  expect(before.version).toBe(2)
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const pane = primary(page)
  await pane.getByRole('button', { name: 'Draw measurement' }).click()
  const start = pane.getByRole('group', { name: 'Start', exact: true })
  const end = pane.getByRole('group', { name: 'End', exact: true })
  await expect(start.getByLabel('Time (UTC)')).toHaveValue('2024-02-29T23:59:59Z')
  await expect(end.getByLabel('Time (UTC)')).toHaveValue('2024-03-01T00:00:00Z')
  await expect(start.getByLabel('Price')).toHaveValue('-0.000001')
  await end.getByLabel('Time (UTC)').fill('2024-03-01T00:00:01Z')
  await pane.getByRole('button', { name: 'Save measurement' }).click()
  await expect(pane.getByRole('alert')).toContainText('existing bar')
  await end.getByLabel('Time (UTC)').fill('2024-03-01T00:00:00Z')
  await pane.getByRole('button', { name: 'Save measurement' }).click()
  await expect(measurement(pane)).toHaveText(['1 s', '1.000002', '100000200%'])
  await page.getByRole('button', { name: 'Select NASDAQ:NVDA' }).click()
  await expect(measurement(pane)).toHaveCount(0)
  await page.getByRole('button', { name: 'Select LOCAL:MEASURE' }).click()
  await pane.getByRole('button', { name: 'Edit measurement' }).click()
  await start.getByLabel('Price').fill('0')
  await pane.getByRole('button', { name: 'Save measurement' }).click()
  await expect(measurement(pane)).toHaveText(['1 s', '1.000001', 'Unavailable'])
  await page.reload()
  await expect(measurement(pane)).toHaveText(['1 s', '1.000001', 'Unavailable'])
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(3)
  expect(backup.manifest.preferences.drawings).toEqual({
    'LOCAL:MEASURE': { start: { time: 1709251199, ticks: 0 }, end: { time: 1709251200, ticks: 1000001 } },
  })
  expect((await catalogContents(page)).series).toEqual(original)
  const clean = await browser.newContext({ baseURL })
  try {
    const restored = await clean.newPage()
    await restored.goto('/')
    async function restore(bundle) {
      await restored.getByRole('button', { name: 'Workspace backup', exact: true }).click()
      await selectBackup(restored, bundle)
      await restored.getByRole('button', { name: 'Restore workspace', exact: true }).click()
      await expect(restored.getByText('Workspace restored.')).toBeVisible()
    }
    await restore(backup)
    await expect(measurement(primary(restored))).toHaveText(['1 s', '1.000001', 'Unavailable'])
    await primary(restored).getByRole('button', { name: 'Remove measurement' }).click()
    await expect(measurement(primary(restored))).toHaveCount(0)
    expect((await downloadWorkspace(restored)).version).toBe(2)
    await restore(backup)
    await restore(before)
    await expect(measurement(primary(restored))).toHaveCount(0)
  } finally {
    await clean.close()
  }
})

test('projects cursor-picked anchors after zoom and pan without altering their data coordinates', async ({ page }) => {
  await page.goto('/')
  const pane = primary(page)
  const canvas = pane.getByLabel(/^NVDA interactive/)
  await pane.getByRole('button', { name: 'Draw measurement' }).click()
  const editor = pane.getByRole('form', { name: 'Measurement endpoints' })
  const width = (await canvas.boundingBox()).width
  const positions = [['start', width * 0.52, 85], ['end', width * 0.75, 115]]
  const times = []
  for (const [point, x, y] of positions) {
    await editor.getByRole('button', { name: 'Pick ' + point + ' on chart' }).click()
    await canvas.click({ position: { x, y } })
    const group = editor.getByRole('group', { name: point, exact: false })
    times.push(Date.parse(await group.getByLabel('Time (UTC)').inputValue()) / 1000)
  }
  expect(times[1]).toBeGreaterThan(times[0])
  await editor.getByRole('button', { name: 'Save measurement' }).click()
  await expect(measurement(pane)).toHaveCount(3)
  const values = await measurement(pane).allTextContents()
  expect(values[0]).toBe((times[1] - times[0]) + ' s')
  const before = (await downloadWorkspace(page)).manifest.preferences.drawings
  const coloredColumns = () => canvas.evaluate(element => {
    const { width, height } = element
    const data = element.getContext('2d').getImageData(0, 0, width, height).data
    const columns = new Set()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 139 && data[i + 1] === 201 && data[i + 2] === 255 && data[i + 3] >= 250) {
        columns.add(i / 4 % width)
      }
    }
    return [...columns].sort((a, b) => a - b)
  })
  const full = await coloredColumns()
  expect(full.length).toBeGreaterThan(10)
  await pane.getByRole('button', { name: 'Zoom in' }).click()
  const zoomed = await coloredColumns()
  expect(zoomed.length).toBeGreaterThan(10)
  expect(zoomed).not.toEqual(full)
  await pane.getByRole('button', { name: 'Earlier bars' }).click()
  const panned = await coloredColumns()
  expect(panned.length).toBeGreaterThan(10)
  expect(panned).not.toEqual(zoomed)
  await expect(measurement(pane)).toHaveText(values)
  expect((await downloadWorkspace(page)).manifest.preferences.drawings).toEqual(before)
})

test('both panes share one drawing and an older editor cannot replace a later save', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('NASDAQ:NVDA')
  const left = primary(page)
  const right = page.getByRole('region', { name: 'Comparison chart pane' })
  await left.getByRole('button', { name: 'Draw measurement' }).click()
  await right.getByRole('button', { name: 'Draw measurement' }).click()
  await right.getByRole('group', { name: 'End', exact: true }).getByLabel('Price').fill('0')
  await right.getByRole('button', { name: 'Save measurement' }).click()
  await expect(measurement(right)).toHaveCount(3)
  const saved = await measurement(right).allTextContents()
  await expect(measurement(left)).toHaveText(saved)
  await left.getByRole('button', { name: 'Save measurement' }).click()
  await expect(left.getByRole('alert')).toContainText('changed while you were editing')
  await expect(measurement(right)).toHaveText(saved)
})
