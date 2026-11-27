import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const host = '127.0.0.1'
const fixture = fileURLToPath(new URL('./fixtures/native-verification.csv', import.meta.url))

async function testEndpoint() {
  const reservation = createServer()
  reservation.listen(0, host)
  await once(reservation, 'listening')
  const port = reservation.address().port
  await promisify(reservation.close.bind(reservation))()
  return port
}

async function stopDesktop(desktop) {
  if (!desktop.pid || desktop.exitCode !== null || desktop.signalCode !== null) return
  const stopped = once(desktop, 'exit')
  try {
    await promisify(execFile)('taskkill.exe', ['/PID', String(desktop.pid), '/T', '/F'], { windowsHide: true })
  } catch (error) {
    if (desktop.exitCode === null && desktop.signalCode === null) throw error
  }
  await stopped
}

async function verifyChart(page) {
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('e.g. ABC').fill('NATIVESMOKE')
  await dialog.locator('input[type="file"]').setInputFiles(fixture)
  await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
  const chart = page.locator('canvas[aria-label^="NATIVESMOKE interactive candlestick"]')
  await expect(chart).toBeVisible()
  const expected = { O: 27, H: 30, L: 26, C: 29, Vol: 800 }
  await expect.poll(() => chart.evaluate(canvas => {
    const quote = [...canvas.closest('section.plot').querySelectorAll('.ohlc > span')].flatMap(cell => {
      const label = cell.querySelector('small')?.textContent
      return ['O', 'H', 'L', 'C', 'Vol'].includes(label)
        ? [[label, Number(cell.textContent.slice(label.length).trim().replaceAll(',', ''))]]
        : []
    })
    return Object.fromEntries(quote)
  })).toEqual(expected)
  console.log('Verified exact imported candlestick OHLCV:', expected)
}

const temp = resolve(tmpdir())
const prefix = 'marketweft-webview2-arm64-'
const profile = await mkdtemp(join(temp, prefix))
let desktop
let browser
try {
  const port = await testEndpoint()
  const endpoint = `http://${host}:${port}`
  desktop = spawn(resolve(process.argv[2]), [], {
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=${host} --remote-debugging-port=${port}`,
    },
    stdio: 'inherit',
    windowsHide: true,
  })
  await once(desktop, 'spawn')
  await expect.poll(async () => {
    if (desktop.exitCode !== null) throw new Error(`MarketWeft exited with code ${desktop.exitCode}.`)
    const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) }).catch(() => null)
    return response?.ok ?? false
  }, { timeout: 35000, message: 'the native loopback WebView2 endpoint' }).toBe(true)
  const version = await (await fetch(`${endpoint}/json/version`)).json()
  console.log('Native WebView2 runtime:', version.Browser)
  browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 })
  const findPage = () => browser.contexts().flatMap(context => context.pages()).find(page =>
    new URL(page.url()).hostname === 'tauri.localhost')
  await expect.poll(() => Boolean(findPage()), { timeout: 15000, message: 'the embedded Tauri page' }).toBe(true)
  await verifyChart(findPage())
} finally {
  try {
    try {
      await browser?.close()
    } finally {
      if (desktop) await stopDesktop(desktop)
    }
  } finally {
    if (dirname(resolve(profile)) !== temp || !basename(profile).startsWith(prefix)) {
      throw new Error('Unexpected temporary profile path.')
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 })
  }
}
