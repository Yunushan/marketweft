import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

async function open(page, context, baseURL) {
  await page.goto(baseURL)
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open bar backtest' }).click()
  await page.getByRole('button', { name: 'Start backtest demo' }).click()
  await page.getByText('Formula paper backtest', { exact: true }).click()
  return page.getByRole('region', { name: 'Formula paper backtest' })
}

async function save(page, panel, name, filename) {
  const pending = page.waitForEvent('download')
  await panel.getByRole('button', { name }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe(filename)
  return readFile(await file.path(), 'utf8')
}

test('an offline strategy package reproduces the accepted ledger in a clean profile', async ({ page, context, browser, baseURL }) => {
  const source = await open(page, context, baseURL)
  await page.getByText('Strategy and account settings', { exact: true }).click()
  await page.getByLabel('Target shares', { exact: true }).fill('4')
  await page.getByLabel('Starting cash', { exact: true }).fill('1100.25')
  await page.getByRole('button', { name: 'Run bar backtest' }).click()
  const entry = 'if(close >= 13, 1, 0 / 0)'
  await source.getByRole('textbox', { name: 'Entry formula', exact: true }).fill(entry)
  await source.getByRole('button', { name: 'Run formula backtest' }).click()
  const pack = await save(page, source, 'Download strategy package', 'formula-strategy.mwstrategy.json')
  const expected = await save(page, source, 'Download formula backtest', 'formula-paper-backtest.csv')
  const data = JSON.parse(pack)
  expect(data.execution.targetShares).toBe('4')
  expect(data.account.startingCash).toBe('1100.25')
  expect(data.formulas.entry).toBe(entry)
  expect(data).not.toHaveProperty('history')

  const fresh = await browser.newContext()
  try {
    const second = await fresh.newPage()
    const target = await open(second, fresh, baseURL)
    const original = await catalogContents(second)
    const upload = target.getByLabel('Formula strategy package')
    const load = target.getByRole('button', { name: 'Load strategy package', exact: true })
    const importText = async text => {
      await upload.setInputFiles({ name: 'portable.mwstrategy.json', mimeType: 'application/json', buffer: Buffer.from(text) })
      await load.click()
    }
    await importText(pack)
    await expect(target.getByText('Using settings from portable.mwstrategy.json')).toBeVisible()
    await expect(target.getByRole('textbox', { name: 'Entry formula', exact: true })).toHaveValue(entry)
    const run = target.getByRole('button', { name: 'Run formula backtest' })
    await run.click()
    expect(await save(second, target, 'Download formula backtest', 'formula-paper-backtest.csv')).toEqual(expected)
    expect(await save(second, target, 'Download strategy package', 'formula-strategy.mwstrategy.json')).toEqual(pack)
    await importText(JSON.stringify({ ...data, packageVersion: 2 }))
    await expect(target.getByRole('alert')).toContainText('Unsupported formula strategy package version')
    expect(await save(second, target, 'Download formula backtest', 'formula-paper-backtest.csv')).toEqual(expected)
    await target.getByRole('button', { name: 'Use current backtest settings' }).click()
    await run.click()
    expect(await save(second, target, 'Download formula backtest', 'formula-paper-backtest.csv')).not.toEqual(expected)
    await expect.poll(() => catalogContents(second)).toEqual(original)
  } finally {
    await fresh.close()
  }
})
