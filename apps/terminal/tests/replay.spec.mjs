import { expect, test } from './fixtures.mjs'
import {
  catalogContents,
  openImport,
  submitImport,
} from './catalog-fixtures.mjs'

test('steps an offline replay across the clock change, missing bar and early close', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start demo' }).click()
  const status = page.locator('.replay-state')
  const next = page.getByRole('button', { name: 'Next event' })
  const count = page.getByTestId('replay-bar-count')
  const quote = page.getByTestId('replay-last-close')
  const step = async (amount = 1) => {
    for (let i = 0; i < amount; i++) await next.click()
  }
  await expect(count).toHaveText('0 observed bars')
  await expect(page.locator('canvas')).toHaveCount(0)
  await step()
  await expect(status).toContainText('Session opened')
  await expect(status).toContainText('UTC−04:00')
  await expect(status).toContainText('2025-10-31T13:30:00Z')
  await expect(quote).toHaveCount(0)
  await step()
  await expect(quote).toHaveText('101.00')
  await expect(status).toContainText('2025-10-31T14:00:00Z')
  await step(13)
  await expect(status).toContainText('Session closed')
  await expect(count).toHaveText('13 observed bars')
  await step()
  await expect(status).toContainText('UTC−05:00')
  await expect(status).toContainText('2025-11-03T14:30:00Z')
  await step(2)
  await expect(status).toContainText('Missing interval')
  await expect(status).toContainText('2025-11-03T15:00:00Z')
  await expect(status).toContainText('2025-11-03T15:30:00Z')
  await expect(count).toHaveText('14 observed bars')
  await expect(quote).toHaveText('114.00')
  await page.getByRole('button', { name: 'Previous event' }).click()
  await expect(status).toContainText('Bar observed')
  await step()
  // Replay speed changes presentation time. The same events and cutoffs apply.
  await page.getByLabel('Speed').selectOption('100')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(status).toContainText('Replay complete', { timeout: 45_000 })
  await expect(status).toContainText('Early close')
  await expect(status).toContainText('2025-11-28T18:00:00Z')
  await expect(count).toHaveText('253 observed bars')
  await expect(quote).toHaveText('353.00')
  await expect(next).toBeDisabled()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(count).toHaveText('0 observed bars')
  await expect(quote).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(
    page.getByRole('heading', { name: 'Research terminal' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Historical replay' }),
  ).toBeFocused()
})

test('validates the matching calendar for an imported series and preserves the catalog', async ({
  page,
}) => {
  await page.goto('/')
  await openImport(
    page,
    'REPLAY',
    'time,open,high,low,close,volume\n2025-11-28T14:30:00Z,1,2,0,1.000001,2\n2025-11-28T16:30:00Z,3,4,2,3.000001,7',
  )
  await submitImport(page, 'REPLAY')
  const original = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await expect(page.getByLabel('Instrument')).toHaveValue('LOCAL:REPLAY')
  const calendar =
    'date,open_utc,close_utc,utc_offset_minutes,kind\n2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early'
  await page.getByLabel('Session calendar CSV').setInputFiles({
    name: 'sessions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(calendar),
  })
  const interval = page.getByLabel('Bar interval in seconds')
  await interval.fill('2500')
  await page.getByRole('button', { name: 'Start replay' }).click()
  await expect(page.getByRole('alert')).toContainText('off the interval grid')
  await interval.fill('3600')
  await page.getByRole('button', { name: 'Start replay' }).click()
  await expect(
    page.getByRole('heading', { name: 'LOCAL:REPLAY' }),
  ).toBeVisible()
  await expect(page.getByTestId('replay-last-close')).toHaveCount(0)
  const next = page.getByRole('button', { name: 'Next event' })
  for (let i = 0; i < 3; i++) await next.click()
  await expect(page.locator('.replay-state')).toContainText('Missing interval')
  await expect(page.getByTestId('replay-last-close')).toHaveText('1.000001')
  await next.click()
  await expect(page.getByTestId('replay-last-close')).toHaveText('3.000001')
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})
