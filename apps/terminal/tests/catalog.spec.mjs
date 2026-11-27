import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { instantiateMarketCore } from '../src/market-core.ts'
import { expect, test } from './fixtures.mjs'
import {
  catalogContents,
  downloadWorkspace,
  header,
  legacyKey,
  microCSV,
  openImport,
  seedLegacy,
  selectBackup,
  submitImport,
} from './catalog-fixtures.mjs'

const alpha = 'LOCAL:MICRO'
const beta = 'XTST:HIDDEN'
const sourceState = {
  version: 1,
  watchlist: [alpha, 'NASDAQ:MSFT'],
  selected: alpha,
  sma: false,
  ema: true,
  imports: [
    { venue: 'local', symbol: 'micro', filename: 'micros.csv', csv: microCSV },
    {
      venue: 'XTST',
      symbol: 'HIDDEN',
      filename: 'private history.csv',
      csv: header + '\n-1,0,0,0,0,2000000000.000000',
    },
  ],
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

async function openBackup(page) {
  await page
    .getByRole('button', { name: 'Workspace backup', exact: true })
    .click()
}

test('Android backup export waits for the native save result and preserves the complete manifest', async ({ page }) => {
  await page.addInitScript(() => {
    window.__MARKETWEFT_ANDROID_WORKSPACE_BACKUP__ = true
    window.androidBackupCalls = []
    window.__TAURI_INTERNALS__ = {
      invoke(command, args) {
        window.androidBackupCalls.push({ command, args })
        return Promise.resolve({ saved: window.androidBackupCalls.length > 1 })
      },
    }
  })
  const downloads = []
  page.on('download', event => downloads.push(event))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  await openBackup(page)
  const exportButton = page.getByRole('button', { name: 'Export workspace', exact: true })
  await exportButton.click()
  await expect(page.getByText('Workspace backup export cancelled.', { exact: true })).toBeVisible()
  await exportButton.click()
  await expect(page.getByText('Workspace backup saved.', { exact: true })).toBeVisible()
  const calls = await page.evaluate(() => window.androidBackupCalls)
  expect(calls).toHaveLength(2)
  for (const { command, args } of calls) {
    expect(command).toBe('plugin:workspace-backup|save')
    expect(args.filename).toMatch(/^marketweft-workspace-\d{4}-\d{2}-\d{2}\.marketweft\.json$/)
    const backup = JSON.parse(args.contents)
    expect(backup.format).toBe('marketweft-workspace')
    expect(backup.manifest.preferences.selected).toBe('NASDAQ:NVDA')
    expect(digest(backup.manifest)).toBe(backup.sha256)
  }
  expect(downloads).toHaveLength(0)
})

test('records declared source permissions and restores the exact grant into a clean catalog', async ({
  page, browser, baseURL,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const before = await catalogContents(page)
  await openImport(page, 'LICENSED', microCSV, 'synthetic-licensed.csv')
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByLabel('Usage grant', { exact: true }).fill('Local chart use under the fixture agreement')
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('restricted')
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Local chart import requires permission to store and display this history.')
  expect(await catalogContents(page)).toEqual(before)
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Storage', exact: true }).selectOption('restricted')
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Local chart import requires permission to store and display this history.')
  expect(await catalogContents(page)).toEqual(before)
  await dialog.getByRole('combobox', { name: 'Storage', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('restricted')
  await dialog.getByLabel('Grant expiration in UTC').fill('2099-12-31')
  await submitImport(page, 'LICENSED')
  const rights = {
    display: 'granted', storage: 'granted', redistribution: 'restricted',
    automatedUse: 'unconfirmed', expiresOn: '2099-12-31',
  }
  const provenance = page.locator('.series-provenance')
  await expect(provenance.getByText('Restricted', { exact: true })).toBeVisible()
  await expect(provenance.getByText(rights.expiresOn, { exact: true })).toBeVisible()
  const bundle = await downloadWorkspace(page)
  expect(bundle.version).toBe(7)
  expect(bundle.sha256).toBe(digest(bundle.manifest))
  const entry = bundle.manifest.series[0]
  expect(entry.descriptor).toMatchObject({ version: 2, sourceRights: rights })
  expect(entry.csv).toBe(microCSV)

  const isolated = await browser.newContext({ baseURL })
  try {
    const clean = await isolated.newPage()
    await clean.goto('/')
    await expect(clean.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
    const initial = await catalogContents(clean)
    await openBackup(clean)
    const invalid = structuredClone(bundle)
    const invalidEntry = invalid.manifest.series[0]
    invalidEntry.descriptor.sourceRights.expiresOn = '2099-02-30'
    const { sha256, ...history } = invalidEntry
    invalidEntry.sha256 = digest(history)
    invalid.sha256 = digest(invalid.manifest)
    await selectBackup(clean, invalid)
    await expect(clean.getByRole('alert')).toHaveText('Use a valid UTC calendar date for the source grant expiry.')
    expect(await catalogContents(clean)).toEqual(initial)

    await selectBackup(clean, bundle)
    const restore = clean.getByRole('button', { name: 'Restore workspace', exact: true })
    await expect(restore).toBeEnabled()
    await restore.click()
    await expect(clean.getByRole('heading', { name: 'LICENSED', exact: true })).toBeVisible()
    expect((await catalogContents(clean)).series[0].descriptor.sourceRights).toEqual(rights)
    expect(await downloadWorkspace(clean)).toEqual(bundle)
  } finally {
    await isolated.close()
  }
})

test('migrates once and restores every source, tick, identity and preference in a clean profile', async ({
  page,
  browser,
  baseURL,
}) => {
  const raw = JSON.stringify(sourceState)
  await seedLegacy(page, raw)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'MICRO', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.quote strong')).toHaveText('1.000001')
  await expect(page.locator('.legend')).toContainText('EMA 9')
  const migrated = await catalogContents(page)
  expect(migrated.series.map((row) => row.id).sort()).toEqual([alpha, beta])
  for (const item of sourceState.imports) {
    const id = (item.venue + ':' + item.symbol).toUpperCase()
    const history = migrated.series.find((row) => row.id === id)
    expect(history.csv).toBe(item.csv)
    expect(history.descriptor).toMatchObject({
      version: 1,
      venue: item.venue.toUpperCase(),
      symbol: item.symbol.toUpperCase(),
      source: item.filename,
      barInterval: 'unspecified',
      adjustmentPolicy: 'unspecified',
    })
  }
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'MICRO', exact: true }),
  ).toBeVisible()
  expect(await catalogContents(page)).toEqual(migrated)
  expect(await page.evaluate((k) => localStorage.getItem(k), legacyKey)).toBe(
    raw,
  )

  await openImport(page, 'NEW', header + '\n0,1,2,0,1,7', 'authorized.csv')
  await page.getByText('Series details', { exact: true }).click()
  await page.getByLabel('Bar interval', { exact: true }).fill('1 minute')
  await page
    .getByLabel('Source', { exact: true })
    .fill('Synthetic research fixture')
  await page
    .getByLabel('Usage grant', { exact: true })
    .fill('Research fixture; redistribution approved')
  await page.getByLabel('Adjustment policy', { exact: true }).fill('Unadjusted')
  await submitImport(page, 'NEW')
  const source = await catalogContents(page)
  expect(
    source.series.find((entry) => entry.id === 'LOCAL:NEW').descriptor,
  ).toEqual({
    version: 1,
    venue: 'LOCAL',
    symbol: 'NEW',
    barInterval: '1 minute',
    source: 'Synthetic research fixture',
    usageGrant: 'Research fixture; redistribution approved',
    adjustmentPolicy: 'Unadjusted',
  })
  const bundle = await downloadWorkspace(page)
  expect(bundle).toMatchObject({
    format: 'marketweft-workspace',
    version: 1,
    manifest: { seriesCount: 3, barCount: 4 },
  })
  expect(bundle.sha256).toBe(digest(bundle.manifest))
  // Golden digest of all bundled timestamps and fixed-point values, in catalog order.
  expect(bundle.manifest.sampleSet).toEqual({
    version: 1,
    sha256: '618256872c46662bbaceb30a79b942c230e725dd01ea71b5e54cc52a359220d8',
  })
  for (const row of bundle.manifest.series) {
    const { sha256, ...entry } = row
    expect(sha256).toBe(digest(entry))
    expect(entry.csv).toBe(
      source.series.find((item) => item.id === entry.id).csv,
    )
  }

  const isolated = await browser.newContext({ baseURL })
  try {
    const clean = await isolated.newPage()
    await clean.goto('/')
    await expect(
      clean.getByRole('heading', { name: 'NVDA', exact: true }),
    ).toBeVisible()
    expect((await catalogContents(clean)).series).toEqual([])
    await openBackup(clean)
    await selectBackup(clean, bundle)
    const restore = clean.getByRole('button', {
      name: 'Restore workspace',
      exact: true,
    })
    await expect(restore).toBeEnabled()
    expect((await catalogContents(clean)).series).toEqual([])
    await restore.click()
    await expect(
      clean.getByRole('heading', { name: 'NEW', exact: true }),
    ).toBeVisible()
    await clean.reload()
    await expect(
      clean.getByRole('heading', { name: 'NEW', exact: true }),
    ).toBeVisible()
    const restored = await catalogContents(clean)
    expect(restored.series).toEqual(source.series)
    const wasm = await readFile(
      new URL('../dist/marketweft_core.wasm', import.meta.url),
    )
    const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer)
    const signatures = Object.fromEntries(
      restored.series.map((row) => [
        row.id,
        core
          .parseCsv(row.csv)
          .map(({ time, open, high, low, close, volume }) => [
            time,
            ...[open, high, low, close, volume].map((n) =>
              Math.round(n * 1_000_000),
            ),
          ]),
      ]),
    )
    expect(signatures).toEqual({
      [alpha]: [
        [1709251199, -1234567, 0, -2000001, -1, 1],
        [1709251200, 0, 1000001, -123456, 1000001, 19000009],
      ],
      [beta]: [[-1, 0, 0, 0, 0, 2000000000000000]],
      'LOCAL:NEW': [[0, 1000000, 2000000, 0, 1000000, 7000000]],
    })
    const exportedAgain = await downloadWorkspace(clean)
    expect(exportedAgain.manifest).toEqual(bundle.manifest)
    expect(exportedAgain.sha256).toBe(bundle.sha256)
    await clean.getByRole('button', { name: 'Select ' + alpha }).click()
    await expect(clean.locator('.quote strong')).toHaveText('1.000001')
    await expect(clean.locator('.ohlc-vol')).toContainText('19.000009')
    await expect(clean.locator('.legend')).toContainText('EMA 9')
    await expect(
      clean.getByRole('button', { name: 'Select ' + beta }),
    ).toHaveCount(0)
  } finally {
    await isolated.close()
  }
})

test('rejects corrupt payloads, mismatched counts and dangling selections before replacement', async ({
  page,
}) => {
  await seedLegacy(page, JSON.stringify(sourceState))
  await page.goto('/')
  const original = await downloadWorkspace(page)
  const before = await catalogContents(page)
  await openBackup(page)
  const restore = page.getByRole('button', {
    name: 'Restore workspace',
    exact: true,
  })
  for (const alter of [
    (b) => {
      b.version += 1
    },
    (b) => {
      b.manifest.preferences.sma = !b.manifest.preferences.sma
    },
    (b) => {
      b.manifest.series[0].csv += '\n'
      b.sha256 = digest(b.manifest)
    },
    (b) => {
      b.manifest.barCount += 1
      b.sha256 = digest(b.manifest)
    },
    (b) => {
      b.manifest.sampleSet.sha256 = '0'.repeat(64)
      b.sha256 = digest(b.manifest)
    },
    (b) => {
      const { sha256, ...row } = b.manifest.series[0]
      row.csv = header + '\n0,3,2,1,0,1'
      row.barCount = 1
      b.manifest.series[0] = { ...row, sha256: digest(row) }
      b.manifest.barCount = b.manifest.series.reduce((n, item) => n + item.barCount, 0)
      b.sha256 = digest(b.manifest)
    },
    (b) => {
      b.manifest.preferences.selected = 'MISSING:ID'
      b.sha256 = digest(b.manifest)
    },
    (b) => {
      b.manifest.series[1] = b.manifest.series[0]
      b.sha256 = digest(b.manifest)
    },
  ]) {
    const changed = structuredClone(original)
    alter(changed)
    await selectBackup(page, changed)
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
    await expect(restore).not.toBeEnabled()
    expect(await catalogContents(page)).toEqual(before)
  }
})

// Abort after a real object-store request succeeds: in a replacement this
// follows the deletion of old rows in the *same* transaction.
test('an interrupted replacement rolls back both catalog and histories', async ({
  page,
}) => {
  await seedLegacy(page, JSON.stringify(sourceState))
  await page.goto('/')
  const previous = await downloadWorkspace(page)
  await openImport(page, 'KEEP', header + '\n1,1,1,1,1,1')
  await submitImport(page, 'KEEP')
  const before = await catalogContents(page)
  await openBackup(page)
  await selectBackup(page, previous)
  await expect(
    page.getByRole('button', { name: 'Restore workspace', exact: true }),
  ).toBeEnabled()
  await page.evaluate(() => {
    window.testAbortedAfterWrite = false
    for (const method of ['put', 'add']) {
      const original = IDBObjectStore.prototype[method]
      IDBObjectStore.prototype[method] = function (...args) {
        const request = original.apply(this, args)
        if (this.name === 'series' || this.name === 'workspace') {
          request.addEventListener(
            'success',
            () => {
              if (!window.testAbortedAfterWrite) {
                window.testAbortedAfterWrite = true
                this.transaction.abort()
              }
            },
            { once: true },
          )
        }
        return request
      }
    }
  })
  await page
    .getByRole('button', { name: 'Restore workspace', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  expect(await page.evaluate(() => window.testAbortedAfterWrite)).toBe(true)
  expect(await catalogContents(page)).toEqual(before)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'KEEP', exact: true }),
  ).toBeVisible()
})

