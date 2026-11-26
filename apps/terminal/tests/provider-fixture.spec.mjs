import { expect, test } from './fixtures.mjs'
import { catalogContents, downloadWorkspace, microCSV, submitImport } from './catalog-fixtures.mjs'

const fixture = {
  format: 'marketweft-provider-history',
  version: 1,
  provider: 'synthetic-sample',
  venue: 'DEMO',
  symbol: 'LICENSED',
  barInterval: '1 second',
  grant: 'Synthetic fixture agreement 1',
  adjustmentPolicy: 'Raw OHLCV',
  permissions: {
    display: 'granted', storage: 'granted', redistribution: 'restricted',
    automatedUse: 'unconfirmed', expiresOn: '2099-12-31',
  },
  csv: microCSV,
}

test('provider fixture preflight checks identity, permissions and UTC expiry before catalog writes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2099-12-31T23:59:59.999Z'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const before = await catalogContents(page)
  const dialog = page.getByRole('dialog')
  async function openProviderImport() {
    await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Input format', exact: true }).selectOption('provider')
  }
  async function select(packet) {
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'history.provider.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(packet)),
    })
  }
  async function rejects(packet, message) {
    await select(packet)
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
  }

  await openProviderImport()
  expect(await dialog.getByLabel('Symbol', { exact: true }).count()).toBe(0)
  await rejects({ ...fixture, provider: 'Invalid/Provider' }, 'Supply a lowercase provider identifier.')
  await rejects({ ...fixture, grant: '' }, 'Missing or empty provider grant.')
  await rejects({
    ...fixture,
    permissions: { ...fixture.permissions, storage: 'unconfirmed' },
  }, 'A provider history fixture requires granted display and storage permissions.')
  const { expiresOn, ...undated } = fixture.permissions
  await rejects({
    ...fixture, permissions: undated,
  }, 'A provider history fixture requires a UTC grant expiration date.')
  await rejects({
    ...fixture, permissions: { ...fixture.permissions, expiresOn: '2099-12-30' },
  }, 'The provider history fixture grant has expired.')
  expect(await catalogContents(page)).toEqual(before)

  await select(fixture)
  await submitImport(page, 'LICENSED')
  const committed = await catalogContents(page)
  expect(committed.series).toHaveLength(1)
  expect(committed.series[0]).toMatchObject({
    id: 'DEMO:LICENSED', csv: microCSV, barCount: 2,
    descriptor: {
      version: 2, source: fixture.provider, usageGrant: fixture.grant,
      sourceRights: { ...undated, expiresOn },
    },
  })

  await page.clock.setFixedTime(new Date('2100-01-01T00:00:00.000Z'))
  await openProviderImport()
  await rejects({ ...fixture, symbol: 'AFTER' }, 'The provider history fixture grant has expired.')
  expect(await catalogContents(page)).toEqual(committed)
  await page.keyboard.press('Escape')
  const backup = await downloadWorkspace(page)
  expect(backup.version).toBe(7)
  expect(backup.manifest.series[0].descriptor).toEqual(committed.series[0].descriptor)
})
