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

test('offline delisting proceeds distinguish missing cash, payment revisions and ticker reuse', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Delisting proceeds' })
  await panel.getByRole('button', { name: 'Load delisting demo' }).click()
  const state = panel.getByRole('status')
  const field = (label, value) => expect(panel.getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd')).toHaveText(value)
  const query = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await query('14:37:00', '14:34:00')
  await expect(state).toContainText('Holding shares')
  await field('Ordinary shares', '10')
  await query('14:35:00')
  await expect(state).toContainText('Proceeds unavailable')
  await field('Cash value', 'Unavailable')
  await query('14:37:00')
  await expect(state).toContainText('Cash receivable')
  await field('Cash value', '70 USD')
  await field('Delisting return', '-30%')
  await query('14:50:00')
  const ledger = panel.getByRole('table', { name: 'Delisting cash postings' })
  await expect(state).toContainText('Cash settled')
  await expect(ledger.getByRole('row', { name: /14:50/ }).getByRole('cell')).toHaveText(['USD', '70', '70'])
  await query('14:55:00')
  await expect(ledger.getByRole('row', { name: /14:55/ }).getByRole('cell')).toHaveText(['USD', '10', '80'])
  await query('15:04:00')
  await field('Cash value', '90 EUR')
  await field('Delisting return', 'Unavailable')
  await expect(ledger.getByRole('row', { name: /15:01/ }).getByRole('cell')).toHaveText(['USD', '-80', '0'])
  await expect(ledger.getByRole('row', { name: /15:04/ }).getByRole('cell')).toHaveText(['EUR', '90', '90'])
  await query('15:05:00')
  await field('Cash value', '0 EUR')
  await field('Delisting return', '-100%')
  await panel.getByLabel('Listing ID').fill('BETA-002')
  await panel.getByRole('button', { name: 'Apply delisting terms' }).click()
  await expect(state).toHaveText('BETA-002 · Holding shares')
  await expect(ledger).toHaveCount(0)
  expect(await catalogContents(page)).toEqual(original)
})

