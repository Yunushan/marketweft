import { expect, test } from './fixtures.mjs'

test('Escape during a pending preference save closes the dialog after the write is durable', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Indicators/ }).click()

  // An earlier reader keeps the application's next write queued. Release it
  // after Escape, so the race occurs regardless of filesystem or runner speed.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('marketweft.catalog')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('workspace', 'readonly')
          const store = tx.objectStore('workspace')
          let held = true
          window.releaseCatalogReader = () => {
            held = false
          }
          tx.oncomplete = () => db.close()
          tx.onabort = () => {
            db.close()
            reject(tx.error)
          }
          function hold() {
            if (held) store.get('active').onsuccess = hold
          }
          store.get('active').onsuccess = () => {
            hold()
            resolve()
          }
        }
      }),
  )

  try {
    const ema = page.getByRole('checkbox', { name: /Exponential/ })
    await ema.check()
    await expect(ema).toBeDisabled()
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
      'Saving preferences…',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
  } finally {
    await page.evaluate(() => window.releaseCatalogReader())
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.legend')).toContainText('EMA 9')
})
