import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, resolveConfig } from 'vite'
import { test, expect } from '@playwright/test'

const root = fileURLToPath(new URL('../', import.meta.url))
const bytesKey = 'VITE_MARKETWEFT_IMPORT_MAX_BYTES'
const barsKey = 'VITE_MARKETWEFT_IMPORT_MAX_BARS'
const header = 'time,open,high,low,close,volume'
const rows = [1, 2, 3].map(day => `2025-01-0${day},1,2,1,2,10`)

// Use a private env directory so the production terminal and its normal tests
// can keep running concurrently with this deliberately small policy.
async function withEnv(run) {
  const envDir = await mkdtemp(join(tmpdir(), 'marketweft-policy-'))
  const previous = [process.env[bytesKey], process.env[barsKey]]
  delete process.env[bytesKey]
  delete process.env[barsKey]
  try {
    await run({root, envDir, mode: 'policy-test', logLevel: 'silent'})
  } finally {
    for (const [i,key] of [bytesKey, barsKey].entries()) {
      if (previous[i] === undefined) delete process.env[key]
      else process.env[key] = previous[i]
    }
    await rm(envDir, {recursive: true, force: true})
  }
}

test('build validates deployment limits and defaults independently', async () => {
  await withEnv(async config => {
    const env = join(config.envDir, '.env.policy-test')
    const read = async () => JSON.parse((await resolveConfig(config, 'build')).define.__MARKETWEFT_IMPORT_POLICY__)
    expect(await read()).toEqual({maxBytes: 1500000, maxBars: 100000})
    await writeFile(env, `${bytesKey}=8388608\n${barsKey}=1\n`)
    expect(await read()).toEqual({maxBytes: 8388608, maxBars: 1})
    for (const [key,value] of [[bytesKey,'8388609'],[barsKey,'100001'],[barsKey,'0'],[barsKey,'1e2'],
      [bytesKey,'1.5'],[bytesKey,'001'],[barsKey,''],[barsKey,'+4']]) {
      await writeFile(env, `${key}=${value}\n`)
      await expect(read()).rejects.toThrow(key)
    }
  })
})

test('deployment limits apply to new CSVs while samples and larger saved histories reopen', async ({page}) => {
  await withEnv(async config => {
    const accepted = [header, rows[0], '', rows[1], ''].join('\r\n')
    const bytes = Buffer.byteLength(accepted)
    await writeFile(join(config.envDir, '.env.policy-test'), `${bytesKey}=${bytes}\n${barsKey}=2\n`)
    const server = await createServer({...config, server:{host:'127.0.0.1', port:0}})
    try {
      await server.listen()
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port)
      await expect(page.getByTestId('viewport')).toHaveText('121–180 of 180')
      const upload = async csv => {
        await page.locator('input[type=file]').setInputFiles({name:'history.csv', mimeType:'text/csv', buffer:Buffer.from(csv)})
        await page.getByRole('button', {name:'Import to watchlist'}).click()
      }
      await page.getByRole('button',{name:'Import CSV'}).click()
      await page.getByLabel('Symbol',{exact:true}).fill('SHORT')
      await upload(accepted + '\n')
      await expect(page.getByRole('alert')).toContainText(`${bytes} bytes`)
      await upload([header,'1,1,1,1,1,0','2,1,1,1,1,0','3,1,1,1,1,0'].join('\n'))
      await expect(page.getByRole('alert')).toContainText('at most 2 bars')
      await upload(accepted)
      await expect(page.getByTestId('viewport')).toHaveText('1–2 of 2')
      await page.evaluate(csv => {
        const key = 'marketweft.workspace.v1'
        const state = JSON.parse(localStorage.getItem(key))
        state.imports.push({venue:'LOCAL', symbol:'PRIOR', filename:'earlier.csv', csv})
        state.selected = 'LOCAL:PRIOR'
        state.watchlist.push(state.selected)
        localStorage.setItem(key, JSON.stringify(state))
      }, [header,...rows].join('\n'))
      await page.reload()
      await expect(page.getByRole('heading',{name:'PRIOR',exact:true})).toBeVisible()
      await expect(page.getByTestId('viewport')).toHaveText('1–3 of 3')
    } finally {
      await server.close()
    }
  })
})
