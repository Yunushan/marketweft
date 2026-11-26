import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const fixture = new URL('../../../crates/core/tests/fixtures/synthetic-provider-revisions.csv', import.meta.url)

test('a signed revision fixture exposes source evidence and gates CSV downloads by its grant', async ({ page, context }) => {
  const csv = await readFile(fixture, 'utf8')
  const signer = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  }
  const manifest = {
    format: 'marketweft-provider-revisions', version: 1,
    provider: 'synthetic-sample', venue: 'DEMO', symbol: 'ALFA',
    grant: 'Synthetic revision fixture agreement',
    permissions: { display: 'granted', storage: 'restricted', redistribution: 'restricted',
      automatedUse: 'unconfirmed', expiresOn: '2099-05-18' },
    csvSha256: createHash('sha256').update(csv).digest('hex'),
  }
  function packet(metadata) {
    const signature = sign('sha256', Buffer.from(canonical(metadata)),
      { key: signer.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    return { ...metadata, csv, signature }
  }
  const signed = packet(manifest)
  await page.clock.setFixedTime(new Date('2099-05-18T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const initial = await catalogContents(page)
  await page.getByRole('button', { name: 'Provider revisions', exact: true }).click()
  await page.getByRole('combobox', { name: 'Provider revision input' }).selectOption('signed')
  const upload = page.getByLabel('Signed provider revision fixture', { exact: true })
  const load = page.getByRole('button', { name: 'Load revisions' })
  const results = page.getByRole('region', { name: 'Observed provider history' })
  async function fixtureFile(value) {
    await upload.setInputFiles({
      name: 'checked-revisions.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
    })
  }
  await fixtureFile(signed)
  await expect(load).toBeDisabled()
  await page.getByLabel('Provider revision verification key').setInputFiles({
    name: 'provider.pub.pem', mimeType: 'application/x-pem-file',
    buffer: Buffer.from(signer.publicKey.export({ type: 'spki', format: 'pem' })),
  })
  for (const [value, message] of [
    [{ ...signed, csv: csv.replace('10.250001', '10.260001') }, 'SHA-256 does not match'],
    [{ ...signed, grant: 'Altered after signing' }, 'signature does not match'],
    [packet({ ...manifest, symbol: 'BETA' }), 'identity does not match'],
    [packet({ ...manifest, permissions: { ...manifest.permissions, display: 'restricted' } }), 'requires granted display'],
  ]) {
    await fixtureFile(value)
    await load.click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(results.getByRole('status')).toContainText('Synthetic provider revisions')
  }
  await fixtureFile(signed)
  await load.click()
  await expect(results.getByRole('status')).toContainText('checked-revisions.json')
  await expect(results.getByText('Verified provider grant Synthetic revision fixture agreement')).toBeVisible()
  await expect(results.getByRole('table').getByText('10.000001', { exact: true }).first()).toBeVisible()
  const details = results.getByText('Verification details', { exact: true })
  await details.click()
  const fingerprint = createHash('sha256').update(signer.publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
  await expect(results.getByText(manifest.csvSha256, { exact: true })).toBeVisible()
  await expect(results.getByText(fingerprint, { exact: true })).toBeVisible()
  const downloads = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  const download = results.getByRole('button', { name: 'Download replay CSV' })
  await download.click()
  await expect(page.getByRole('alert')).toHaveText('Provider replay CSV export requires granted redistribution permission.')
  expect(downloads).toEqual([])

  await fixtureFile(packet({ ...manifest, permissions: { ...manifest.permissions, redistribution: 'granted' } }))
  await load.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const known = page.getByLabel('Revisions known through (UTC)')
  await known.fill('2025-06-02T14:07:00Z')
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(file.suggestedFilename()).toBe('DEMO-ALFA-effective-20250602T140200Z-known-20250602T140359Z.csv')
  const exported = await readFile(await file.path(), 'utf8')
  expect(exported).toBe(csv.split(/\r?\n/).slice(0, 3).concat('').join('\r\n'))

  await known.fill('2025-06-02T14:03:59Z')
  await page.getByRole('combobox', { name: 'Provider revision input' }).selectOption('csv')
  await expect(results.getByText(fingerprint, { exact: true })).toBeVisible()
  const raw = page.getByLabel('Provider revisions CSV')
  await raw.setInputFiles({
    name: 'snapshot.csv', mimeType: 'text/csv', buffer: Buffer.from(exported),
  })
  await load.click()
  await expect(results.getByRole('status')).toContainText('snapshot.csv')
  await expect(details).toHaveCount(0)
  await expect(results.getByText(manifest.csvSha256, { exact: true })).toHaveCount(0)
  await expect(results.getByText(fingerprint, { exact: true })).toHaveCount(0)
  await expect(results.getByRole('table').locator('tbody tr')).toHaveCount(2)

  await page.getByRole('combobox', { name: 'Provider revision input' }).selectOption('signed')
  await fixtureFile(packet({ ...manifest, permissions: { ...manifest.permissions, redistribution: 'granted' } }))
  await page.getByLabel('Provider revision verification key').setInputFiles({
    name: 'provider.pub.pem', mimeType: 'application/x-pem-file',
    buffer: Buffer.from(signer.publicKey.export({ type: 'spki', format: 'pem' })),
  })
  await load.click()
  await expect(results.getByRole('status')).toContainText('checked-revisions.json')
  await expect(details).toBeVisible()
  expect(await catalogContents(page)).toEqual(initial)
  await page.clock.setFixedTime(new Date('2099-05-19T00:00:00Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(results).toHaveCount(0)
  await expect(download).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveText('The provider revision fixture grant has expired.')
  await expect(page.getByRole('button', { name: 'Replay cutoffs' })).toBeDisabled()
  expect(downloads).toHaveLength(1)
})

test('provider replay withdraws a bar at observation and restores it with a later replacement', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Provider revisions', exact: true }).click()
  const effective = page.getByLabel('Bars effective through (UTC)')
  const known = page.getByLabel('Revisions known through (UTC)')
  const replay = page.getByRole('button', { name: 'Replay cutoffs', exact: true })
  const bars = page.getByRole('table', { name: 'Provider history bars' })
  const chart = page.getByRole('region', { name: 'Provider replay chart' })
  const canvas = chart.getByLabel('ALFA interactive candlestick and volume chart')
  const readout = chart.locator('.ohlc')
  const history = page.getByRole('table', { name: 'Provider bar observations' })
  const observations = history.locator('tbody tr')
  const observation = time => observations.filter({
    has: page.getByRole('rowheader', { name: '2025-06-02T' + time + 'Z', exact: true }),
  })
  await effective.fill('2025-06-02T14:00:00Z')
  await known.fill('2025-06-02T14:03:59Z')
  await replay.click()
  await expect(readout).toContainText('C 10.000001')
  await expect(observations).toHaveCount(1)
  await known.fill('2025-06-02T14:05:59Z')
  await replay.click()
  await expect(bars.getByText('10.250001', { exact: true })).toBeVisible()
  await expect(canvas).toBeVisible()
  await expect(readout).toContainText('C 10.250001')
  await expect(readout).toContainText('Observed at 2025-06-02 14:04:00 UTC')
  await expect(observations).toHaveCount(2)
  await known.fill('2025-06-02T14:06:00Z')
  await replay.click()
  await expect(page.getByText('No bars meet these cutoffs.')).toBeVisible()
  await expect(chart).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download replay CSV' })).toHaveCount(0)
  await expect(observations).toHaveCount(3)
  await expect(observation('14:06:00')).toContainText('Withdraw')
  await known.fill('2025-06-02T14:07:00Z')
  await replay.click()
  await expect(bars.getByText('10.400001', { exact: true })).toBeVisible()
  await expect(bars.getByText('100.000003', { exact: true })).toBeVisible()
  await expect(canvas).toBeVisible()
  await expect(readout).toContainText('C 10.400001')
  await expect(readout).toContainText('Vol 100.000003')
  await expect(readout).toContainText('Observed at 2025-06-02 14:07:00 UTC')
  await expect(observations).toHaveCount(4)
  await expect(observation('14:07:00')).toContainText('10.400001')
  await expect(observation('14:00:00')).toContainText('10.000001')
  await known.fill('2025-06-02T14:05:59Z')
  await replay.click()
  await expect(bars.getByText('10.250001', { exact: true })).toBeVisible()
  await expect(readout).toContainText('C 10.250001')
  await expect(readout).toContainText('Observed at 2025-06-02 14:04:00 UTC')
  await expect(observations).toHaveCount(2)

  await page.getByLabel('Bar timestamp (UTC)').fill('2025-06-02T14:01:00Z')
  await page.getByRole('button', { name: 'Inspect bar' }).click()
  await expect(page.getByText('No bar observations meet these cutoffs.')).toBeVisible()
  await effective.fill('2025-06-02T14:01:00Z')
  await replay.click()
  await expect(observations).toHaveCount(1)
  await expect(observation('14:05:00')).toContainText('11.750001')
  await page.getByLabel('Bar timestamp (UTC)').fill('2025-02-30T14:01:00Z')
  await page.getByRole('button', { name: 'Inspect bar' }).click()
  await expect(page.getByRole('alert')).toContainText('The bar time requires')
  await expect(observation('14:05:00')).toContainText('11.750001')
})

test('provider revisions replay before and after corrections at separate UTC cutoffs offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const initial = await catalogContents(page)
  const open = page.getByRole('button', { name: 'Provider revisions', exact: true })
  await open.click()
  await expect(page.getByRole('heading', { name: 'Provider revisions', exact: true })).toBeFocused()
  const results = page.getByRole('region', { name: 'Observed provider history' })
  const rows = results.getByRole('table').locator('tbody tr')
  const bar = at => rows.filter({ has: page.getByRole('rowheader', { name: at, exact: true }) })
  const effective = page.getByLabel('Bars effective through (UTC)')
  const known = page.getByLabel('Revisions known through (UTC)')
  const apply = page.getByRole('button', { name: 'Replay cutoffs', exact: true })
  const chart = results.getByRole('region', { name: 'Provider replay chart' })
  const canvas = chart.getByLabel('ALFA interactive candlestick and volume chart')
  const readout = chart.locator('.ohlc')

  await expect(rows).toHaveCount(2)
  await expect(bar('2025-06-02T14:00:00Z').getByRole('cell').nth(4)).toHaveText('10.000001')
  await expect(bar('2025-06-02T14:01:00Z')).toHaveCount(0)
  await known.fill('2025-06-02T14:04:00Z')
  await apply.click()
  await expect(bar('2025-06-02T14:00:00Z').getByRole('cell').nth(4)).toHaveText('10.250001')
  await expect(bar('2025-06-02T14:00:00Z').getByRole('cell').nth(0)).toHaveText('2025-06-02T14:04:00Z')
  await known.fill('2025-06-02T14:05:00Z')
  await apply.click()
  await expect(rows).toHaveCount(3)
  await expect(bar('2025-06-02T14:01:00Z').getByRole('cell').nth(4)).toHaveText('11.750001')
  await expect(readout).toContainText('Observed at 2025-06-02 14:02:00 UTC')
  await canvas.hover({ position: { x: 75, y: 40 } })
  await expect(readout).toContainText('C 10.250001')
  await expect(readout).toContainText('Observed at 2025-06-02 14:04:00 UTC')
  await effective.fill('2025-06-02T14:01:00Z')
  await apply.click()
  await expect(rows).toHaveCount(2)
  await expect(bar('2025-06-02T14:02:00Z')).toHaveCount(0)

  const csv = await readFile(fixture, 'utf8')
  const upload = page.getByLabel('Provider revisions CSV')
  await upload.setInputFiles({ name: 'checked-revisions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('button', { name: 'Load revisions' }).click()
  await expect(results.getByRole('status')).toContainText('checked-revisions.csv')
  await known.fill('2025-06-02T14:03:59Z')
  await apply.click()
  await expect(rows).toHaveCount(1)
  await expect(bar('2025-06-02T14:00:00Z').getByRole('cell').nth(4)).toHaveText('10.000001')
  await upload.setInputFiles({
    name: 'invalid-revisions.csv', mimeType: 'text/csv',
    buffer: Buffer.from(csv.replace('10.500001', '1')),
  })
  await page.getByRole('button', { name: 'Load revisions' }).click()
  await expect(page.getByRole('alert')).toContainText('High and low must enclose')
  await expect(results.getByRole('status')).toContainText('checked-revisions.csv')
  await page.setViewportSize({ width: 360, height: 800 })
  await expect(results.getByLabel('ALFA interactive candlestick and volume chart')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  expect(await catalogContents(page)).toEqual(initial)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(open).toBeFocused()
})