test('offline portfolio marks only observed closes and keeps delisting cash by listing and currency', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load portfolio demo' }).click()
  const holdings = panel.getByRole('table', { name: 'Portfolio positions' })
  const totals = panel.getByRole('table', { name: 'Portfolio currency subtotals' })
  const listing = id => holdings.getByRole('row', { name: new RegExp('^' + id) })
  const value = currency => totals.getByRole('row', { name: new RegExp('^' + currency) }).getByRole('cell')
  const through = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:10:00')
  await expect(listing('BETA-001')).toContainText('Close unavailable')
  await expect(value('USD')).toHaveText(['204', '0', '0', '204'])
  await through('14:10:00', '14:12:00')
  await expect(listing('BETA-001')).toContainText('560 USD')
  await expect(value('USD')).toHaveText(['764', '0', '0', '764'])
  await through('14:35:00')
  await expect(listing('BETA-001')).toContainText('Proceeds unavailable')
  await through('14:45:00')
  await expect(listing('BETA-001')).toContainText('70 USD')
  await expect(listing('BETA-002')).toContainText('225 EUR')
  await expect(value('USD')).toHaveText(['0', '70', '0', '70'])
  await expect(value('EUR')).toHaveText(['225', '0', '0', '225'])
  await through('14:50:00')
  await expect(value('USD')).toHaveText(['214', '0', '70', '284'])
  await through('14:58:00')
  await expect(value('USD')).toHaveText(['0', '0', '64', '64'])
  await through('15:04:00')
  await expect(value('EUR')).toHaveText(['0', '0', '72', '72'])
  await through('15:05:00')
  await expect(listing('BETA-001')).toContainText('0 EUR')
  await through('14:50:00')
  await expect(value('USD')).toHaveText(['214', '0', '70', '284'])
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline portfolio rolls dividends by stable listing and by independent cutoffs', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load dividend income demo' }).click()
  const income = panel.getByRole('table', { name: 'Portfolio dividend entitlement' })
  const totals = panel.getByRole('table', { name: 'Portfolio currency subtotals' })
  const currency = code => totals.getByRole('row', { name: new RegExp('^' + code) }).getByRole('cell')
  const through = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:10:00', '14:02:00')
  await expect(income).toHaveCount(0)
  await through('14:10:00')
  await expect(income.getByRole('row', { name: /^ALFA-001/ })).toContainText('2.5 USD')
  await expect(currency('USD').nth(3)).toHaveText('2.5')
  await through('14:34:00')
  await expect(currency('USD').nth(3)).toHaveText('16.5')
  await through('14:34:00', '14:35:00')
  await expect(income.getByRole('row', { name: /BETA-POST-DELIST/ })).toContainText('No payment')
  await expect(currency('USD').nth(3)).toHaveText('7.5')
  await through('14:37:00')
  await expect(currency('USD').nth(1)).toHaveText('70')
  await expect(currency('USD').nth(3)).toHaveText('7.5')
  await through('14:55:00')
  await expect(income.getByRole('row', { name: /BETA-PAYOUT/ })).toHaveCount(2)
  await expect(currency('USD').nth(4)).toHaveText('5')
  await expect(currency('EUR').nth(4)).toHaveText('8')
  await through('14:55:00', '14:58:00')
  await expect(currency('USD').nth(4)).toHaveText('4')
  await through('14:55:00', '15:01:00')
  await expect(income.getByRole('row', { name: /^BETA-001 BETA-PAYOUT/ })).toContainText('No payment')
  await expect(currency('EUR').nth(4)).toHaveText('8')
  await through('14:55:00')
  await expect(currency('USD').nth(4)).toHaveText('5')
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline successor shares follow the known delisting, delivery revisions and prior holdings', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load successor shares demo' }).click()
  const claims = panel.getByRole('table', { name: 'Portfolio delisting successor shares' })
  const beta = claims.getByRole('row', { name: /^BETA-DELIST/ })
  const through = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:30:00', '14:34:59')
  await expect(panel.getByText('No successor share claims at these cutoffs.')).toBeVisible()
  await through('14:30:00', '14:35:00')
  await expect(beta).toContainText('Successor terms unavailable')
  await through('14:48:59', '14:55:00')
  await expect(beta).toContainText('Shares receivable')
  await expect(beta.getByRole('cell', { name: 'BETA-001', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: 'BETA-002', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '10/3', exact: true })).toBeVisible()
  await through('14:49:00', '14:55:00')
  await expect(beta).toContainText('Shares delivered')
  await through('14:59:59', '14:57:00')
  await expect(beta).toContainText('Shares receivable')
  await expect(beta.getByRole('cell', { name: 'ALFA-001', exact: true })).toBeVisible()
  await through('15:00:00')
  await expect(beta.getByRole('cell', { name: '6', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: utc('14:58:00'), exact: true })).toBeVisible()
  const usd = panel.getByRole('table', { name: 'Portfolio currency subtotals' }).getByRole('row', { name: /^USD/ })
  await expect(usd.getByRole('cell').nth(2)).toHaveText('64')
  const reused = panel.getByRole('table', { name: 'Portfolio positions' }).getByRole('row', { name: /^BETA-002/ })
  await expect(reused.getByRole('cell', { name: '3', exact: true })).toBeVisible()
  await through('15:00:00', '15:02:00')
  await expect(beta).toContainText('No distribution')
  await through('14:49:00', '14:55:00')
  await expect(beta.getByRole('cell', { name: '10/3', exact: true })).toBeVisible()

  const holdings = new URL('../../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv', import.meta.url)
  const prices = new URL('../../../crates/core/tests/fixtures/synthetic-universe-prices.csv', import.meta.url)
  const terms = new URL('../../../crates/core/tests/fixtures/synthetic-successor-shares.csv', import.meta.url)
  for (const [label, path] of [['Portfolio holdings CSV', holdings], ['Portfolio closes CSV', prices]]) {
    await panel.getByLabel(label).setInputFiles({ name: path.pathname.split('/').at(-1), mimeType: 'text/csv', buffer: await readFile(path) })
  }
  const source = await readFile(terms, 'utf8')
  const upload = panel.getByLabel('Delisting successor shares CSV (optional)')
  await upload.setInputFiles({ name: 'successor.csv', mimeType: 'text/csv', buffer: Buffer.from(source.replace('BETA-002', 'UNKNOWN')) })
  await panel.getByRole('button', { name: 'Load portfolio reports' }).click()
  await expect(panel.getByRole('alert')).toContainText('distinct successor listing')
  await expect(beta.getByRole('cell', { name: '10/3', exact: true })).toBeVisible()
  await upload.setInputFiles({ name: 'successor.csv', mimeType: 'text/csv', buffer: Buffer.from(source) })
  await panel.getByRole('button', { name: 'Load portfolio reports' }).click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(beta).toContainText('Shares delivered')
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline successor delivery ledger exports signed postings and rewinds exactly', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load successor shares demo' }).click()
  await panel.getByText('Successor delivery ledger', { exact: true }).click()
  const ledger = panel.getByRole('table', { name: 'Successor delivery ledger', exact: true })
  const rows = ledger.locator('tbody tr')
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download successor delivery ledger' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('successor-delivery-ledger.csv')
    return readFile(await file.path(), 'utf8')
  }
  await query('15:00:00', '14:48:59')
  await expect(panel.getByText('No successor share deliveries posted at these cutoffs.')).toBeVisible()
  await query('15:00:00', '14:49:00')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().getByRole('cell', { name: '10/3', exact: true })).toHaveCount(2)
  const first = await download()
  expect(first).toContain('2025-06-02T15:00:00Z,2025-06-02T14:49:00Z,2025-06-02T14:49:00Z,"BETA-DELIST","BETA-001","BETA-002",')
  expect(first).toMatch(/,10,3,10,3\r\n$/)
  await query('15:00:00', '15:02:00')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(1).getByRole('cell', { name: '-10/3', exact: true })).toBeVisible()
  await expect(rows.nth(2).getByRole('cell', { name: 'ALFA-001', exact: true })).toBeVisible()
  await expect(rows.nth(2).getByRole('cell', { name: '2025-06-02T14:58:00Z', exact: true })).toBeVisible()
  await expect(rows.nth(3).getByRole('cell', { name: '-6', exact: true })).toBeVisible()
  expect(await download()).toMatch(/,-6,1,0,1\r\n$/)
  await query('14:59:59', '15:02:00')
  await expect(rows).toHaveCount(2)
  await query('15:00:00', '14:49:00')
  expect(await download()).toBe(first)
  await expect.poll(() => catalogContents(page)).toEqual(original)
})

