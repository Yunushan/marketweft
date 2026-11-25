import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, seedLegacy, selectBackup } from './catalog-fixtures.mjs'

function legacy(closes) {
  return JSON.stringify({
    version: 1, selected: 'LOCAL:SAME', watchlist: ['LOCAL:SAME'], sma: true, ema: false,
    imports: [{
      venue: 'LOCAL', symbol: 'SAME', filename: 'series.csv',
      csv: [header, ...closes.map((v, i) => [i, v, v, v, v, 1].join(','))].join('\n'),
    }],
  })
}

test('restoring a shorter history with the same identity resets both open charts', async ({ browser, baseURL, page, context }) => {
  // Make a genuine one-bar backup in a separate profile.
  const source = await browser.newContext({ baseURL })
  let backup
  try {
    const sourcePage = await source.newPage()
    await seedLegacy(sourcePage, legacy([7]))
    await sourcePage.goto('/')
    backup = await downloadWorkspace(sourcePage)
  } finally { await source.close() }

  await seedLegacy(page, legacy([10, 20, 30]))
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveText('1–3 of 3')
  const observer = await context.newPage()
  await observer.goto(page.url())
  await expect(observer.getByTestId('viewport')).toHaveText('1–3 of 3')
  // Keep the observer's crosshair on a bar which is absent from the backup.
  const canvas = observer.locator('canvas[tabindex="0"]')
  const rect = await canvas.boundingBox()
  await canvas.hover({ position: { x: Math.floor(rect.width * 0.75), y: 50 } })
  await expect(observer.locator('.ohlc time')).toContainText('00:00:02')

  const errors = []
  for (const tab of [page, observer]) tab.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
  await selectBackup(page, backup)
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  for (const tab of [page, observer]) {
    await expect(tab.getByRole('heading', { name: 'SAME', exact: true })).toBeVisible()
    await expect(tab.getByTestId('viewport')).toHaveText('1–1 of 1')
    await expect(tab.locator('.quote strong')).toHaveText('7.00')
  }
  expect(errors).toEqual([])
})
