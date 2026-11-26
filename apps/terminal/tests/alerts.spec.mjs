import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

async function open(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open replay alerts' }).click()
  await expect(page.getByRole('heading', { name: 'Replay alerts', exact: true })).toBeFocused()
}

async function demo(page) {
  await open(page)
  await page.getByRole('button', { name: 'Start alert demo' }).click()
}

test('offline alert inbox deduplicates across two tabs, replay and reload', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await demo(page)
  const preview = page.getByRole('region', { name: 'Alert preview' })
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  await page.getByRole('button', { name: 'First crossing' }).click()
  await expect(preview.getByRole('rowheader')).toHaveText(['LEVEL/R1/O2'])
  await page.getByRole('button', { name: 'Correction observed' }).click()
  const corrected = preview.getByRole('row', { name: /^MEAN\/R1\/O2C/ })
  await corrected.getByText('Show evidence', { exact: true }).click()
  await expect(corrected).toContainText('Comparator 15 ÷ 3')
  await expect(corrected).toContainText('Comparator 12 ÷ 3')
  await page.getByRole('button', { name: 'Full alert replay' }).click()
  await expect(preview.getByRole('rowheader')).toHaveCount(8)

  const second = await context.newPage()
  try {
    await second.goto(page.url())
    await demo(second)
    await second.getByRole('button', { name: 'Full alert replay' }).click()
    await Promise.all([page, second].map(tab => tab.getByRole('button', { name: 'Save to alert inbox' }).click()))
    const result = tab => tab.getByRole('region', { name: 'Alert inbox' }).getByRole('status')
    await Promise.all([page, second].map(tab => expect(result(tab)).toHaveText(/^[08] new alerts saved\.$/)))
    expect((await Promise.all([result(page).textContent(), result(second).textContent()])).sort())
      .toEqual(['0 new alerts saved.', '8 new alerts saved.'])
    await expect(inbox.getByRole('rowheader')).toHaveCount(8)
  } finally {
    await second.close()
  }

  await page.getByRole('button', { name: 'First crossing' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(inbox.getByRole('status')).toHaveText('0 new alerts saved.')
  await page.reload()
  await open(page)
  await expect(inbox.getByRole('rowheader')).toHaveCount(8)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
})

test('different evidence under the same alert ID aborts the whole inbox batch', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Research terminal' }).waitFor()
  const original = await catalogContents(page)
  await demo(page)
  await page.getByRole('button', { name: 'Full alert replay' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  await expect(inbox.getByRole('status')).toHaveText('8 new alerts saved.')
  await page.getByRole('button', { name: 'Change alert data' }).click()
  const read = name => readFile(new URL('../../../crates/core/tests/fixtures/synthetic-alert-' + name + '.csv', import.meta.url), 'utf8')
  const [rules, observations] = await Promise.all([read('rules'), read('observations')])
  const input = (label, name, content) => page.getByLabel(label).setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(content),
  })
  await input('Alert rules CSV', 'rules.csv', rules)
  await input('Alert observations CSV', 'changes.csv',
    observations.replaceAll('14:02:00Z,6', '14:02:00Z,6.1') +
    'O9,DEMO.CLOSE,2025-04-03T14:09:00Z,2025-04-03T14:09:00Z,4\n')
  await page.getByRole('button', { name: 'Load alert data' }).click()
  await expect(page.getByRole('region', { name: 'Alert preview' }).getByRole('rowheader'))
    .toContainText(['MEAN/R1/O9'])
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(inbox.getByRole('alert')).toContainText('different evidence')
  await expect(inbox.getByRole('rowheader')).toHaveCount(8)
  await expect(inbox.getByText('MEAN/R1/O9', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})

test('bounded retries recover interrupted inbox writes and stop after the third attempt', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction
    window.alertAborts = 2
    window.alertAttempts = 0
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = original.apply(this, args)
      if (this.name === 'marketweft.alert-inbox' && args[1] === 'readwrite') {
        window.alertAttempts++
        if (window.alertAborts > 0) {
          window.alertAborts--
          queueMicrotask(() => tx.abort())
        }
      }
      return tx
    }
  })
  await page.goto('/')
  await demo(page)
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  await page.getByRole('button', { name: 'First crossing' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(inbox.getByRole('status')).toHaveText('1 new alert saved.')
  expect(await page.evaluate(() => window.alertAttempts)).toBe(3)
  await page.evaluate(() => { window.alertAborts = 5; window.alertAttempts = 0 })
  await page.getByRole('button', { name: 'Full alert replay' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(inbox.getByRole('alert')).toContainText('interrupted')
  expect(await page.evaluate(() => window.alertAttempts)).toBe(3)
  await expect(inbox.getByRole('rowheader')).toHaveText(['LEVEL/R1/O2'])
})