test('offline subscription rights replay revises the window, holding and exact cash requirement', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const originalCatalog = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load subscription rights demo' }).click()
  const table = panel.getByRole('table', { name: 'Portfolio subscription rights', exact: true })
  const cell = name => table.getByRole('cell', { name, exact: true })
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download subscription rights' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('portfolio-rights-offerings.csv')
    return readFile(await file.path(), 'utf8')
  }
  await query('14:30:00', '14:14:59')
  await expect(panel.getByText('No subscription rights reported at these cutoffs.')).toBeVisible()
  await query('14:29:59', '14:15:00')
  await expect(cell('Awaiting entitlement')).toBeVisible()
  await query('14:39:59', '14:49:00')
  await expect(cell('Awaiting opening')).toBeVisible()
  await query('14:40:00', '14:49:00')
  await expect(cell('Open')).toBeVisible()
  await expect(cell('10/3')).toBeVisible()
  await expect(cell('57.75 USD')).toBeVisible()
  const first = await download()
  expect(first).toContain('"synthetic-subscription-rights.csv","synthetic-rights-holdings.csv"')
  expect(first).toMatch(/,10,10,3,3,57\.75\r\n$/)
  await query('14:55:00', '14:56:59')
  await expect(cell('Expired')).toBeVisible()
  await query('15:00:00', '14:57:00')
  await expect(cell('Open')).toBeVisible()
  await expect(cell('100.625005 EUR')).toBeVisible()
  await query('15:00:00', '14:58:00')
  await expect(cell('80.500004 EUR')).toBeVisible()
  expect(await download()).toMatch(/14:58:00Z,8,4,1,4,80\.500004\r\n$/)
  await query('15:00:00', '15:03:00')
  await expect(cell('Cancelled')).toBeVisible()
  await expect(cell('80.500004 EUR')).toHaveCount(0)
  await query('14:40:00', '14:49:00')
  expect(await download()).toBe(first)

  const terms = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-subscription-rights.csv', import.meta.url), 'utf8')
  const holding = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-rights-holdings.csv', import.meta.url))
  const input = panel.getByLabel('Subscription rights CSV (optional)')
  const load = panel.getByRole('button', { name: 'Load portfolio reports' })
  await panel.getByLabel('Portfolio holdings CSV', { exact: true }).setInputFiles({ name: 'local-holdings.csv', mimeType: 'text/csv', buffer: holding })
  await input.setInputFiles({ name: 'local-rights.csv', mimeType: 'text/csv', buffer: Buffer.from(terms.replace('19.25', '0')) })
  await load.click()
  await expect(panel.getByRole('alert')).toContainText('positive subscription price')
  expect(await download()).toBe(first)
  await input.setInputFiles({ name: 'local-rights.csv', mimeType: 'text/csv', buffer: Buffer.from(terms) })
  await load.click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(cell('57.75 USD')).toBeVisible()
  expect(await download()).toContain('"local-rights.csv","local-holdings.csv"')
  await expect.poll(() => catalogContents(page)).toEqual(originalCatalog)
})


