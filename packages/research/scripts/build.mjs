import { spawnSync } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const config = fileURLToPath(new URL('../tsconfig.json', import.meta.url))
const manifest = require.resolve('typescript/package.json')
const compiler = resolve(dirname(manifest), require(manifest).bin.tsc)
const build = spawnSync(process.execPath, [compiler, '-p', config], { stdio: 'inherit' })
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)

for (const name of ['marketweft_core.wasm', 'WASM-THIRD-PARTY.txt', 'rust-library-notices.html']) {
  await copyFile(
    new URL('../../../apps/terminal/public/' + name, import.meta.url),
    new URL('../dist/' + name, import.meta.url),
  )
}
