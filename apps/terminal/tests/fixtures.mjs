import { preview } from 'vite'
import { fileURLToPath } from 'node:url'
import { test as base } from '@playwright/test'
export { expect } from '@playwright/test'

export const test = base.extend({
  terminalURL: [
    async ({}, use) => {
      const root = fileURLToPath(new URL('../', import.meta.url))
      const server = await preview({
        root,
        preview: { host: '127.0.0.1', port: 0, strictPort: true },
      })
      try {
        await use('http://127.0.0.1:' + server.httpServer.address().port)
      } finally {
        await server.close()
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ terminalURL }, use) => {
    await use(terminalURL)
  },
})