test('offline subscription exercises replay reported settlement and preserve request-time capacity', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load subscription exercise demo' }).click()
  const table = panel.getByRole('table', { name: 'Portfolio subscription exercises', exact: true })
  const a = table.getByRole('row', { name: /^EX-A/ })
  const cell = name => a.getByRole('cell', { name, exact: true })
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download subscription exercises' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('portfolio-rights-exercises.csv')
    return readFile(await file.path(), 'utf8')
  }
  await query('14:42:00', '14:44:59')
  await expect(panel.getByText('No subscription exercises reported at these cutoffs.')).toBeVisible()
  await query('14:54:00', '14:45:00')
  await expect(cell('Requested')).toBeVisible()
  await expect(cell('Within basic capacity')).toBeVisible()
  await query('14:54:00', '14:56:59')
  await expect(cell('Allocated')).toBeVisible()
  await expect(cell('38.5 USD')).toHaveCount(0)
  await query('14:54:00', '14:57:00')
  await expect(cell('Settled')).toBeVisible()
  await expect(cell('38.5 USD')).toBeVisible()
  const first = await download()
  expect(first).toContain('"synthetic-rights-exercises.csv","synthetic-subscription-rights.csv","synthetic-rights-holdings.csv"')
  expect(first).toMatch(/,within-capacity,3,2,USD,19\.25,2,38\.5,0\r\n$/)
  await query('15:00:00', '14:59:00')
  await expect(cell('39.000001 USD')).toBeVisible()
  await expect(cell('0.500001 USD')).toBeVisible()
  await expect(table.getByRole('row', { name: /^EX-B/ })).toContainText('Outside the known exercise window')
  await query('15:00:00', '15:02:00')
  await expect(cell('Cancelled')).toBeVisible()
  await expect(cell('39.000001 USD')).toHaveCount(0)
  await query('14:54:00', '14:57:00')
  expect(await download()).toBe(first)

  const fixture = name => readFile(new URL('../../../crates/core/tests/fixtures/' + name, import.meta.url), 'utf8')
  const upload = (label, name, content) =>
    panel.getByLabel(label).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) })
  const [holdings, terms, exercises] = await Promise.all([
    fixture('synthetic-rights-holdings.csv'), fixture('synthetic-subscription-rights.csv'), fixture('synthetic-rights-exercises.csv'),
  ])
  await upload('Portfolio holdings CSV', 'local-holdings.csv', holdings)
  await upload('Subscription rights CSV', 'local-rights.csv', terms)
  await upload('Subscription exercise reports CSV', 'local-exercises.csv', exercises.replace(',2,38.50', ',4,38.50'))
  const load = panel.getByRole('button', { name: 'Load portfolio reports' })
  await load.click()
  await expect(panel.getByRole('alert')).toContainText('within the allocation')
  expect(await download()).toBe(first)
  await upload('Subscription exercise reports CSV', 'local-exercises.csv', exercises)
  await load.click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(cell('38.5 USD')).toBeVisible()
  expect(await download()).toContain('"local-exercises.csv","local-rights.csv","local-holdings.csv"')
  await expect.poll(() => catalogContents(page)).toEqual(saved)
})


