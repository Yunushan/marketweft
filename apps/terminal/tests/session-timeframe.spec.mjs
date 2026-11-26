import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { downloadWorkspace, header, openImport, submitImport } from './catalog-fixtures.mjs'

test('session timeframes respect the supplied UTC opens, DST shift and early close', async ({ page, context }) => {
  await page.goto('/')
  const csv = [
    header,
    '2025-10-31T13:30:00Z,5,7,3,6,0.000001',
    '2025-10-31T14:30:00Z,6,8,1,7,0.000002',
    '2025-11-03T15:30:00Z,7,8,6,7,2',
    '2025-11-28T17:30:00Z,-1,3,-2,1,1',
  ].join('\n')
  await openImport(page, 'SESSION', csv)
  await submitImport(page, 'SESSION')
  const before = await downloadWorkspace(page)
  await context.setOffline(true)
  const pane = page.getByRole('region', { name: 'Primary chart pane' })
  await pane.getByText('Timeframe', { exact: true }).click()
  await pane.getByLabel('Source interval (seconds)').fill('3600')
  await pane.getByLabel('Target interval (seconds)').fill('7200')
  await pane.getByLabel('Session calendar CSV (optional)').setInputFiles({
    name: 'sessions.csv', mimeType: 'text/csv', buffer: Buffer.from([
      'date,open_utc,close_utc,utc_offset_minutes,kind',
      '2025-10-31,2025-10-31T13:30:00Z,2025-10-31T20:00:00Z,-240,regular',
      '2025-11-03,2025-11-03T14:30:00Z,2025-11-03T21:00:00Z,-300,regular',
      '2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early',
    ].join('\n')),
  })
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–3 of 3')
  await expect(pane.getByText('1/2 source bars', { exact: true })).toBeVisible()
  await expect(pane.getByText('Closes 2025-11-28 18:00:00 UTC · Early session', { exact: true })).toBeVisible()
  await pane.getByText('Export CSV', { exact: true }).click()
  await pane.getByLabel('Contents').selectOption('analysis')
  const [download] = await Promise.all([
    page.waitForEvent('download'), pane.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const [columns, beforeDst, afterDst, early] =
    (await readFile(await download.path(), 'utf8')).trimEnd().split('\r\n')
  const utc = text => Date.parse(text + 'Z') / 1000
  expect(columns).toContain('bucket_close_utc,session_open_utc,session_kind,session_calendar')
  expect(beforeDst.startsWith(utc('2025-10-31T13:30:00') + ',5,8,1,7,0.000003,')).toBe(true)
  expect(afterDst.startsWith(utc('2025-11-03T14:30:00') + ',7,8,6,7,2,')).toBe(true)
  expect(early.startsWith(utc('2025-11-28T16:30:00') + ',-1,3,-2,1,1,')).toBe(true)
  expect(early.endsWith(',3600,7200,1,2,' + utc('2025-11-28T18:00:00') + ',' +
    utc('2025-11-28T14:30:00') + ',early,"sessions.csv",')).toBe(true)
  expect((await downloadWorkspace(page)).manifest).toEqual(before.manifest)

  await pane.getByLabel('Session calendar CSV (optional)').setInputFiles({
    name: 'bad-calendar.csv', mimeType: 'text/csv', buffer: Buffer.from('invalid calendar'),
  })
  await pane.getByRole('button', { name: 'Apply timeframe' }).click()
  await expect(pane.getByRole('alert')).toHaveText(/Expected calendar header/)
  await expect(pane.getByText('Closes 2025-11-28 18:00:00 UTC · Early session', { exact: true })).toBeVisible()
  await pane.getByRole('button', { name: 'Show source bars' }).click()
  await expect(pane.getByTestId('viewport')).toHaveText('1–4 of 4')
})
