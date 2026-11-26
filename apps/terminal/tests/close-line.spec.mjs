import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const first = '2025-06-02,11,17,5,10,1'
const middle = '2025-06-03,28,40,21,30,2'
const last = '2025-06-04,20,27,18,20,3'

test('the close line uses observed closes and preserves range, gaps and pane settings', async ({ page, browser, baseURL }) => {
  await page.goto('/')
  await openImport(page, 'GAP', [header, first, last].join('\n'))
  await submitImport(page, 'GAP')
  await openImport(page, 'CLOSES', [header, first, middle, last].join('\n'))
  await submitImport(page, 'CLOSES')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:GAP')
  const legacy = await downloadWorkspace(page)
  expect(legacy.version).toBe(2)
  const primary = page.getByRole('region', { name: 'Primary chart pane' })
  const comparison = page.getByRole('region', { name: 'Comparison chart pane' })
  const primaryType = page.getByLabel('Primary chart type')
  const comparisonType = page.getByLabel('Comparison chart type')
  await primaryType.selectOption('line')
  const line = primary.getByLabel(/^CLOSES interactive close line/)
  await expect(line).toBeVisible()
  await expect(comparisonType).toHaveValue('candles')
  await expect(primary.getByTestId('viewport')).toHaveText('1–3 of 3')
  await expect(comparison.getByLabel(/^GAP interactive candlestick/)).toBeVisible()

  const vertices = await line.evaluate(canvas => {
    const { width, height } = canvas
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const points = []
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 85 && pixels[i + 1] === 181 && pixels[i + 2] === 238 && pixels[i + 3] >= 245) {
        points.push([i / 4 % width, Math.floor(i / 4 / width)])
      }
    }
    return [
      points.filter(([x, y]) => x < width / 4 && y > height / 2).length,
      points.filter(([x, y]) => x > width / 3 && x < width * 0.55 && y < height / 5).length,
      points.filter(([x, y]) => x > width * 0.65 && y > height / 4 && y < height / 2).length,
    ]
  })
  expect(vertices.every(count => count > 0)).toBe(true)
  const width = (await line.boundingBox()).width
  const plot = pane => pane.getByRole('region', { name: 'Price and volume chart' })
  await line.hover({ position: { x: width * 0.15, y: 60 } })
  const firstSecond = String(Date.parse('2025-06-02') / 1000)
  await expect(plot(primary)).toHaveAttribute('data-crosshair-time', firstSecond)
  await expect(plot(comparison)).toHaveAttribute('data-crosshair-time', firstSecond)
  await line.hover({ position: { x: width * 0.45, y: 60 } })
  await expect(plot(primary)).toHaveAttribute('data-crosshair-time', String(Date.parse('2025-06-03') / 1000))
  await expect(plot(comparison)).not.toHaveAttribute('data-crosshair-time', /^\d+$/)
  await page.reload()
  await expect(primaryType).toHaveValue('line')
  await expect(comparisonType).toHaveValue('candles')
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(5)
  expect(backup.manifest.preferences.chartTypes).toEqual({ primary: 'line' })
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
    await expect(restored.getByLabel('Primary chart type')).toHaveValue('line')
    await expect(restored.getByLabel('Comparison chart type')).toHaveValue('candles')
    await restore(legacy)
    await expect(restored.getByLabel('Primary chart type')).toHaveValue('candles')
  } finally {
    await clean.close()
  }
})