test('offline subscription settlement journal reconciles signed corrections and separate currencies', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load settlement journal demo' }).click()
  await panel.getByText('Subscription settlement journal', { exact: true }).click()
  const table = panel.getByRole('table', { name: 'Subscription settlement journal', exact: true })
  const rows = table.locator('tbody tr')
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const amount = async (index, asset, change, balance) => {
    const cells = rows.nth(index).getByRole('cell')
    await expect(cells.nth(4)).toHaveText(asset)
    await expect(cells.nth(5)).toHaveText(change)
    await expect(cells.nth(6)).toHaveText(balance)
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download settlement journal' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('subscription-settlement-journal.csv')
    return readFile(await file.path(), 'utf8')
  }
  await query('14:54:00', '14:56:59')
  await expect(panel.getByText('No settlement changes at these cutoffs.')).toBeVisible()
  await query('14:54:00', '14:57:00')
  await expect(rows).toHaveCount(2)
  await amount(0, 'Shares', '2', '2')
  await amount(1, 'USD', '-38.5', '-38.5')
  const original = await download()
  expect(original).toContain('"synthetic-rights-journal.csv","synthetic-subscription-rights.csv"')
  expect(original).toMatch(/,settled,cash,USD,-38\.5,-38\.5\r\n$/)

  await query('15:00:00', '14:59:00')
  await expect(rows).toHaveCount(3)
  await amount(2, 'USD', '-0.500001', '-39.000001')
  await query('14:59:59', '15:02:00')
  await expect(rows).toHaveCount(6)
  await amount(3, 'Shares', '-1', '1')
  await amount(4, 'USD', '39.000001', '0')
  await amount(5, 'EUR', '-20.125001', '-20.125001')
  await query('15:00:00', '15:02:00')
  await expect(rows).toHaveCount(8)
  await expect(rows.last().getByRole('cell', { name: 'Cancelled', exact: true })).toBeVisible()
  await amount(6, 'Shares', '-1', '0')
  await amount(7, 'EUR', '20.125001', '0')
  await query('14:54:00', '14:57:00')
  expect(await download()).toBe(original)
  await expect.poll(() => catalogContents(page)).toEqual(saved)
})


