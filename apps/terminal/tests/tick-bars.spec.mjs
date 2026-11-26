import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace } from './catalog-fixtures.mjs'

test('recorded tick bars expose only the known prefix and export exact capture sequences offline', async ({ page, context }) => {
  await page.goto('/')
  const before = await downloadWorkspace(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Recorded tick bars' }).click()
  await expect(page.getByRole('heading', { name: 'Recorded tick bars' })).toBeFocused()
  const source = [
    'instrument,executed_at,observed_at,sequence,price,size',
    'NASDAQ:NVDA,0,0,9007199254740993,5,0.000001',
    'NASDAQ:NVDA,0,0,9007199254740994,-2,0.000002',
    'NASDAQ:NVDA,-1,5,9007199254740995,7,0.1',
  ].join('\n')
  const load = csv => page.getByLabel('Trades CSV').setInputFiles({
    name: 'recorded-trades.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  })
  await load(source)
  await page.getByLabel('Trades per bar').fill('2')
  const cutoff = page.getByLabel('Known through (UTC, optional)')
  const build = page.getByRole('button', { name: 'Build tick bars' })
  const chart = page.getByRole('region', { name: 'Tick bar chart' })
  await cutoff.fill('-1')
  await build.click()
  await expect(page.getByRole('status')).toHaveText('No trades were observed by the selected cutoff.')
  await cutoff.fill('0')
  await build.click()
  await expect(chart.getByTestId('viewport')).toHaveText('1–1 of 1')
  await expect(chart.getByText(/2\/2 trades · Complete/)).toContainText('9007199254740993–9007199254740994')
  const exportBars = async () => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download tick bars' }).click()
    const saved = await pending
    expect(saved.suggestedFilename()).toBe('NASDAQ-NVDA-tick-bars.csv')
    return (await readFile(await saved.path(), 'utf8')).trimEnd().split('\r\n')
  }
  const historical = await exportBars()
  expect(historical[1]).toBe('"NASDAQ:NVDA",0,0,9007199254740993,9007199254740994,2,2,5,5,-2,-2,0.000003')
  await cutoff.fill('5')
  await build.click()
  await expect(chart.getByTestId('viewport')).toHaveText('1–2 of 2')
  await expect(chart.getByText(/1\/2 trades · Provisional/)).toContainText('9007199254740995')
  const later = await exportBars()
  expect(later.slice(0, 2)).toEqual(historical)
  expect(later[2]).toBe('"NASDAQ:NVDA",5,5,9007199254740995,9007199254740995,1,2,7,7,7,7,0.1')
  await load(source.replaceAll('NASDAQ:NVDA', 'NASDAQ:MSFT'))
  await build.click()
  await expect(page.getByRole('alert')).toHaveText(/Instrument must match/)
  await expect(chart.getByTestId('viewport')).toHaveText('1–2 of 2')
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  await expect(page.getByRole('button', { name: 'Recorded tick bars' })).toBeFocused()
  expect((await downloadWorkspace(page)).manifest).toEqual(before.manifest)
})
