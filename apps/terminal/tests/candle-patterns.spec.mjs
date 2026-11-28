import { execFile } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test } from './fixtures.mjs'
import { catalogContents, downloadWorkspace, openImport, selectBackup, submitImport } from './catalog-fixtures.mjs'

const fixture = name => readFile(new URL('../../../crates/core/tests/fixtures/' + name + '.csv', import.meta.url), 'utf8')

test('offline candle pattern scans disclose only observations at the active replay step', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start candlestick pattern demo' }).click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  const scan = page.getByRole('button', { name: 'Scan observed candles' })
  const next = page.getByRole('button', { name: 'Next event' })
  const table = page.getByRole('table', { name: 'Observed candlestick patterns' })
  const rows = table.locator('tbody tr')
  async function step(count) { for (let i = 0; i < count; i++) await next.click() }

  await expect(scan).toBeDisabled()
  await step(2)
  await scan.click()
  await expect(page.getByText('0 patterns through 2026-01-12T14:01:00Z.')).toBeVisible()
  await expect(table).toHaveCount(0)

  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bullish engulfing')
  await expect(rows.first()).toContainText('2026-01-12T14:02:00Z')

  await step(1)
  await expect(table).toHaveCount(0)
  await scan.click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Bearish engulfing')

  await step(2)
  await scan.click()
  await expect(rows).toHaveCount(2)
  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Doji')
  await expect(rows.first()).toContainText('2026-01-12T14:06:00Z')

  await step(6)
  await scan.click()
  await expect(rows).toHaveCount(3)
  await step(1)
  await scan.click()
  await expect(rows).toHaveCount(4)
  await expect(rows.first().getByRole('cell')).toHaveText([
    'Doji', '2026-01-13T14:02:00Z', '2026-01-13T14:02:30Z',
  ])
  await page.getByRole('button', { name: 'Previous event' }).click()
  await expect(table).toHaveCount(0)
  await scan.click()
  await expect(rows).toHaveCount(3)
})

test('piercing and dark cloud cover rewind across the early close and export exact signed evidence', async ({ page, context }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-piercing-dark-cloud'), fixture('synthetic-candle-pattern-sessions')])
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)

  await openImport(page, 'REVERSALS', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  for (const right of ['Display', 'Automated use', 'Storage', 'Redistribution']) {
    await dialog.getByRole('combobox', { name: right, exact: true }).selectOption('granted')
  }
  await submitImport(page, 'REVERSALS')
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({
    name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar),
  })
  await page.getByLabel('Bar interval in seconds', { exact: true }).fill('60')
  await page.getByRole('button', { name: 'Start replay', exact: true }).click()
  await page.getByText('Candlestick patterns', { exact: true }).click()

  const next = page.getByRole('button', { name: 'Next event', exact: true })
  const previous = page.getByRole('button', { name: 'Previous event', exact: true })
  const scan = page.getByRole('button', { name: 'Scan observed candles', exact: true })
  const rows = page.getByRole('table', { name: 'Observed candlestick patterns', exact: true }).locator('tbody tr')
  const save = page.getByRole('button', { name: 'Save pattern alerts', exact: true })
  const rule = page.getByLabel('Pattern alert rule')
  async function step(count) { for (let i = 0; i < count; i++) await next.click() }
  async function match(name, opened, observed) {
    await expect(rows.first().getByRole('cell')).toHaveText([name, opened, observed])
  }
  await step(2)
  await scan.click()
  await expect(rows).toHaveCount(0)
  await step(1)
  await scan.click()
  await match('Piercing', '2026-01-12T14:01:00Z', '2026-01-12T14:02:00Z')
  await rule.selectOption('piercing')
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
  await step(1)
  await scan.click()
  await match('Dark cloud cover', '2026-01-12T14:02:00Z', '2026-01-12T14:03:00Z')
  await step(3)
  await scan.click()
  await expect(rows).toHaveCount(2)

  await step(6)
  await scan.click()
  await expect(rows).toHaveCount(3)
  await step(1)
  await scan.click()
  await match('Dark cloud cover', '2026-01-13T14:02:00Z', '2026-01-13T14:02:30Z')
  await expect(rows).toHaveCount(4)
  await rule.selectOption('dark-cloud-cover')
  await save.click()
  await expect(page.getByText('2 new pattern alerts saved.', { exact: true })).toBeVisible()
  await previous.click()
  await scan.click()
  await expect(rows).toHaveCount(3)
  await save.click()
  await expect(page.getByText('0 new pattern alerts saved.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Change replay', exact: true }).click()
  await page.getByRole('button', { name: 'Open replay alerts', exact: true }).click()
  const inbox = page.getByRole('table', { name: 'Saved alerts', exact: true })
  await expect(inbox.locator('tbody tr')).toHaveCount(3)
  const earlyClose = inbox.getByRole('row', { name: /2026-01-13T14:02:30Z/ })
  await earlyClose.getByText('Show evidence', { exact: true }).click()
  await expect(earlyClose).toContainText('Dark cloud cover')
  const [download] = await Promise.all([
    page.waitForEvent('download'), earlyClose.getByRole('button', { name: 'Download webhook event', exact: true }).click(),
  ])
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.data.rule.pattern).toBe('dark-cloud-cover')
  expect(exported.observed_at).toBe('2026-01-13T14:02:30Z')
  expect(exported.data.current.ticks).toEqual({ open: 0, high: 1000000, low: -8000000, close: -5000000, volume: 10000000 })
  expect(exported.data.previous.ticks).toEqual({ open: -7000000, high: -1000000, low: -8000000, close: -2000000, volume: 9000000 })
  expect(exported.data.previous.observedAt).toBe(exported.data.current.measuredAt)
  await page.reload()
  await page.getByRole('button', { name: 'Historical replay', exact: true }).click()
  await page.getByRole('button', { name: 'Open replay alerts', exact: true }).click()
  await expect(inbox.locator('tbody tr')).toHaveCount(3)
})