test('offline capital returns replay paid cash and exact reported basis revisions', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load capital return demo' }).click()
  const row = panel.getByRole('table', { name: 'Portfolio capital returns', exact: true }).getByRole('row', { name: /^ALFA-ROC/ })
  const cell = name => row.getByRole('cell', { name, exact: true })
  const distribution = row.getByRole('cell').nth(8)
  const query = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download capital returns' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('portfolio-capital-returns.csv')
    return readFile(await file.path(), 'utf8')
  }
  await query('14:17:59', '14:49:00')
  await expect(panel.getByText('No capital returns reported at these cutoffs.')).toBeVisible()
  await query('14:49:59', '14:49:00')
  await expect(cell('Receivable')).toBeVisible()
  await expect(distribution).toHaveText('25')
  await query('14:50:00', '14:49:00')
  await expect(cell('Paid')).toBeVisible()
  await expect(cell('5')).toBeVisible()
  const first = await download()
  expect(first).toContain('"synthetic-capital-returns.csv","synthetic-rights-holdings.csv","synthetic-capital-return-basis.csv"')
  expect(first).toMatch(/,paid,USD,2\.5,10,25,2025-06-02T14:40:00Z,30,25,5,0\r\n$/)
  await query('14:50:00', '14:55:00')
  await expect(cell('15')).toBeVisible()
  await query('15:00:00', '15:01:59')
  await expect(cell('EUR')).toBeVisible()
  await expect(cell('24.000008')).toBeVisible()
  await expect(cell('Basis unavailable')).toBeVisible()
  await query('15:00:00', '15:02:00')
  await expect(cell('15.875007')).toBeVisible()
  await query('15:00:00', '15:04:00')
  await expect(cell('No distribution')).toBeVisible()
  await query('14:50:00', '14:49:00')
  expect(await download()).toBe(first)

  const fixture = name => readFile(new URL('../../../crates/core/tests/fixtures/' + name, import.meta.url))
  const upload = (label, name, buffer) => panel.getByLabel(label).setInputFiles({ name, mimeType: 'text/csv', buffer })
  await upload('Portfolio holdings CSV', 'local-holdings.csv', await fixture('synthetic-rights-holdings.csv'))
  await upload('Portfolio capital returns CSV', 'local-returns.csv', await fixture('synthetic-capital-returns.csv'))
  const load = panel.getByRole('button', { name: 'Load portfolio reports' })
  await load.click()
  await expect(cell('Basis unavailable')).toBeVisible()
  await expect(distribution).toHaveText('25')
  await upload('Capital return basis CSV', 'local-basis.csv', await fixture('synthetic-capital-return-basis.csv'))
  await load.click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(cell('5')).toBeVisible()
  expect(await download()).toContain('"local-returns.csv","local-holdings.csv","local-basis.csv"')
  await expect.poll(() => catalogContents(page)).toEqual(saved)
})

