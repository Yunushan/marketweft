import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.mjs'
import { catalogContents } from './catalog-fixtures.mjs'

const utc = time => '2025-06-02T' + time + 'Z'

test('offline rank comparison keeps additions, missing closes, revisions, removals and ticker reuse distinct', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const original = await catalogContents(page)
  await page.getByRole('button', { name: 'Historical replay' }).click()
  await page.getByRole('button', { name: 'Open universe replay' }).click()
  await page.getByRole('button', { name: 'Start universe demo' }).click()
  const screen = page.getByRole('region', { name: 'Universe screen' })
  await screen.getByRole('button', { name: 'Load demo prices' }).click()
  await screen.getByText('Compare ranks at two cutoffs', { exact: true }).click()
  const panel = screen.locator('details').filter({ has: page.getByText('Compare ranks at two cutoffs', { exact: true }) })
  const table = panel.getByRole('table', { name: 'Universe rank comparison' })
  const beta = table.getByRole('row', { name: /BETA-001/ }).getByRole('cell')
  const alfa = table.getByRole('row', { name: /ALFA-001/ }).getByRole('cell')
  const reused = table.getByRole('row', { name: /BETA-002/ }).getByRole('cell')

  async function compare(beforeEffective, beforeKnown, afterEffective, afterKnown) {
    await panel.getByLabel('Before effective (UTC)').fill(utc(beforeEffective))
    await panel.getByLabel('Before known (UTC)').fill(utc(beforeKnown))
    await panel.getByLabel('After effective (UTC)').fill(utc(afterEffective))
    await panel.getByLabel('After known (UTC)').fill(utc(afterKnown))
    await panel.getByRole('button', { name: 'Compare ranks', exact: true }).click()
  }
  await compare('14:05:00', '14:05:00', '14:10:00', '14:11:59')
  await expect(beta.nth(1)).toHaveText('Added')
  await expect(beta.nth(2)).toHaveText('Out of universe')
  await expect(beta.nth(3)).toContainText('Unranked')
  await expect(beta.nth(3)).toContainText('Missing target close')
  await expect(beta.nth(4)).toHaveText('—')
  await compare('14:10:00', '14:12:00', '14:10:00', '14:16:00')
  await expect(beta.nth(2)).toContainText('12%')
  await expect(beta.nth(3)).toContainText('1%')
  await expect(beta.nth(4)).toHaveText('-1')
  await expect(alfa.nth(4)).toHaveText('+1')

  async function evidence() {
    const pending = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download rank comparison CSV' }).click()
    const lines = (await readFile(await (await pending).path(), 'utf8')).trimEnd().split('\r\n')
    const names = lines.shift().split(',')
    return lines.map(line => Object.fromEntries(line.split(',').map((value, index) => [
      names[index], value.replace(/^"|"$/g, ''),
    ])))
  }
  const rows = await evidence()
  expect(rows.find(row => row.listing_id === 'BETA-001')).toMatchObject({
    baseline_at: utc('14:00:00'), before_effective_at: utc('14:10:00'), after_effective_at: utc('14:10:00'),
    before_known_at: utc('14:12:00'), after_known_at: utc('14:16:00'),
    before_status: 'member', before_change_id: 'BETA-JOIN',
    before_baseline_close: '50', before_target_close: '56', before_target_known_at: utc('14:12:00'),
    after_target_close: '50.5', after_target_known_at: utc('14:16:00'),
    transition: 'retained', rank_move: '-1', membership_source: 'Synthetic membership reports',
    price_source: 'Synthetic close prices',
  })
  await panel.getByLabel('Before known (UTC)').fill('2025-06-02')
  await panel.getByRole('button', { name: 'Compare ranks', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('YYYY-MM-DDTHH:MM:SSZ')
  expect(await evidence()).toEqual(rows)

  await compare('14:20:00', '14:24:59', '14:20:00', '14:25:00')
  await expect(alfa.nth(1)).toHaveText('Removed')
  await expect(alfa.nth(3)).toHaveText('Removed')
  const removed = await evidence()
  expect(removed.find(row => row.listing_id === 'ALFA-001')).toMatchObject({
    after_change_id: 'ALFA-REMOVE', after_membership_effective_at: utc('14:20:00'),
    after_membership_known_at: utc('14:25:00'), after_rank: '', after_target_close: '',
  })

  await compare('14:20:00', '14:25:00', '14:45:00', '14:45:00')
  await expect(beta.nth(1)).toHaveText('Delisted')
  await expect(reused.nth(1)).toHaveText('Added')
  await expect(reused.nth(3)).toContainText('Missing baseline close')
  await expect(table.getByRole('row', { name: /ALFA-001/ })).toHaveCount(0)
  expect((await evidence()).find(row => row.listing_id === 'BETA-002')).toMatchObject({
    after_change_id: 'BETA-NEW', after_target_close: '75', after_baseline_close: '', rank_move: '',
  })

  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await screen.getByLabel('Baseline time (UTC)').fill(utc('14:01:00'))
  // Advance the outer replay independently before changing its shared baseline.
  await page.getByRole('button', { name: 'Next cutoff' }).click()
  await screen.getByRole('button', { name: 'Set baseline' }).click()
  await expect(panel.getByRole('status')).toContainText('baseline changed')
  await expect(panel.getByRole('button', { name: 'Download rank comparison CSV' })).toHaveCount(0)
  expect(await catalogContents(page)).toEqual(original)
})
