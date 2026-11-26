import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')

test('volume and TPO profiles reconcile exact areas across late observations offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await catalogContents(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Recorded footprint' }).click()
  await page.getByRole('button', { name: 'Load footprint demo' }).click()
  const result = page.getByRole('region', { name: 'Footprint and cumulative delta' })
  await result.getByText('Price profiles', { exact: true }).click()
  const profiles = result.getByRole('region', { name: 'Price profiles', exact: true })
  const volume = profiles.getByRole('group', { name: 'Volume profile', exact: true })
  const tpo = profiles.getByRole('group', { name: 'Time-price opportunities', exact: true })
  const definition = (group, name) => group.locator('dt').filter({ hasText: new RegExp('^' + name + '$') })
    .locator('..').getByRole('definition')
  const row = label => profiles.getByRole('table', { name: 'Price profile bins' }).locator('tbody tr').filter({
    has: page.getByRole('rowheader', { name: label, exact: true }),
  })
  const report = async known => {
    await page.getByLabel('Footprint known time (UTC)').fill(utc(known))
    await page.getByRole('button', { name: 'Query footprint' }).click()
  }
  const download = async () => {
    const pending = page.waitForEvent('download')
    await profiles.getByRole('button', { name: 'Download price profiles' }).click()
    const csv = await pending
    expect(csv.suggestedFilename()).toBe('price-profiles.csv')
    return (await readFile(await csv.path(), 'utf8')).trimEnd().split('\r\n')
  }

  await page.getByLabel('Execution through (UTC)').fill(utc(60))
  await report(60)
  await profiles.getByRole('button', { name: 'Calculate profiles' }).click()
  await expect(definition(volume, 'Point of control')).toHaveText('[100.5, 101)')
  await expect(definition(volume, 'Value area')).toHaveText('[100.5, 101.5)')
  await expect(definition(volume, 'Covered / total')).toHaveText('5 / 6.5')
  await expect(definition(tpo, 'Point of control')).toHaveText('[-0.5, 0)')
  await expect(definition(tpo, 'Covered / total')).toHaveText('3 / 4')
  await expect(row('[-0.5, 0)').getByRole('cell').nth(1)).toHaveText('2')
  const early = await download()
  expect(early).toHaveLength(4)
  expect(early[1]).toBe(
    '"NASDAQ:NVDA","Synthetic aggressor trades",60,0.5,1969-12-31T23:59:59Z,1970-01-01T00:01:00Z,1970-01-01T00:01:00Z,70,3,-0.5,0,1.25,0.25,0,1.5,2,2,100.5,101,100.5,101.5,5,6.5,-0.5,0,-0.5,101,3,4',
  )

  await report(61)
  await expect(definition(volume, 'Covered / total')).toHaveText('13.000001 / 16.600001')
  await expect(definition(tpo, 'Covered / total')).toHaveText('3 / 4')
  await expect(row('[-0.5, 0)').getByRole('cell').nth(1)).toHaveText('2')
  await expect(row('[-0.5, 0)').getByRole('cell').last()).toHaveText('3')
  await expect(row('[100.5, 101)').getByRole('cell').nth(4)).toHaveText('3')
  await report(65)
  await expect(definition(volume, 'Covered / total')).toHaveText('13.000001 / 16.600001')
  await report(60)
  expect(await download()).toEqual(early)

  const target = profiles.getByLabel('Value area target (%)')
  const apply = profiles.getByRole('button', { name: 'Calculate profiles' })
  await target.fill('0')
  await apply.click()
  await expect(profiles.getByRole('alert')).toContainText('0.01% to 100%')
  expect(await download()).toEqual(early)
  await target.fill('100')
  await apply.click()
  await expect(definition(volume, 'Covered / total')).toHaveText('6.5 / 6.5')
  await expect(definition(tpo, 'Covered / total')).toHaveText('4 / 4')
  await report(-1)
  await expect(profiles.getByRole('status')).toHaveText('No price bins match these execution and observation cutoffs.')
  await expect(profiles.getByRole('button', { name: 'Download price profiles' })).toHaveCount(0)
  await report(60)
  await expect(definition(volume, 'Value area')).toHaveText('[-0.5, 101.5)')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Return to workspace' }).click()
  expect(await catalogContents(page)).toEqual(original)
})