test('a real Chromium origin quota denial keeps the previously committed history', async ({
  browser,
  baseURL,
}) => {
  // Apply the limit before opening IndexedDB. Chromium can reserve headroom
  // during the first commit. Keep unrelated service-worker caches out of this budget.
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const origin = new URL(baseURL).origin
  const quotaBytes = 512 * 1024
  await cdp.send('Storage.overrideQuotaForOrigin', {
    origin,
    quotaSize: quotaBytes,
  })
  try {
    const quota = await cdp.send('Storage.getUsageAndQuota', { origin })
    expect(quota.overrideActive).toBe(true)
    expect(quota.quota).toBe(quotaBytes)
    await seedLegacy(page, JSON.stringify(sourceState))
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'MICRO', exact: true }),
    ).toBeVisible()
    const before = await catalogContents(page)
    const csv = [
      header,
      ...Array.from({ length: 30000 }, (_, i) =>
        [i, i, i + 2, i - 1, i + 1, i].join(','),
      ),
    ].join('\n')
    await openImport(page, 'OVERQUOTA', csv)
    await page.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      /quota|space|storage/i,
    )
    expect(await catalogContents(page)).toEqual(before)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'MICRO', exact: true }),
    ).toBeVisible()
  } finally {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin })
    await cdp.detach()
    await context.close()
  }
})

