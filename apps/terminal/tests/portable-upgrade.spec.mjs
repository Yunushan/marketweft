import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { cp, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { startTerminal } from '../../../scripts/serve-terminal.mjs'

const dist = process.env.MARKETWEFT_PORTABLE_ROOT ? join(process.env.MARKETWEFT_PORTABLE_ROOT, 'dist') :
  fileURLToPath(new URL('../dist/', import.meta.url))
const activeCache = worker => /const current = prefix \+ '([a-f0-9]+)'/.exec(worker)?.[1]

async function closeServer(server) {
  const closed = once(server, 'close')
  server.close()
  server.closeAllConnections()
  await closed
}

async function expectOfflineReplay(page, module, cacheName) {
  expect(await page.evaluate(async ({ name, module }) => {
    const cache = await caches.open(name)
    return Boolean(await cache.match(new URL('/assets/' + module, location.origin)))
  }, { name: cacheName, module })).toBe(true)
  const requested = page.waitForRequest(request => new URL(request.url()).pathname === '/assets/' + module)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await expect(page.getByRole('button', { name: 'Open universe replay' })).toBeVisible()
  await requested
}

test('portable browser upgrade keeps each offline page on its own cached build', async ({ page, context }, testInfo) => {
  const candidate = testInfo.outputPath('replacement')
  await cp(dist, candidate, { recursive: true })
  const assetDir = join(candidate, 'assets')
  const assets = await readdir(assetDir)
  const lazyChunk = assets.find(name => /^HistoricalReplay-.+\.js$/.test(name))
  const entry = assets.find(name => /^index-.+\.js$/.test(name))
  assert.ok(lazyChunk && entry)
  const nextChunk = lazyChunk.replace(/\.js$/, '-upgrade.js')
  const entryPath = join(assetDir, entry)
  const entryText = await readFile(entryPath, 'utf8')
  assert.ok(entryText.includes(lazyChunk))
  const nextEntry = entry.replace(/\.js$/, '-upgrade.js')
  await rename(join(assetDir, lazyChunk), join(assetDir, nextChunk))
  await rename(entryPath, join(assetDir, nextEntry))
  for (const asset of await readdir(assetDir)) {
    if (!asset.endsWith('.js')) continue
    const path = join(assetDir, asset)
    const text = await readFile(path, 'utf8')
    const updated = text.replaceAll(lazyChunk, nextChunk).replaceAll(entry, nextEntry)
    if (updated !== text) await writeFile(path, updated)
  }
  const htmlPath = join(candidate, 'index.html')
  const html = await readFile(htmlPath, 'utf8')
  assert.ok(html.includes(entry))
  await writeFile(htmlPath, html.replaceAll(entry, nextEntry))

  const workerPath = join(candidate, 'sw.js')
  const worker = await readFile(workerPath, 'utf8')
  const firstHash = activeCache(worker)
  assert.ok(firstHash && worker.includes(lazyChunk))
  const nextHash = createHash('sha256').update(worker).update(nextChunk).digest('hex').slice(0, 20)
  await writeFile(workerPath, worker.replace(firstHash, nextHash)
    .replaceAll(lazyChunk, nextChunk).replaceAll(entry, nextEntry))

  let server = await startTerminal(dist, 0)
  try {
    const port = server.address().port
    const url = 'http://127.0.0.1:' + port
    const cacheName = hash => 'marketweft/' + url + '//' + hash
    await page.goto(url)
    await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    await page.getByRole('button', { name: 'Import CSV' }).click()
    await page.getByRole('textbox', { name: 'Symbol' }).fill('UPGRADECACHE')
    await page.locator('input[type=file]').setInputFiles({
      name: 'synthetic-upgrade.csv', mimeType: 'text/csv',
      buffer: Buffer.from('time,open,high,low,close,volume\n2025-01-01,10,15,9,12,45\n2025-01-02,12,17,10,14,55'),
    })
    await page.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(page.locator('.quote strong')).toHaveText('14.00')

    await closeServer(server)
    server = await startTerminal(candidate, port)
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update() })
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed')
    expect(await page.evaluate(async () => (await caches.keys()).sort())).toEqual([cacheName(firstHash), cacheName(nextHash)].sort())
    await expect(page.getByText('Update ready. Close all MarketWeft tabs and reopen this address.', { exact: true })).toBeVisible()

    await closeServer(server)
    await assert.rejects(fetch(url), { name: 'TypeError' })
    await expectOfflineReplay(page, lazyChunk, cacheName(firstHash))
    await page.close()

    const reopened = await context.newPage()
    await reopened.goto(url)
    await expect.poll(() => reopened.evaluate(async () => {
      const keys = await caches.keys()
      return { keys, controlled: navigator.serviceWorker.controller !== null }
    })).toEqual({ keys: [cacheName(nextHash)], controlled: true })
    await expect(reopened.locator('script[type=module]')).toHaveAttribute('src', './assets/' + nextEntry)
    await expect(reopened.getByRole('heading', { name: 'UPGRADECACHE', exact: true })).toBeVisible()
    await expect(reopened.locator('.quote strong')).toHaveText('14.00')
    await expectOfflineReplay(reopened, nextChunk, cacheName(nextHash))
  } finally {
    if (server.listening) await closeServer(server)
  }
})
