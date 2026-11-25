import { expect, test } from './fixtures.mjs'
import {
  catalogContents,
  legacyKey,
  microCSV,
  seedLegacy,
} from './catalog-fixtures.mjs'

const original = JSON.stringify({
  version: 1,
  selected: 'LOCAL:FX',
  watchlist: ['LOCAL:FX'],
  sma: true,
  ema: false,
  imports: [
    { venue: 'LOCAL', symbol: 'FX', filename: 'fx.csv', csv: microCSV },
  ],
})

test('migration verifies the actual persisted CSV before its transaction can commit', async ({
  page,
}) => {
  await seedLegacy(page, original)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('readback-tested')) return
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (record, ...args) {
      if (this.name === 'series') {
        sessionStorage.setItem('readback-tested', 'yes')
        record = { ...record, csv: record.csv + '\n' }
      }
      return add.call(this, record, ...args)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    /read-back verification failed/i,
  )
  expect(await catalogContents(page)).toEqual({ meta: undefined, series: [] })
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyKey),
  ).toBe(original)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  expect((await catalogContents(page)).series[0].csv).toBe(microCSV)
})

test('an orphaned history is preserved when the catalog has lost its head', async ({
  page,
}) => {
  await seedLegacy(page, original)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  const before = await catalogContents(page)
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('marketweft.catalog')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('workspace', 'readwrite')
          tx.objectStore('workspace').delete('active')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onabort = () => {
            db.close()
            reject(tx.error)
          }
        }
      }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText(
    /series exist without a workspace/i,
  )
  expect(await catalogContents(page)).toEqual({
    meta: undefined,
    series: before.series,
  })
})

test('denied access to legacy storage leaves the catalog empty until migration can retry', async ({
  page,
}) => {
  await seedLegacy(page, original)
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('denied-legacy-read')) return
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (name) {
      if (this === localStorage && name === key) {
        sessionStorage.setItem('denied-legacy-read', 'yes')
        throw new DOMException('Storage unavailable', 'SecurityError')
      }
      return get.call(this, name)
    }
  }, legacyKey)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    /cannot read the previous workspace/i,
  )
  expect(await catalogContents(page)).toEqual({ meta: undefined, series: [] })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyKey),
  ).toBe(original)
})

test('a legacy edit during migration aborts the stale transaction and the retry takes the new settings', async ({
  page,
}) => {
  await seedLegacy(page, original)
  const newer = JSON.stringify({
    ...JSON.parse(original),
    sma: false,
    ema: true,
  })
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('late-v1-edit')) return
      const add = IDBObjectStore.prototype.add
      IDBObjectStore.prototype.add = function (...args) {
        const pending = add.apply(this, args)
        if (this.name === 'series')
          pending.addEventListener(
            'success',
            () => {
              sessionStorage.setItem('late-v1-edit', 'yes')
              localStorage.setItem(key, value)
            },
            { once: true },
          )
        return pending
      }
    },
    [legacyKey, newer],
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    /legacy workspace changed during migration/i,
  )
  expect(await catalogContents(page)).toEqual({ meta: undefined, series: [] })
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyKey),
  ).toBe(newer)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'FX', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.legend')).toContainText('EMA 9')
  await expect(page.locator('.legend')).not.toContainText('SMA 20')
})