test('offline portfolio spin-offs preserve exact fractions through revisions and ticker reuse', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load spin-off demo' }).click()
  const entitlements = panel.getByRole('table', { name: 'Portfolio spin-off entitlements' })
  const beta = entitlements.getByRole('row', { name: /^BETA-UNIT/ })
  const through = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:20:00', '14:16:59')
  await expect(panel.getByText('No spin-off entitlements at these cutoffs.')).toBeVisible()
  await through('14:20:00', '14:17:00')
  await expect(beta.getByRole('cell', { name: 'BETA-001', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: 'ALFA-001', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '10/3', exact: true })).toBeVisible()
  await expect(beta).toContainText('Shares receivable')
  await through('14:40:00', '14:49:59')
  await expect(beta).toContainText('Shares distributed')
  await through('14:40:00', '14:50:00')
  await expect(beta).toContainText('Shares receivable')
  await expect(beta).toContainText('20/3')
  await through('14:55:00', '14:58:00')
  await expect(beta).toContainText('16/3')
  await expect(beta).toContainText('Shares distributed')
  await expect(beta.getByRole('cell', { name: utc('14:58:00') })).toBeVisible()
  const alfa = entitlements.getByRole('row', { name: /^ALFA-UNIT/ })
  await expect(alfa.getByRole('cell', { name: 'BETA-002', exact: true })).toBeVisible()
  await expect(alfa.getByRole('cell', { name: '1', exact: true })).toBeVisible()
  await through('14:55:00', '15:02:00')
  await expect(beta).toContainText('No distribution')
  await expect(beta.getByRole('cell', { name: '0', exact: true })).toBeVisible()
  await through('14:20:00')
  await expect(beta).toContainText('10/3')
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline spin-off cash in lieu follows the fractional remainder and observed payment terms', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load spin-off demo' }).click()
  const cash = panel.getByRole('table', { name: 'Portfolio spin-off cash in lieu' })
  const beta = cash.getByRole('row', { name: /^BETA-UNIT/ })
  const through = async (effective, known = effective) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:25:00', '14:23:59')
  await expect(beta).toContainText('Payment terms unavailable')
  await through('14:48:00')
  await expect(beta.getByRole('cell', { name: '1/3', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '1 USD', exact: true })).toBeVisible()
  await expect(beta).toContainText('Cash paid')
  await through('14:52:00')
  await expect(beta.getByRole('cell', { name: '2/3', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '4 EUR', exact: true })).toBeVisible()
  await expect(beta).toContainText('Cash receivable')
  await through('14:55:00', '14:58:00')
  await expect(beta.getByRole('cell', { name: '2 EUR', exact: true })).toBeVisible()
  await expect(beta).toContainText('Cash paid')
  await expect(cash.getByRole('row', { name: /^ALFA-UNIT/ })).toContainText('No payment')
  await through('14:55:00', '15:00:00')
  await expect(beta.getByRole('cell', { name: '0.000001 GBP', exact: true })).toBeVisible()
  await through('14:55:00', '15:02:00')
  await expect(beta).toContainText('No payment')
  await through('14:48:00')
  await expect(beta.getByRole('cell', { name: '1 USD', exact: true })).toBeVisible()
  expect(await catalogContents(page)).toEqual(saved)
})

test('offline spin-off basis follows revised terms and distribution with an exact conserved total', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const saved = await catalogContents(page)
  await context.setOffline(true)
  await open(page)
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const panel = page.getByRole('region', { name: 'Portfolio replay' })
  await panel.getByRole('button', { name: 'Load spin-off demo' }).click()
  const basis = panel.getByRole('table', { name: 'Portfolio spin-off basis allocation' })
  const beta = basis.getByRole('row', { name: /^BETA-UNIT/ })
  const through = async (effective, known) => {
    await page.getByLabel('Effective time (UTC)').fill(utc(effective))
    await page.getByLabel('Known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Run as-of query' }).click()
  }
  await through('14:40:00', '14:27:59')
  await expect(beta).toContainText('Basis terms unavailable')
  await through('14:40:00', '14:49:59')
  await expect(beta.getByRole('cell', { name: '25%', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '750.000003 USD', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '250.000001 USD', exact: true })).toBeVisible()
  await through('14:52:00', '14:52:00')
  await expect(beta).toContainText('Awaiting distribution')
  await expect(beta.getByRole('cell', { name: '1200.000002 EUR', exact: true })).toBeVisible()
  await through('14:55:00', '14:58:00')
  await expect(beta).toContainText('Basis allocated')
  await expect(beta.getByRole('cell', { name: '900.000001 EUR', exact: true })).toBeVisible()
  await expect(beta.getByRole('cell', { name: '300.000001 EUR', exact: true })).toBeVisible()
  await expect(basis.getByRole('row', { name: /^ALFA-UNIT/ })).toContainText('Basis terms unavailable')
  await through('14:55:00', '15:02:00')
  await expect(beta).toContainText('No distribution')
  await expect(beta.getByRole('cell', { name: '300.000001 EUR', exact: true })).toHaveCount(0)
  await through('14:40:00', '14:49:59')
  await expect(beta.getByRole('cell', { name: '250.000001 USD', exact: true })).toBeVisible()
  expect(await catalogContents(page)).toEqual(saved)
})

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