test('Harami pairs and crosses appear only at their close and preserve exact offline alert evidence', async ({ page, context }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-harami'), fixture('synthetic-candle-pattern-sessions')])
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await openImport(page, 'HARAMI', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  for (const right of ['Display', 'Automated use', 'Storage', 'Redistribution']) {
    await dialog.getByRole('combobox', { name: right, exact: true }).selectOption('granted')
  }
  await submitImport(page, 'HARAMI')
  await page.getByRole('button', { name: 'Historical replay', exact: true }).click()
  await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({
    name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar),
  })
  await page.getByLabel('Bar interval in seconds', { exact: true }).fill('60')
  await page.getByRole('button', { name: 'Start replay', exact: true }).click()
  await page.getByText('Candlestick patterns', { exact: true }).click()

  const scan = page.getByRole('button', { name: 'Scan observed candles', exact: true })
  const next = page.getByRole('button', { name: 'Next event', exact: true })
  const previous = page.getByRole('button', { name: 'Previous event', exact: true })
  const rows = page.getByRole('table', { name: 'Observed candlestick patterns', exact: true }).locator('tbody tr')
  const save = page.getByRole('button', { name: 'Save pattern alerts', exact: true })
  const rule = page.getByLabel('Pattern alert rule')
  async function scanAfter(count) {
    for (let index = 0; index < count; index++) await next.click()
    await scan.click()
  }
  await scanAfter(2)
  await expect(rows).toHaveCount(0)
  await scanAfter(1)
  await expect(rows.first().getByRole('cell')).toHaveText(['Bullish Harami', '2026-01-12T14:01:00Z', '2026-01-12T14:02:00Z'])
  await scanAfter(2)
  await expect(rows.first().getByRole('cell')).toHaveText(['Bearish Harami', '2026-01-12T14:03:00Z', '2026-01-12T14:04:00Z'])
  await scanAfter(2)
  await expect(rows).toHaveCount(3)
  await expect(rows.first().getByRole('cell')).toHaveText(['Doji', '2026-01-12T14:05:00Z', '2026-01-12T14:06:00Z'])
  await scanAfter(2)
  await expect(rows.first().getByRole('cell')).toHaveText(['Bullish Harami Cross', '2026-01-12T14:07:00Z', '2026-01-12T14:08:00Z'])
  await rule.selectOption('bullish-harami-cross')
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
  await save.click()
  await expect(page.getByText('0 new pattern alerts saved.', { exact: true })).toBeVisible()

  await scanAfter(4)
  await expect(rows).toHaveCount(5)
  await scanAfter(1)
  await expect(rows.first().getByRole('cell')).toHaveText(['Bearish Harami Cross', '2026-01-13T14:02:00Z', '2026-01-13T14:02:30Z'])
  await rule.selectOption('bearish-harami-cross')
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
  await previous.click()
  await scan.click()
  await expect(rows).toHaveCount(5)
  await expect(save).toBeDisabled()

  await page.reload()
  await page.getByRole('button', { name: 'Historical replay', exact: true }).click()
  await page.getByRole('button', { name: 'Open replay alerts', exact: true }).click()
  const inbox = page.getByRole('table', { name: 'Saved alerts', exact: true })
  await expect(inbox.locator('tbody tr')).toHaveCount(2)
  const early = inbox.getByRole('row', { name: /Bearish Harami Cross/ })
  await early.getByText('Show evidence', { exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'), early.getByRole('button', { name: 'Download webhook event', exact: true }).click(),
  ])
  const event = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(event.data.rule.pattern).toBe('bearish-harami-cross')
  expect(event.observed_at).toBe('2026-01-13T14:02:30Z')
  expect(event.data.current.ticks).toEqual({ open: -4000000, high: -3000000, low: -5000000, close: -4000000, volume: 10000000 })
  expect(event.data.previous.ticks).toEqual({ open: -8000000, high: 2000000, low: -9000000, close: 0, volume: 9000000 })
  expect(event.data.previous.observedAt).toBe(event.data.current.measuredAt)
})