test('an unreadable v1 JSON document remains recoverable after migration', async ({
  page,
}) => {
  await seedLegacy(page, '{')
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    /could not be read|unreadable/i,
  )
  await expect(
    page.getByRole('heading', { name: 'NVDA', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), legacyKey)).toBe(
    '{',
  )
})

test('an unsupported legacy schema stays intact without creating an active workspace', async ({
  page,
}) => {
  const raw = JSON.stringify({ ...sourceState, version: 99 })
  await seedLegacy(page, raw)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    /version|schema|unsupported/i,
  )
  expect(await page.evaluate((k) => localStorage.getItem(k), legacyKey)).toBe(
    raw,
  )
  expect((await catalogContents(page)).meta).toBeUndefined()
})

test('a second tab refreshes and invalidates a restore preview after a newer commit', async ({
  page,
  context,
}) => {
  await seedLegacy(page, JSON.stringify(sourceState))
  await page.goto('/')
  const baseline = await downloadWorkspace(page)
  const other = await context.newPage()
  await other.goto(page.url())
  await openBackup(other)
  await selectBackup(other, baseline)
  const replace = other.getByRole('button', {
    name: 'Restore workspace',
    exact: true,
  })
  await expect(replace).toBeEnabled()
  await openImport(page, 'NEWER', header + '\n1,1,1,1,1,0')
  await submitImport(page, 'NEWER')
  await expect(replace).toBeDisabled()
  await expect(other.getByRole('dialog')).toContainText(/workspace changed/i)
  await other.keyboard.press('Escape')
  await expect(
    other.getByRole('heading', { name: 'NEWER', exact: true }),
  ).toBeVisible()
  expect((await catalogContents(page)).series).toHaveLength(3)
})

test('migration interrupted after a write is atomic and retries from the untouched source', async ({
  page,
}) => {
  const raw = JSON.stringify(sourceState)
  await seedLegacy(page, raw)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('interrupted-migration')) return
    for (const method of ['put', 'add']) {
      const original = IDBObjectStore.prototype[method]
      IDBObjectStore.prototype[method] = function (...args) {
        const request = original.apply(this, args)
        if (this.name === 'series')
          request.addEventListener(
            'success',
            () => {
              if (!sessionStorage.getItem('interrupted-migration')) {
                sessionStorage.setItem('interrupted-migration', 'yes')
                this.transaction.abort()
              }
            },
            { once: true },
          )
        return request
      }
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem('interrupted-migration')),
  ).toBe('yes')
  expect(await page.evaluate((k) => localStorage.getItem(k), legacyKey)).toBe(
    raw,
  )
  expect(await catalogContents(page)).toEqual({ meta: undefined, series: [] })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'MICRO', exact: true }),
  ).toBeVisible()
  expect((await catalogContents(page)).series).toHaveLength(2)
})
