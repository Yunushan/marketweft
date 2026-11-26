import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { expect, test } from './fixtures.mjs'
import { catalogContents, downloadWorkspace, microCSV, selectBackup, submitImport } from './catalog-fixtures.mjs'

const fixture = {
  format: 'marketweft-provider-history',
  version: 1,
  provider: 'synthetic-sample',
  venue: 'DEMO',
  symbol: 'LICENSED',
  barInterval: '1 second',
  grant: 'Synthetic fixture agreement 1',
  adjustmentPolicy: 'Raw OHLCV',
  permissions: {
    display: 'granted', storage: 'granted', redistribution: 'restricted',
    automatedUse: 'unconfirmed', expiresOn: '2099-12-31',
  },
  csv: microCSV,
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

function signedFixture(privateKey, symbol = fixture.symbol) {
  const { csv, ...metadata } = fixture
  const manifest = { ...metadata, symbol, version: 3, csvSha256: createHash('sha256').update(csv).digest('hex') }
  const signature = sign('sha256', Buffer.from(canonical(manifest)),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return { manifest, signed: { ...manifest, csv, signature }, csv }
}

test('provider verification keys activate inclusively and retire exclusively at UTC cutoffs', async ({ page }) => {
  const signer = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const { signed } = signedFixture(signer.privateKey, 'TIMED')
  const entry = {
    provider: fixture.provider,
    pem: signer.publicKey.export({ type: 'spki', format: 'pem' }),
    validFrom: '2099-12-31T14:00:00Z',
    validUntil: '2099-12-31T14:30:00Z',
  }
  await page.clock.setFixedTime(new Date('2099-12-31T13:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const initial = await catalogContents(page)
  const dialog = page.getByRole('dialog')
  async function open() {
    await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
    await dialog.getByLabel('Provider history JSON', { exact: true }).setInputFiles({
      name: 'timed.provider.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(signed)),
    })
  }
  async function registry(key) {
    await dialog.getByLabel('Provider verification key or registry', { exact: true }).setInputFiles({
      name: 'timed-keys.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'marketweft-provider-key-registry', version: 2, keys: [key] })),
    })
  }
  async function failure(message) {
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
  }
  const inactive = 'The provider key registry has no active key at the current UTC time.'
  await open()
  await registry({ ...entry, validFrom: '2099-02-30T14:00:00Z' })
  await failure('Use whole UTC seconds for provider key activation and retirement.')
  await registry({ ...entry, validUntil: entry.validFrom })
  await failure('Provider key retirement must follow activation.')
  await registry(entry)
  await failure(inactive)
  expect(await catalogContents(page)).toEqual(initial)
  await page.clock.setFixedTime(new Date(entry.validFrom))
  await submitImport(page, 'TIMED')
  const saved = await catalogContents(page)
  expect(saved.series[0].id).toBe('DEMO:TIMED')

  await page.clock.setFixedTime(new Date(entry.validUntil))
  await open()
  await registry(entry)
  await failure(inactive)
  expect(await catalogContents(page)).toEqual(saved)
})

test('a provider key registry scopes and rotates accepted public keys', async ({ page }) => {
  const previous = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const next = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const first = signedFixture(previous.privateKey).signed
  const rotated = signedFixture(next.privateKey, 'ROTATED').signed
  const providerEntry = (pair, provider = fixture.provider) => ({
    provider, pem: pair.publicKey.export({ type: 'spki', format: 'pem' }),
  })
  const fingerprint = pair => createHash('sha256').update(pair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const initial = await catalogContents(page)
  const dialog = page.getByRole('dialog')
  const mismatch = 'The provider history signature does not match the supplied key and manifest.'
  async function open() {
    await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
  }
  async function select(packet, keys) {
    await dialog.getByLabel('Provider history JSON', { exact: true }).setInputFiles({
      name: 'signed.provider.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)),
    })
    await dialog.getByLabel('Provider verification key or registry', { exact: true }).setInputFiles({
      name: 'keys.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'marketweft-provider-key-registry', version: 1, keys })),
    })
  }
  await open()
  await select(rotated, [providerEntry(next, 'other-provider')])
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('The provider key registry has no key for this provider.')
  await select(rotated, [providerEntry(previous), providerEntry(next, 'other-provider')])
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(mismatch)
  expect(await catalogContents(page)).toEqual(initial)

  await select(first, [providerEntry(previous)])
  await submitImport(page, 'LICENSED')
  expect((await catalogContents(page)).series[0].descriptor.providerVerification.keySha256).toBe(fingerprint(previous))
  await open()
  await select(rotated, [providerEntry(previous), providerEntry(next)])
  await submitImport(page, 'ROTATED')
  const accepted = await catalogContents(page)
  expect(accepted.series.find(row => row.id === 'DEMO:ROTATED').descriptor.providerVerification.keySha256)
    .toBe(fingerprint(next))
  await open()
  await select(first, [providerEntry(next)])
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(mismatch)
  expect(await catalogContents(page)).toEqual(accepted)
})

test('a supplied key verifies provider rights and preserves its fingerprint and CSV digest on restore', async ({
  page, browser, baseURL,
}) => {
  const trusted = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const wrongKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey
  const { manifest, signed, csv } = signedFixture(trusted.privateKey)

  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const before = await catalogContents(page)
  const dialog = page.getByRole('dialog')
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
  const mismatch = 'The provider history signature does not match the supplied key and manifest.'
  async function select(value) {
    await dialog.getByLabel('Provider history JSON', { exact: true }).setInputFiles({
      name: 'signed.provider.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
    })
  }
  async function key(publicKey) {
    await dialog.getByLabel('Provider verification key or registry', { exact: true }).setInputFiles({
      name: 'provider.pem', mimeType: 'application/x-pem-file',
      buffer: Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })),
    })
  }
  async function reject(value, message) {
    await select(value)
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
  }

  await reject(signed, 'Choose the provider verification public key for this signed fixture.')
  await key(wrongKey)
  await reject(signed, mismatch)
  await key(trusted.publicKey)
  await reject({ ...manifest, version: 2, csv }, 'A provider verification key requires a signed version 3 fixture.')
  await reject({ ...signed, provider: 'different-provider' }, mismatch)
  await reject({ ...signed, permissions: { ...signed.permissions, redistribution: 'granted' } }, mismatch)
  expect(await catalogContents(page)).toEqual(before)

  await select(signed)
  await submitImport(page, 'LICENSED')
  const keySha256 = createHash('sha256').update(trusted.publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
  const verification = { keySha256, csvSha256: manifest.csvSha256 }
  expect((await catalogContents(page)).series[0]).toMatchObject({
    csv,
    descriptor: {
      version: 3, source: fixture.provider, usageGrant: fixture.grant,
      sourceRights: fixture.permissions, providerVerification: verification,
    },
  })
  await expect(page.locator('.series-provenance').getByText(keySha256, { exact: true })).toBeVisible()
  await expect(page.locator('.series-provenance').getByText(manifest.csvSha256, { exact: true })).toBeVisible()
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(8)
  expect(backup.manifest.series[0].descriptor.providerVerification).toEqual(verification)

  const isolated = await browser.newContext({ baseURL })
  try {
    const clean = await isolated.newPage()
    await clean.goto('/')
    await expect(clean.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
    const original = await catalogContents(clean)
    await clean.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    const corrupted = structuredClone(backup)
    const entry = corrupted.manifest.series[0]
    entry.csv = entry.csv.replace(',1.000001,19.000009', ',1,19.000009')
    delete entry.sha256
    entry.sha256 = createHash('sha256').update(canonical(entry)).digest('hex')
    corrupted.sha256 = createHash('sha256').update(canonical(corrupted.manifest)).digest('hex')
    await selectBackup(clean, corrupted)
    await expect(clean.getByRole('alert')).toHaveText('A verified provider CSV does not match its recorded digest.')
    expect(await catalogContents(clean)).toEqual(original)
    await selectBackup(clean, backup)
    const restore = clean.getByRole('button', { name: 'Restore workspace', exact: true })
    await expect(restore).toBeEnabled()
    await restore.click()
    await expect(clean.getByRole('heading', { name: 'LICENSED', exact: true })).toBeVisible()
    expect((await catalogContents(clean)).series[0].descriptor.providerVerification).toEqual(verification)
    expect(await downloadWorkspace(clean)).toEqual(backup)
  } finally {
    await isolated.close()
  }
})

test('version 2 provider fixtures verify exact embedded CSV bytes before catalog writes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const before = await catalogContents(page)
  const packet = {
    ...fixture,
    version: 2,
    csvSha256: createHash('sha256').update(fixture.csv, 'utf8').digest('hex'),
  }
  const dialog = page.getByRole('dialog')
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
  async function select(value) {
    await dialog.getByLabel('Provider history JSON', { exact: true }).setInputFiles({
      name: 'verified.provider.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    })
  }
  async function reject(value, message) {
    await select(value)
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
  }
  await reject({ ...packet, csvSha256: 'short' },
    'Supply the provider CSV SHA-256 as 64 lowercase hexadecimal characters.')
  const edited = fixture.csv.replace(',1.000001,19.000009', ',1,19.000009')
  expect(edited).not.toBe(fixture.csv)
  await reject({ ...packet, csv: edited }, 'The provider CSV SHA-256 does not match the fixture.')
  await reject({ ...packet, csv: fixture.csv.replaceAll('\r\n', '\n') },
    'The provider CSV SHA-256 does not match the fixture.')
  expect(await catalogContents(page)).toEqual(before)
  await select(packet)
  await submitImport(page, 'LICENSED')
  expect((await catalogContents(page)).series[0].csv).toBe(fixture.csv)
})

test('provider fixture preflight checks identity, permissions and UTC expiry before catalog writes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const before = await catalogContents(page)
  const dialog = page.getByRole('dialog')
  async function openProviderImport() {
    await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
  }
  async function select(packet) {
    await dialog.getByLabel('Provider history JSON', { exact: true }).setInputFiles({
      name: 'history.provider.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(packet)),
    })
  }
  async function rejects(packet, message) {
    await select(packet)
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
  }

  await openProviderImport()
  expect(await dialog.getByLabel('Symbol', { exact: true }).count()).toBe(0)
  await rejects({ ...fixture, provider: 'Invalid/Provider' }, 'Supply a lowercase provider identifier.')
  await rejects({ ...fixture, grant: '' }, 'Missing or empty provider grant.')
  await rejects({
    ...fixture,
    permissions: { ...fixture.permissions, storage: 'unconfirmed' },
  }, 'A provider history fixture requires granted display and storage permissions.')
  const { expiresOn, ...undated } = fixture.permissions
  await rejects({
    ...fixture, permissions: undated,
  }, 'A provider history fixture requires a UTC grant expiration date.')
  await rejects({
    ...fixture, permissions: { ...fixture.permissions, expiresOn: '2099-12-30' },
  }, 'The provider history fixture grant has expired.')
  expect(await catalogContents(page)).toEqual(before)

  await select(fixture)
  await submitImport(page, 'LICENSED')
  const committed = await catalogContents(page)
  expect(committed.series).toHaveLength(1)
  expect(committed.series[0]).toMatchObject({
    id: 'DEMO:LICENSED', csv: microCSV, barCount: 2,
    descriptor: {
      version: 2, source: fixture.provider, usageGrant: fixture.grant,
      sourceRights: { ...undated, expiresOn },
    },
  })

  await page.clock.setFixedTime(new Date('2100-01-01T00:00:00.000Z'))
  await openProviderImport()
  await rejects({ ...fixture, symbol: 'AFTER' }, 'The provider history fixture grant has expired.')
  expect(await catalogContents(page)).toEqual(committed)
  await page.keyboard.press('Escape')
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(7)
  expect(backup.manifest.series[0].descriptor).toEqual(committed.series[0].descriptor)
})