test('a restricted source blocks pattern scans without changing imported history', async ({ page }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-candle-patterns'), fixture('synthetic-candle-pattern-sessions')])
  await page.goto('/')
  await openImport(page, 'RESTRICTED', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption('restricted')
  await submitImport(page, 'RESTRICTED')
  const saved = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({ name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar) })
  await page.getByLabel('Bar interval in seconds').fill('60')
  await page.getByRole('button', { name: 'Start replay', exact: true }).click()
  const next = page.getByRole('button', { name: 'Next event' })
  for (let i = 0; i < 3; i++) await next.click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  await page.getByRole('button', { name: 'Scan observed candles' }).click()
  await expect(page.getByRole('alert')).toContainText('requires granted automated-use permission')
  await expect(page.getByRole('table', { name: 'Observed candlestick patterns' })).toHaveCount(0)
  expect(await catalogContents(page)).toEqual(saved)
})

test('selected pattern alerts share the inbox with crossing alerts and deduplicate on rewind', async ({ page, context }, testInfo) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Start candlestick pattern demo' }).click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  const next = page.getByRole('button', { name: 'Next event' })
  const scan = page.getByRole('button', { name: 'Scan observed candles' })
  const save = page.getByRole('button', { name: 'Save pattern alerts' })
  const rule = page.getByLabel('Pattern alert rule')
  async function step(count) { for (let i = 0; i < count; i++) await next.click() }

  await step(4)
  await scan.click()
  await expect(save).toBeDisabled()
  await rule.selectOption('bullish-engulfing')
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous event' }).click()
  await scan.click()
  await save.click()
  await expect(page.getByText('0 new pattern alerts saved.', { exact: true })).toBeVisible()

  await step(4)
  await scan.click()
  await rule.selectOption('doji')
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
  await step(7)
  await scan.click()
  await save.click()
  await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Change replay' }).click()
  await page.getByRole('button', { name: 'Open replay alerts' }).click()
  const saved = page.getByRole('table', { name: 'Saved alerts' })
  await expect(saved.locator('tbody tr')).toHaveCount(3)
  const bullish = saved.getByRole('row', { name: /Bullish engulfing/ })
  await bullish.getByText('Show evidence').click()
  await expect(bullish).toContainText('candlestick-v1')
  await expect(bullish).toContainText('2026-01-12T14:02:00Z')
  await expect(bullish).toContainText('4 / 7 / 3 / 6 / 1')
  await expect(bullish).toContainText('5 / 6 / 3 / 4 / 1')
  await expect(bullish).toContainText(/[a-f0-9]{64}/)
  const download = page.waitForEvent('download')
  await bullish.getByRole('button', { name: 'Download webhook event' }).click()
  const eventPath = await (await download).path()
  const exported = JSON.parse(await readFile(eventPath, 'utf8'))
  expect(exported.kind).toBe('candlestick')
  expect(exported.observed_at).toBe('2026-01-12T14:02:00Z')
  expect(exported.data.current.ticks).toEqual({
    open: 4000000, high: 7000000, low: 3000000, close: 6000000, volume: 1000000,
  })
  expect(exported.data.previous.ticks.close).toBe(4000000)
  expect(exported.id).toContain(exported.data.rule.contextDigest)
  expect(exported.data.source).toBeUndefined()

  const binary = process.env.MARKETWEFT_TEST_RESEARCH_WEBHOOK
  if (binary) await test.step('deliver the exact browser export through the native webhook sender', async () => {
    const requests = []
    const server = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      requests.push({ headers: request.headers, body: Buffer.concat(chunks) })
      response.writeHead(204).end()
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      await mkdir(testInfo.outputDir, { recursive: true })
      const config = testInfo.outputPath('webhook-test-config.json')
      const key = testInfo.outputPath('webhook-test-key.hex')
      const receipt = testInfo.outputPath('webhook-test-receipt.json')
      const secret = Buffer.alloc(32, 0x35)
      await writeFile(config, JSON.stringify({ endpoint: 'http://127.0.0.1:' + server.address().port + '/alerts', key_id: 'browser-fixture' }))
      await writeFile(key, secret.toString('hex'))
      await promisify(execFile)(binary, ['webhook', 'deliver', config, eventPath, key, receipt], { timeout: 10_000 })
      expect(requests).toHaveLength(1)
      expect(JSON.parse(requests[0].body)).toEqual({ version: 1, event: exported })
      const signature = createHmac('sha256', secret).update(requests[0].body).digest('hex')
      expect(requests[0].headers['x-marketweft-signature']).toBe('v1=' + signature)
      expect(requests[0].headers['idempotency-key']).toBe(exported.id)
      expect(JSON.parse(await readFile(receipt, 'utf8')).attempts).toEqual([{ outcome: 'delivered', status: 204 }])
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  })
  await expect(saved.getByRole('row', { name: /Bearish engulfing/ })).toHaveCount(0)
  await expect(saved.getByRole('row', { name: /2026-01-13T14:02:30Z/ })).toContainText('Doji')

  await page.getByRole('button', { name: 'Start alert demo' }).click()
  await page.getByRole('button', { name: 'Full alert replay' }).click()
  await page.getByRole('button', { name: 'Save to alert inbox' }).click()
  await expect(saved.locator('tbody tr')).toHaveCount(11)

  await page.reload()
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open replay alerts' }).click()
  await expect(saved.locator('tbody tr')).toHaveCount(11)
})

