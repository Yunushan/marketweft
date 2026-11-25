import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.mjs',
  workers: 1,
  reporter: 'list',
  use: {
    launchOptions: { executablePath: process.env.MARKETWEFT_CHROME || undefined },
    viewport: { width: 1360, height: 900 },
  },
})
