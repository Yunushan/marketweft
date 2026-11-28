import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { header, openImport, submitImport } from './catalog-fixtures.mjs'

const source = await readFile(new URL('../../../crates/core/tests/fixtures/scalar-plugins.txt', import.meta.url), 'utf8')
const binary = name => Buffer.from(source.match(new RegExp('^' + name + ' ([a-f0-9]+)$', 'm'))[1], 'hex')

test('a local scalar plugin runs offline and leaves the formula engine usable after a fuel trap', async ({ page, context }) => {
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

const history = [header,
  '2025-06-03T14:00:00Z,-0.000005,-0.000005,-0.000005,-0.000005,1',
  '2025-06-03T14:03:00Z,0.000003,0.000003,0.000003,0.000003,1',
  '2025-06-03T14:04:00Z,-0.000001,-0.000001,-0.000001,-0.000001,1',
].join('\n')

async function importHistory(page, symbol, automated = 'granted', redistribution = 'granted') {
  await openImport(page, symbol, history)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Series details', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption('granted')
  await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption(automated)
  await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption(redistribution)
  await dialog.getByLabel('Grant expiration in UTC').fill('2099-12-31')
  await submitImport(page, symbol)
}

async function selectSeriesPlugin(page) {
  await page.getByRole('button', { name: 'Time-series formulas', exact: true }).click()
  await page.getByText('Scalar plugin on observed closes', { exact: true }).click()
  const form = page.getByRole('form', { name: 'Scalar plugin on observed closes' })
  await form.getByLabel('Series WebAssembly module').setInputFiles({
    name: 'increment.wasm', mimeType: 'application/wasm', buffer: binary('increment'),
  })
  return form
}

test('offline plugin series respects inclusive cutoffs and reproduces exact CSV on rewind', async ({ page, context }) => {
  await page.goto('/')
  await importHistory(page, 'PLUGINCLOSE')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await context.setOffline(true)
  const form = await selectSeriesPlugin(page)
  const report = page.getByRole('region', { name: 'Scalar plugin series results' })
  const rows = report.getByRole('table').locator('tbody tr')
  const observed = time => '2025-06-03T' + time + 'Z'
  async function run(through) {
    await form.getByLabel('Plugin through (UTC)').fill(observed(through))
    await form.getByRole('button', { name: 'Run plugin on closes' }).click()
  }
  async function download() {
    const pending = page.waitForEvent('download')
    await report.getByRole('button', { name: 'Download plugin series CSV' }).click()
    return readFile(await (await pending).path(), 'utf8')
  }
  await form.getByLabel('Plugin from (UTC)').fill(observed('13:58:00'))
  await run('13:59:59')
  await expect(report.getByRole('status')).toHaveText('No observed closes in this UTC range.')
  await run('14:00:00')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('-0.000004')
  const first = await download()
  const digest = createHash('sha256').update(binary('increment')).digest('hex')
  expect(first).toContain('"increment.wasm","' + digest + '"')
  expect(first).toContain(',2025-06-03T14:00:00Z,-0.000005,-0.000004\r\n')

  await run('14:03:00')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText('0.000004')
  await expect(report.getByRole('table')).not.toContainText('14:01:00')
  await run('14:00:00')
  await expect(rows).toHaveCount(1)
  expect(await download()).toBe(first)
})

test('source grants control plugin series execution and export independently', async ({ page }) => {
  await page.goto('/')
  await importHistory(page, 'PLUGINDENY', 'restricted')
  let form = await selectSeriesPlugin(page)
  await form.getByRole('button', { name: 'Run plugin on closes' }).click()
  await expect(form.getByRole('alert')).toHaveText('Plugin series evaluation requires granted automated-use permission.')
  const report = page.getByRole('region', { name: 'Scalar plugin series results' })
  await expect(report).toHaveCount(0)

  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await importHistory(page, 'PLUGINPRIVATE', 'granted', 'restricted')
  form = await selectSeriesPlugin(page)
  await form.getByRole('button', { name: 'Run plugin on closes' }).click()
  await expect(report.getByRole('table').locator('tbody tr')).toHaveCount(3)
  const downloads = []
  page.on('download', file => downloads.push(file.suggestedFilename()))
  await report.getByRole('button', { name: 'Download plugin series CSV' }).click()
  await expect(form.getByRole('alert')).toHaveText('Plugin CSV export requires a granted redistribution permission.')
  expect(downloads).toEqual([])
})