test('pattern evaluation does not grant permission to persist its raw evidence', async ({ page }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-candle-patterns'), fixture('synthetic-candle-pattern-sessions')])
  await page.goto('/')
  await openImport(page, 'NO-STORAGE-GRANT', csv)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption('granted')
  await submitImport(page, 'NO-STORAGE-GRANT')
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({ name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar) })
  await page.getByLabel('Bar interval in seconds').fill('60')
  await page.getByRole('button', { name: 'Start replay', exact: true }).click()
  const next = page.getByRole('button', { name: 'Next event' })
  for (let i = 0; i < 3; i++) await next.click()
  await page.getByText('Candlestick patterns', { exact: true }).click()
  await page.getByRole('button', { name: 'Scan observed candles' }).click()
  await page.getByLabel('Pattern alert rule').selectOption('bullish-engulfing')
  await page.getByRole('button', { name: 'Save pattern alerts' }).click()
  await expect(page.getByRole('alert')).toContainText('requires granted storage permission')
  await page.getByRole('button', { name: 'Change replay' }).click()
  await page.getByRole('button', { name: 'Open replay alerts' }).click()
  await expect(page.getByText('0 saved alerts', { exact: true })).toBeVisible()
})

test('webhook event export requires the recorded and current redistribution grant', async ({ page }) => {
  const [csv, calendar] = await Promise.all([fixture('synthetic-candle-patterns'), fixture('synthetic-candle-pattern-sessions')])
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59Z'))
  await page.goto('/')
  const download = page.getByRole('button', { name: 'Download webhook event' })
  const saved = page.getByRole('table', { name: 'Saved alerts' })

  async function savePattern(symbol, redistribution) {
    await openImport(page, symbol, csv)
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Series details', { exact: true }).click()
    for (const name of ['Display', 'Automated use', 'Storage']) {
      await dialog.getByRole('combobox', { name, exact: true }).selectOption('granted')
    }
    await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption(redistribution)
    await dialog.getByLabel('Grant expiration in UTC').fill('2099-12-31')
    await submitImport(page, symbol)
    await page.getByRole('button', { name: 'Historical replay' }).click()
    await page.getByLabel('Session calendar CSV', { exact: true }).setInputFiles({
      name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from(calendar),
    })
    await page.getByLabel('Bar interval in seconds').fill('60')
    await page.getByRole('button', { name: 'Start replay', exact: true }).click()
    const next = page.getByRole('button', { name: 'Next event' })
    for (let i = 0; i < 3; i++) await next.click()
    await page.getByText('Candlestick patterns', { exact: true }).click()
    await page.getByRole('button', { name: 'Scan observed candles' }).click()
    await page.getByLabel('Pattern alert rule').selectOption('bullish-engulfing')
    await page.getByRole('button', { name: 'Save pattern alerts' }).click()
    await expect(page.getByText('1 new pattern alert saved.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Change replay' }).click()
    await page.getByRole('button', { name: 'Open replay alerts' }).click()
    const row = saved.getByRole('row').filter({ has: page.getByRole('cell', { name: 'LOCAL:' + symbol, exact: true }) })
    await row.getByText('Show evidence').click()
    return row
  }

  const downloads = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  await savePattern('RESTRICTED-EXPORT', 'restricted')
  await download.click()
  await expect(page.getByRole('alert')).toContainText('requires granted redistribution permission')
  expect(downloads).toEqual([])
  await page.getByRole('button', { name: 'Return to historical replay' }).click()
  await page.getByRole('button', { name: 'Return to workspace' }).click()

  const allowed = await savePattern('AUTHORIZED-EXPORT', 'granted')
  const specificDownload = allowed.getByRole('button', { name: 'Download webhook event' })
  const file = page.waitForEvent('download')
  await specificDownload.click()
  const data = JSON.parse(await readFile(await (await file).path(), 'utf8'))
  expect(data.data.rule.series).toBe('LOCAL:AUTHORIZED-EXPORT')
  await page.clock.setFixedTime(new Date('2100-01-01T00:00:00Z'))
  await specificDownload.click()
  await expect(page.getByRole('alert')).toContainText('source grant has expired')
  expect(downloads).toHaveLength(1)

  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59Z'))
  const returnToWorkspace = async () => {
    await page.getByRole('button', { name: 'Return to historical replay' }).click()
    await page.getByRole('button', { name: 'Return to workspace' }).click()
  }
  await returnToWorkspace()
  const original = await downloadWorkspace(page)
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
    if (!value || typeof value !== 'object') return JSON.stringify(value)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  }
  const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
  for (const [change, error] of [
    [history => { history.descriptor.sourceRights.redistribution = 'restricted' }, 'requires granted redistribution permission'],
    [history => { history.csv = history.csv.trimEnd() + '\n' + '2026-01-13T14:03:00Z,1,2,1,2,1\n'; history.barCount++ },
      'source history no longer matches'],
  ]) {
    const bundle = structuredClone(original)
    const history = bundle.manifest.series.find(row => row.id === 'LOCAL:AUTHORIZED-EXPORT')
    change(history)
    const { sha256, ...body } = history
    history.sha256 = digest(body)
    bundle.manifest.barCount = bundle.manifest.series.reduce((total, entry) => total + entry.barCount, 0)
    bundle.sha256 = digest(bundle.manifest)
    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click()
    await selectBackup(page, bundle)
    await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
    await expect(page.getByText('Workspace restored.')).toBeVisible()
    await page.getByRole('button', { name: 'Historical replay' }).click()
    await page.getByRole('button', { name: 'Open replay alerts' }).click()
    await allowed.getByText('Show evidence').click()
    await specificDownload.click()
    await expect(page.getByRole('alert')).toContainText(error)
    await returnToWorkspace()
  }
  expect(downloads.filter(name => name === 'marketweft-candlestick-event.json')).toHaveLength(1)
})

test('alerts saved by earlier builds with no provenance remain readable and cannot export', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('marketweft.alert-inbox', 1)
    open.onerror = () => reject(open.error)
    open.onupgradeneeded = () => open.result.createObjectStore('notifications', { keyPath: 'id' })
      .createIndex('observed', 'current.observedAt')
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('notifications', 'readwrite')
      tx.onabort = () => reject(tx.error)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.objectStore('notifications').add({
        id: 'old-pattern-record', type: 'candlestick',
        rule: { revision: 'candlestick-v1', series: 'LOCAL:OLDER', pattern: 'doji', contextDigest: 'a'.repeat(64), interval: 60 },
        current: { measuredAt: 1700000000, observedAt: 1700000060, ticks: { open: 5, high: 7, low: 4, close: 5, volume: 1 } },
      })
    }
  }))
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open replay alerts' }).click()
  const row = page.getByRole('row', { name: /old-pattern-record/ })
  await expect(row).toContainText('Doji')
  await row.getByText('Show evidence').click()
  const downloads = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  await row.getByRole('button', { name: 'Download webhook event' }).click()
  await expect(page.getByRole('alert')).toContainText('no recorded source grant')
  expect(downloads).toEqual([])
})
