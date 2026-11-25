import { expect } from './fixtures.mjs'
import { readFile } from 'node:fs/promises'

export const legacyKey = 'marketweft.workspace.v1'
export const header = 'time,open,high,low,close,volume'
export const microCSV = [
  header,
  '2024-02-29T23:59:59Z,-1.234567,0,-2.000001,-0.000001,0.000001',
  '2024-03-01T00:00:00Z,0,1.000001,-0.123456,1.000001,19.000009',
].join('\r\n')

export async function seedLegacy(page, raw) {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('legacy-fixture-created')) return
      sessionStorage.setItem('legacy-fixture-created', 'yes')
      localStorage.setItem(key, value)
    },
    [legacyKey, raw],
  )
}

export async function catalogContents(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('marketweft.catalog')
        open.onerror = () => reject(open.error)
        open.onupgradeneeded = () => open.transaction.abort()
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['workspace', 'series'], 'readonly')
          const meta = tx.objectStore('workspace').get('active')
          const series = tx.objectStore('series').getAll()
          tx.oncomplete = () => {
            db.close()
            resolve({ meta: meta.result, series: series.result })
          }
          tx.onabort = () => {
            db.close()
            reject(tx.error)
          }
        }
      }),
  )
}

export async function openImport(page, symbol, csv, filename = 'history.csv') {
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  await page.getByLabel('Symbol', { exact: true }).fill(symbol)
  await page.locator('input[type=file]').setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
}

export async function submitImport(page, symbol) {
  await page.getByRole('button', { name: 'Import to watchlist' }).click()
  await expect(
    page.getByRole('heading', { name: symbol, exact: true }),
  ).toBeVisible()
}

export async function downloadWorkspace(page) {
  await page
    .getByRole('button', { name: 'Workspace backup', exact: true })
    .click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export workspace', exact: true })
    .click()
  const file = await download
  expect(await file.failure()).toBeNull()
  const value = JSON.parse(await readFile(await file.path(), 'utf8'))
  await page.keyboard.press('Escape')
  return value
}

export async function selectBackup(page, bundle) {
  await page.getByLabel('Backup file', { exact: true }).setInputFiles({
    name: 'history.marketweft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  })
}
