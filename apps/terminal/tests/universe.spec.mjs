import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = (time) => '2025-06-02T' + time + 'Z'
const fixture = () =>
  readFile(
    new URL(
      '../../../crates/core/tests/fixtures/synthetic-universe.csv',
      import.meta.url,
    ),
    'utf8',
  )

async function open(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
}

test('offline universe replay shows every addition, removal and delisting cutoff', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const table = page.getByRole('table', { name: 'As-of universe listings' })
  const rows = () =>
    table
      .locator('tbody tr')
      .evaluateAll((items) =>
        items.map((row) => [
          row.cells[0].textContent,
          row.cells[2].textContent,
        ]),
      )
  const next = page.getByRole('button', { name: 'Next cutoff' })
  const previous = page.getByRole('button', { name: 'Previous cutoff' })
  const finalRows = [
    ['ALFA-001', 'Member'],
    ['BETA-001', 'Delisted'],
    ['BETA-002', 'Member'],
  ]
  const expected = [
    ['14:00:00', [['ALFA-001', 'Member']]],
    ['14:05:00', [['ALFA-001', 'Member']]],
    [
      '14:10:00',
      [
        ['ALFA-001', 'Member'],
        ['BETA-001', 'Member'],
      ],
    ],
    [
      '14:25:00',
      [
        ['ALFA-001', 'Removed'],
        ['BETA-001', 'Member'],
      ],
    ],
    [
      '14:35:00',
      [
        ['ALFA-001', 'Removed'],
        ['BETA-001', 'Delisted'],
      ],
    ],
    [
      '14:40:00',
      [
        ['ALFA-001', 'Removed'],
        ['BETA-001', 'Delisted'],
      ],
    ],
    [
      '14:45:00',
      [
        ['ALFA-001', 'Removed'],
        ['BETA-001', 'Delisted'],
        ['BETA-002', 'Member'],
      ],
    ],
    ['14:50:00', finalRows],
    ['14:55:00', finalRows],
    ['15:00:00', finalRows],
    ['15:05:00', finalRows],
  ]
  await expect(previous).toBeDisabled()
  for (const [index, [time, listings]] of expected.entries()) {
    if (index) await next.click()
    await expect(page.getByLabel('Effective time (UTC)')).toHaveValue(utc(time))
    await expect(page.getByLabel('Known time (UTC)')).toHaveValue(utc(time))
    expect(await rows()).toEqual(listings)
  }
  await expect(next).toBeDisabled()
  const reused = table.getByRole('row', { name: /^BETA-002/ })
  await expect(reused).toContainText('DEMO:BETA')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  )
  for (let i = 0; i < 7; i++) await previous.click()
  expect(await rows()).toEqual(expected[3][1])
  await previous.click()
  expect(await rows()).toEqual(expected[2][1])
  await page
    .getByRole('button', { name: 'Return to historical replay' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Open universe replay' }),
  ).toBeFocused()
})

test('an uploaded universe supports independent as-of cutoffs and retains the catalog', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const original = await catalogContents(page)
  await open(page)
  const upload = (content) =>
    page.getByLabel('Universe membership CSV').setInputFiles({
      name: 'universe.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(content),
    })
  const csv = await fixture()
  await upload(csv.replace('DEMO-BASKET', 'WRONG'))
  const load = page.getByRole('button', { name: 'Load universe' })
  await load.click()
  await expect(page.getByRole('alert')).toContainText('same universe')
  await upload(csv)
  await load.click()
  const effective = page.getByLabel('Effective time (UTC)')
  const known = page.getByLabel('Known time (UTC)')
  const run = page.getByRole('button', { name: 'Run as-of query' })
  const alfa = page.getByRole('row', { name: /^ALFA-001/ })
  const beta = page.getByRole('row', { name: /^BETA-001/ })
  const query = async (e, k) => {
    await effective.fill(utc(e))
    await known.fill(utc(k))
    await run.click()
  }

  await query('14:20:00', '14:24:59')
  await expect(alfa).toContainText('Member')
  await query('14:20:00', '14:25:00')
  await expect(alfa).toContainText('Removed')
  await expect(alfa).toContainText(utc('14:20:00'))
  await expect(alfa).toContainText(utc('14:25:00'))
  await query('14:30:00', '14:34:59')
  await expect(beta).toContainText('Member')
  await query('14:30:00', '14:35:00')
  await expect(beta).toContainText('Delisted')
  await query('15:20:00', '15:04:59')
  await expect(alfa).toContainText('ALFA-PLANNED')
  await query('15:20:00', '15:05:00')
  await expect(alfa).toContainText('ALFA-RETURN')
  await known.fill('2025-06-31T14:00:00Z')
  await run.click()
  await expect(page.getByRole('alert')).toContainText('UTC timestamps')
  await expect(alfa).toContainText('ALFA-RETURN')
  await page
    .getByRole('button', { name: 'Return to historical replay' })
    .click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})
