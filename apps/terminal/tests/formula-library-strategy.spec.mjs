import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const definition = body => ({ name: 'gate', parameters: ['value'], body })
const library = Buffer.from(JSON.stringify({
  format: 'marketweft.formula-library', languageVersion: 1, libraryVersion: 1,
  functions: [definition('value >= 13')],
}))

async function demo(page) {
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open bar backtest' }).click()
  await page.getByRole('button', { name: 'Start backtest demo' }).click()
  await page.getByText('Formula paper backtest', { exact: true }).click()
  return page.getByRole('region', { name: 'Formula paper backtest' })
}

async function download(page, panel, name, filename) {
  const pending = page.waitForEvent('download')
  await panel.getByRole('button', { name }).click()
  const saved = await pending
  expect(saved.suggestedFilename()).toBe(filename)
  return readFile(await saved.path())
}

test('a portable paper strategy replays its own functions and preserves candidate scope offline', async ({ page, context, browser, baseURL }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  const source = await demo(page)
  await source.getByText('Backtest formula functions', { exact: true }).click()
  await source.getByLabel('Backtest function library').setInputFiles({ name: 'gates.json', mimeType: 'application/json', buffer: library })
  await source.getByRole('button', { name: 'Load backtest function library' }).click()
  await expect(source.getByText('Functions from gates.json · gate')).toBeVisible()
  await source.getByLabel('Entry formula').fill('gate(close)')
  await source.getByRole('button', { name: 'Run formula backtest' }).click()
  await expect(source.getByText('Formula cash').locator('..').locator('dd')).toHaveText('957.8')
  const pack = await download(page, source, 'Download strategy package', 'formula-strategy.mwstrategy.json')
  expect(JSON.parse(pack.toString()).packageVersion).toBe(2)
  const ledger = await download(page, source, 'Download formula backtest', 'formula-paper-backtest.csv')
  expect(ledger.toString()).toContain('function_library_json')
  expect(ledger.toString()).toContain('value >= 13')

  const fresh = await browser.newContext({ baseURL })
  try {
    const target = await fresh.newPage()
    await target.goto('/')
    await expect(target.getByText('Offline ready', { exact: true })).toBeVisible()
    await target.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await fresh.setOffline(true)
    const replay = await demo(target)
    const file = { name: 'gate.mwstrategy.json', mimeType: 'application/json', buffer: pack }
    await replay.getByLabel('Formula strategy package').setInputFiles(file)
    await replay.getByRole('button', { name: 'Load strategy package', exact: true }).click()
    await expect(replay.getByText('Functions from gate.mwstrategy.json · gate')).toBeVisible()
    await replay.getByRole('button', { name: 'Run formula backtest' }).click()
    expect(await download(target, replay, 'Download formula backtest', 'formula-paper-backtest.csv')).toEqual(ledger)
    expect(await download(target, replay, 'Download strategy package', 'formula-strategy.mwstrategy.json')).toEqual(pack)

    await target.getByText('Formula walk-forward validation', { exact: true }).click()
    const walk = target.getByRole('region', { name: 'Formula walk-forward validation' })
    const variant = JSON.parse(pack.toString())
    variant.functions = [definition('value > lag(value, 1)')]
    await walk.getByLabel('Candidate strategy packages').setInputFiles([file, {
      name: 'rising.mwstrategy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(variant)),
    }])
    await walk.getByRole('button', { name: 'Add strategy packages' }).click()
    await expect(walk.getByRole('group', { name: /rising\.mwstrategy\.json/ })).toBeVisible()
    await walk.getByRole('button', { name: 'Run formula walk-forward' }).click()
    await expect(walk.getByRole('row', { name: /^Training Strategy-3/ })).toContainText('997.8')
    await expect(walk.getByRole('row', { name: /^Training Strategy-4/ })).toContainText('1003.4')
    const evidence = await download(target, walk, 'Download formula walk-forward', 'formula-walk-forward.csv')
    expect(evidence.toString()).toContain('value > lag(value, 1)')
  } finally {
    await fresh.close()
  }
  await expect.poll(() => catalogContents(page)).toEqual(original)
})
