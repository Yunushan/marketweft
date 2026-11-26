import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents, header, microCSV, openImport, submitImport } from './catalog-fixtures.mjs'

const primary = page => page.getByRole('region', { name: 'Primary chart pane' })

async function downloadCsv(page, pane) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    pane.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(await file.failure()).toBeNull()
  return { name: file.suggestedFilename(), csv: await readFile(await file.path(), 'utf8') }
}

test('the comparison pane exports signed OHLCV ticks and the file reimports offline', async ({ page, context }) => {
  await page.goto('/')
  await openImport(page, 'EXPORT', microCSV)
  await submitImport(page, 'EXPORT')
  await page.getByRole('button', { name: 'Compare charts' }).click()
  await page.getByLabel('Comparison instrument').selectOption('LOCAL:EXPORT')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const other = page.getByRole('region', { name: 'Comparison chart pane' })
  const before = (await catalogContents(page)).series
  await other.getByText('Export CSV', { exact: true }).click()
  const { csv, name } = await downloadCsv(page, other)
  expect(name).toBe('LOCAL-EXPORT-visible-bars.csv')
  expect(csv).toBe([
    header,
    '1709251199,-1.234567,0,-2.000001,-0.000001,0.000001',
    '1709251200,0,1.000001,-0.123456,1.000001,19.000009',
    '',
  ].join('\r\n'))
  expect((await catalogContents(page)).series).toEqual(before)
  await openImport(page, 'ROUNDTRIP', csv)
  await submitImport(page, 'ROUNDTRIP')
  await expect(primary(page).getByLabel(/^ROUNDTRIP interactive/)).toBeVisible()
  expect((await catalogContents(page)).series.find(row => row.id === 'LOCAL:ROUNDTRIP').barCount).toBe(2)
})

test('research CSV exports the visible range and aligned indicator values with provenance', async ({ page }) => {
  await page.goto('/')
  const firstSecond = Date.parse('2025-06-02T14:00:00Z') / 1000
  const rows = Array.from({ length: 36 }, (_, i) =>
    [firstSecond + i * 60, i + 1, i + 1, i + 1, i + 1, 1].join(','))
  await openImport(page, 'RESEARCH', [header, ...rows].join('\n'))
  await page.getByText('Series details', { exact: true }).click()
  await page.getByLabel('Bar interval').fill('60 seconds')
  await page.getByLabel('Source', { exact: true }).fill('=sample "quoted", label')
  await page.getByLabel('Usage grant').fill('Local fixture')
  await page.getByLabel('Adjustment policy').fill('raw')
  await submitImport(page, 'RESEARCH')
  const pane = primary(page)
  await pane.getByRole('button', { name: '30', exact: true }).click()
  await pane.getByRole('button', { name: 'Earlier bars' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–30 of 36')
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const result = await downloadCsv(page, pane)
  const lines = result.csv.trimEnd().split('\r\n')
  const provenance = `"LOCAL","RESEARCH","import","'=sample ""quoted"", label","60 seconds","Local fixture","raw"`
  expect(result.name).toBe('LOCAL-RESEARCH-visible-analysis.csv')
  expect(lines).toHaveLength(31)
  expect(lines[0]).toBe(header + ',venue,symbol,source_kind,source,bar_interval,usage_grant,adjustment_policy,sma_20')
  expect(lines[1]).toBe(rows[0] + ',' + provenance + ',')
  expect(lines[19]).toBe(rows[18] + ',' + provenance + ',')
  expect(lines[20]).toBe(rows[19] + ',' + provenance + ',10.5')
  expect(lines.at(-1)).toBe(rows[29] + ',' + provenance + ',20.5')
  await pane.getByLabel('Range').selectOption('all')
  const all = await downloadCsv(page, pane)
  expect(all.csv.trimEnd().split('\r\n')).toHaveLength(37)
  expect(all.csv.trimEnd().split('\r\n').at(-1)).toBe(rows[35] + ',' + provenance + ',26.5')
})
