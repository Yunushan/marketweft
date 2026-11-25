import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const executablePath =
  process.env.MARKETWEFT_CHROME ||
  (process.platform === 'win32' && existsSync(chrome) ? chrome : undefined)
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.mjs',
  workers: 1,
  reporter: 'list',
  use: {
    launchOptions: { executablePath },
    viewport: { width: 1360, height: 900 },
  },
})
