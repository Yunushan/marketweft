import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'

test('a local scalar plugin runs offline and leaves the formula engine usable after a fuel trap', async ({ page, context }) => {
  const source = await readFile(new URL('../../../crates/core/tests/fixtures/scalar-plugins.txt', import.meta.url), 'utf8')
  const binary = name => Buffer.from(source.match(new RegExp('^' + name + ' ([a-f0-9]+)$', 'm'))[1], 'hex')
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Time-series formulas', exact: true }).click()
  await page.getByText('Scalar Wasm plugin', { exact: true }).click()
  const form = page.getByRole('form', { name: 'Scalar Wasm plugin' })
  const input = form.getByLabel('Plugin input')
  const evaluate = form.getByRole('button', { name: 'Run scalar plugin' })
  const result = form.getByRole('status')
  async function run(name) {
    await form.getByLabel('WebAssembly module').setInputFiles({
      name: name + '.wasm', mimeType: 'application/wasm', buffer: binary(name),
    })
    await evaluate.click()
  }

  await input.fill('-123.456789')
  await run('increment')
  await expect(result).toContainText('increment.wasm transformed -123.456789 to -123.456788.')
  await expect(result).toContainText(createHash('sha256').update(binary('increment')).digest('hex'))
  await run('import')
  await expect(form.getByRole('alert')).toContainText('cannot import')
  await expect(result).toHaveCount(0)
  await run('fuel')
  await expect(form.getByRole('alert')).toContainText('exhausted its execution budget')
  await input.fill('-9223372036854.775808')
  await run('increment')
  await expect(result).toContainText('transformed -9223372036854.775808 to -9223372036854.775807.')
  await page.getByRole('button', { name: 'Evaluate formula' }).click()
  await expect(page.getByRole('region', { name: 'Formula results' })).toBeVisible()
})
