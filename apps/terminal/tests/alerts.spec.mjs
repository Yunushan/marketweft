import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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

const readAlertFixture = name => readFile(new URL('../../../crates/core/tests/fixtures/synthetic-alert-' + name + '.csv', import.meta.url))

async function eventFile(page, row) {
  await row.getByText('Show evidence', { exact: true }).click()
  const pending = page.waitForEvent('download')
  await row.getByRole('button', { name: 'Download webhook event' }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe('marketweft-crossing-event.json')
  return JSON.parse(await readFile(await file.path(), 'utf8'))
}

test('offline crossing exports preserve the rule, both observations and exact comparators', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await demo(page)
  await page.getByRole('button', { name: 'Correction observed' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  await expect(inbox.getByRole('rowheader')).toHaveCount(3)
  await page.reload()
  await open(page)
  const threshold = await eventFile(page, inbox.getByRole('row', { name: /^LEVEL\/R1\/O2 / }))
  expect(threshold).toMatchObject({
    id: 'crossing:LEVEL:R1:O2', kind: 'threshold-crossing', observed_at: '2025-04-03T14:02:00Z',
    data: {
      alert_id: 'LEVEL/R1/O2', direction: 'above', rule: { id: 'LEVEL', revision: 'R1', operand: '5000000' },
      current: { id: 'O2', ticks: '6000000', comparisonNumerator: '5000000', comparisonCount: 1 },
    },
  })
  const sma = await eventFile(page, inbox.getByRole('row', { name: /^MEAN\/R1\/O2C / }))
  const fixture = new URL('../../research-service/tests/fixtures/crossing-webhook-event.json', import.meta.url)
  expect(sma).toEqual(JSON.parse(await readFile(fixture, 'utf8')))
})

test('crossing grant binds exact bytes and enforces current permission across tabs and reload', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2025-04-04T12:00:00Z'))
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const catalog = await catalogContents(page)
  await context.setOffline(true)
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('marketweft.alert-inbox', 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('notifications', { keyPath: 'id' })
      store.createIndex('observed', 'current.observedAt')
      store.add({
        schemaVersion: 1, id: 'LEGACY/R1/O1', direction: 'above',
        rule: { id: 'LEGACY', revision: 'R1', series: 'OLD', effectiveAt: 0, observedAt: 0, kind: 'threshold', operand: '1', direction: 'above' },
        previous: { id: 'O0', measuredAt: 0, observedAt: 0, ticks: '0', comparisonNumerator: '1', comparisonCount: 1 },
        current: { id: 'O1', measuredAt: 1, observedAt: 1, ticks: '2', comparisonNumerator: '1', comparisonCount: 1 },
      })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { request.result.close(); resolve() }
  }))
  await open(page)
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  const legacy = inbox.getByRole('row', { name: /^LEGACY\/R1\/O1 / })
  await legacy.getByText('Show evidence', { exact: true }).click()
  await expect(legacy.getByRole('button', { name: 'Download webhook event' })).toHaveCount(0)
  const [rules, plain] = await Promise.all([readAlertFixture('rules'), readAlertFixture('observations')])
  const observations = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain])
  const digest = createHash('sha256').update(observations).digest('hex')
  const rights = { display: 'granted', storage: 'granted', automatedUse: 'granted', redistribution: 'granted', expiresOn: '2025-04-04' }
  const grant = (revision, changes = {}, hash = digest) => ({
    name: 'grant.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'marketweft-observation-grant', version: 1, provider: 'test-data', grant: 'g-1',
      observation_sha256: hash, revision, rights: { ...rights, ...changes },
    })),
  })
  await page.getByLabel('Alert rules CSV').setInputFiles({ name: 'rules.csv', mimeType: 'text/csv', buffer: rules })
  await page.getByLabel('Alert observations CSV').setInputFiles({ name: 'observations.csv', mimeType: 'text/csv', buffer: observations })
  const grantInput = page.getByLabel('Alert observation grant JSON (optional)')
  await grantInput.setInputFiles(grant(1, {}, '0'.repeat(64)))
  await page.getByRole('button', { name: 'Load alert data' }).click()
  await expect(page.getByRole('alert')).toContainText('does not match the source grant SHA-256')

  await grantInput.setInputFiles(grant(1))
  await page.getByRole('button', { name: 'Load alert data' }).click()
  await expect(page.getByRole('region', { name: 'Alert preview' }).getByRole('rowheader')).toHaveCount(8)
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(inbox.getByText('8 new alerts saved.', { exact: true })).toBeVisible()
  const row = inbox.getByRole('row', { name: /^LEVEL\/R1\/O2 / })
  expect((await eventFile(page, row)).id).toBe('crossing:LEVEL:R1:O2')
  const second = await context.newPage()
  try {
    await second.clock.setFixedTime(new Date('2025-04-04T12:00:00Z'))
    await second.goto(page.url())
    await open(second)
    const secondInbox = second.getByRole('region', { name: 'Alert inbox' })
    await secondInbox.getByText('Manage observation source grant', { exact: true }).click()
    const update = secondInbox.getByLabel('Current observation grant JSON')
    const apply = secondInbox.getByRole('button', { name: 'Apply observation grant' })
    await update.setInputFiles(grant(2, { redistribution: 'restricted', storage: 'restricted' }))
    await apply.click()
    await expect(secondInbox.getByText('Observation source grant updated.', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Download webhook event' }).click()
    await expect(inbox.getByRole('alert')).toContainText('redistribution permission')
    await page.getByRole('button', { name: 'Save to alert inbox' }).click()
    await expect(inbox.getByRole('alert')).toContainText('storage permission')

    await update.setInputFiles(grant(1))
    await apply.click()
    await expect(secondInbox.getByRole('alert')).toContainText('revision is stale')
    await update.setInputFiles(grant(3, { automatedUse: 'restricted' }))
    await apply.click()
    await expect(secondInbox.getByText('Observation source grant updated.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Run alert replay' }).click()
    await expect(page.getByText('Crossing alerts require granted automated-use permission.', { exact: true })).toBeVisible()
    await update.setInputFiles(grant(4))
    await apply.click()
    await expect(secondInbox.getByText('Observation source grant updated.', { exact: true })).toBeVisible()
  } finally {
    await second.close()
  }

  await page.reload()
  await open(page)
  expect((await eventFile(page, row)).kind).toBe('threshold-crossing')
  await page.clock.setFixedTime(new Date('2025-04-05T00:00:00Z'))
  await row.getByRole('button', { name: 'Download webhook event' }).click()
  await expect(inbox.getByRole('alert')).toContainText('grant has expired')
  await expect.poll(() => catalogContents(page)).toEqual(catalog)
})


