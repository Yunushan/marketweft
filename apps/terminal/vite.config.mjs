import { defineConfig, loadEnv } from 'vite'
import { readImportPolicy } from './src/import-policy.ts'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('./dist/', import.meta.url))
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'marketweft-import-policy',
      config(config, { mode, isPreview }) {
        if (isPreview) return
        const env = loadEnv(mode, config.envDir ?? config.root ?? process.cwd(), 'VITE_MARKETWEFT_')
        return { define: { __MARKETWEFT_IMPORT_POLICY__: JSON.stringify(readImportPolicy(env)) } }
      },
    },
    {
      name: 'marketweft-offline',
      apply: 'build',
      closeBundle() {
        if (!existsSync(join(output, 'marketweft_core.wasm'))) {
          throw new Error(
            'Missing Rust engine. Run node scripts/build-wasm.mjs from the repository root.',
          )
        }
        const files = listFiles(output)
          .filter((path) => path !== join(output, 'sw.js'))
          .sort()
        const digest = createHash('sha256')
        const urls = files.map((path) => {
          const url = './' + relative(output, path).split(sep).join('/')
          digest.update(url).update(readFileSync(path))
          return url
        })
        const template = readFileSync(
          new URL('./sw.template.js', import.meta.url),
          'utf8',
        )
        digest.update(template)
        const worker = template
          .replace('__MARKETWEFT_BUILD_ASSETS__', () => JSON.stringify(urls))
          .replace('__DIGEST__', digest.digest('hex').slice(0, 20))
        writeFileSync(join(output, 'sw.js'), worker)
      },
    },
  ],
})
