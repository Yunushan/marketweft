import { expect, test } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Research terminal' }),
  ).toBeVisible()
})

test('renders candles and crosshair, pans, zooms and resets the visible interval', async ({
  page,
}) => {
  const canvas = page.locator('canvas[tabindex="0"]')
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveText('121–180 of 180')
  const colors = await canvas.evaluate((el) => {
    const pixels = el
      .getContext('2d')
      .getImageData(0, 0, el.width, el.height).data
    let rising = 0,
      falling = 0,
      sma = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 104 && pixels[i + 1] === 215 && pixels[i + 2] === 177)
        rising++
      if (pixels[i] === 236 && pixels[i + 1] === 129 && pixels[i + 2] === 126)
        falling++
      if (pixels[i] === 232 && pixels[i + 1] === 186 && pixels[i + 2] === 112)
        sma++
    }
    return { rising, falling, sma }
  })
  expect(colors.rising).toBeGreaterThan(5)
  expect(colors.falling).toBeGreaterThan(5)
  expect(colors.sma).toBeGreaterThan(0)
  const box = await canvas.boundingBox(),
    before = await page.locator('.ohlc time').textContent()
  await page.mouse.move(box.x + 50, box.y + 70)
  await expect(page.locator('.ohlc time')).not.toHaveText(before)
  await page.mouse.down()
  await page.mouse.move(box.x + 170, box.y + 70, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('viewport')).not.toHaveText('121–180 of 180')
  await page.getByRole('button', { name: 'Reset chart view' }).click()
  await canvas.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('viewport')).toHaveText('120–179 of 180')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByTestId('viewport')).toHaveText('132–179 of 180')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByTestId('viewport')).toHaveText('1–180 of 180')
})

test('watchlist, selected instrument and indicator choices survive reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Manage watchlist' }).click()
  await page.getByRole('textbox', { name: 'Search instruments' }).fill('AMD')
  await page.getByRole('button', { name: 'Add NASDAQ:AMD' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Select NASDAQ:AMD' }).click()
  await page.getByRole('button', { name: /Indicators/ }).click()
  await page.getByRole('checkbox', { name: /Exponential/ }).check()
  await page.getByRole('checkbox', { name: /Simple/ }).uncheck()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'AMD', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.legend')).toContainText('EMA 9')
  await expect(page.locator('.legend')).not.toContainText('SMA 20')
  await page.getByRole('button', { name: 'Manage watchlist' }).click()
  await page.getByRole('button', { name: 'Remove NASDAQ:AMD' }).click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Select NASDAQ:AMD' }),
  ).toHaveCount(0)
})

test('rejects invalid bars and imports persisted observations offline', async ({
  page,
  context,
}) => {
  const head = 'time,open,high,low,close,volume\n'
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await page.getByRole('textbox', { name: 'Symbol' }).fill('TEST')
  const upload = page.locator('input[type=file]')
  await upload.setInputFiles({
    name: 'owned.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(head + '2025-01-01,10,1,9,12,45'),
  })
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await upload.setInputFiles({
    name: 'owned.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      head + '2025-01-01,10,15,9,12,45\n2025-01-02,12,17,10,14,55',
    ),
  })
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(
    page.getByRole('heading', { name: 'TEST', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Imported CSV' }),
  ).toBeVisible()
  await expect(page.locator('.quote strong')).toHaveText('14.00')
  await expect(page.getByTestId('viewport')).toHaveText('1–2 of 2')
  await expect(page.getByText('Offline ready')).toBeVisible()
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {
          once: true,
        }),
      )
  })
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'TEST', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.quote strong')).toHaveText('14.00')
  await page.getByRole('button', { name: 'Select NASDAQ:AAPL' }).click()
  await expect(
    page.getByRole('heading', { name: 'Synthetic sample' }),
  ).toBeVisible()
})

test('fits a phone viewport and keeps chart and import controls accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await expect(page.getByRole('button', { name: 'Indicators 1' })).toBeVisible()
  await expect(page.getByText('Synthetic sample through')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  )
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Import to watchlist' }),
  ).toBeInViewport()
})

test('recovers visibly from unusable saved state', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('marketweft.workspace.v1', '{'),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText(
    'Saved workspace could not be read',
  )
  await expect(
    page.getByRole('heading', { name: 'NVDA', exact: true }),
  ).toBeVisible()
})