test('a newer grant cannot authorize redistribution that was absent when the crossing was saved', async ({ page }) => {
  await page.goto('/')
  await open(page)
  const [rules, observations] = await Promise.all([readAlertFixture('rules'), readAlertFixture('observations')])
  const file = (revision, redistribution) => ({
    name: 'grant.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'marketweft-observation-grant', version: 1, provider: 'test-data', grant: 'local-use',
      observation_sha256: createHash('sha256').update(observations).digest('hex'), revision,
      rights: { display: 'granted', storage: 'granted', automatedUse: 'granted', redistribution },
    })),
  })
  await page.getByLabel('Alert rules CSV').setInputFiles({ name: 'rules.csv', mimeType: 'text/csv', buffer: rules })
  await page.getByLabel('Alert observations CSV').setInputFiles({ name: 'observations.csv', mimeType: 'text/csv', buffer: observations })
  await page.getByLabel('Alert observation grant JSON (optional)').setInputFiles(file(1, 'unconfirmed'))
  await page.getByRole('button', { name: 'Load alert data' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  const inbox = page.getByRole('region', { name: 'Alert inbox' })
  await expect(inbox.getByText('8 new alerts saved.', { exact: true })).toBeVisible()
  await inbox.getByText('Manage observation source grant', { exact: true }).click()
  await inbox.getByLabel('Current observation grant JSON').setInputFiles(file(2, 'granted'))
  await inbox.getByRole('button', { name: 'Apply observation grant' }).click()
  await expect(inbox.getByText('Observation source grant updated.', { exact: true })).toBeVisible()
  const row = inbox.getByRole('row', { name: /^LEVEL\/R1\/O2 / })
  await row.getByText('Show evidence', { exact: true }).click()
  await row.getByRole('button', { name: 'Download webhook event' }).click()
  await expect(inbox.getByRole('alert')).toContainText('redistribution permission')
})

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
