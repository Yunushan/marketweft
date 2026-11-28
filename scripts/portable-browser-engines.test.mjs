import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { expect, firefox, webkit } from '@playwright/test';
import { canonicalJson } from '../apps/terminal/src/canonical-json.ts';

const archiveRoot = process.env.MARKETWEFT_PORTABLE_ROOT;
assert.ok(archiveRoot, 'Set MARKETWEFT_PORTABLE_ROOT to the extracted browser package.');
const root = resolve(archiveRoot);
const { startTerminal } = await import(pathToFileURL(join(root, 'serve-terminal.mjs')));

const csv = [
  'time,open,high,low,close,volume',
  '2025-01-31T23:59:00Z,-2,1,-3,1,4.500001',
  '2025-02-01T00:01:00Z,1,2,-2,1.234567,12.000009',
].join('\n');

async function prepare(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(url);
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return page;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

async function expectQuote(page) {
  await expect(page.getByRole('heading', { name: 'PORTABLE', exact: true })).toBeVisible();
  await expect(page.locator('.quote strong')).toHaveText('1.234567');
}

for (const engine of [firefox, webkit]) {
  test(`the packaged terminal imports, calculates and restores offline in ${engine.name()}`, { timeout: 75_000 }, async t => {
    const server = await startTerminal(join(root, 'dist'), 0);
    t.after(async () => { if (server.listening) await closeServer(server); });
    const url = `http://127.0.0.1:${server.address().port}/`;
    const browser = await engine.launch();
    t.after(() => browser.close());
    const [page, clean] = await Promise.all([
      browser.newContext().then(context => prepare(context, url)),
      browser.newContext().then(context => prepare(context, url)),
    ]);
    await closeServer(server);
    await assert.rejects(fetch(url), { name: 'TypeError' });

    await page.reload();
    await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Symbol', { exact: true }).fill('PORTABLE');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'portable-ohlcv.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
    });
    await dialog.getByText('Series details', { exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Automated use', exact: true }).selectOption('granted');
    await dialog.getByRole('combobox', { name: 'Redistribution', exact: true }).selectOption('granted');
    await dialog.getByRole('button', { name: 'Import to watchlist' }).click();
    await expectQuote(page);

    await page.getByRole('button', { name: 'Monthly returns calendar', exact: true }).click();
    await page.getByLabel('Observed through (UTC)', { exact: true }).fill('2025-02-01T00:01:00Z');
    await page.getByRole('button', { name: 'Calculate monthly returns', exact: true }).click();
    const months = page.getByRole('table', { name: 'Monthly returns by UTC calendar year' });
    await expect(months.locator('tbody td').nth(1)).toContainText('+23.4567%');
    await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
    await page.reload();
    await expectQuote(page);

    await page.getByRole('button', { name: 'Workspace backup', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export workspace', exact: true }).click(),
    ]);
    const bytes = await readFile(await download.path());
    const backup = JSON.parse(bytes);
    assert.equal(backup.manifest.preferences.selected, 'LOCAL:PORTABLE');
    assert.equal(backup.manifest.series.find(row => row.id === 'LOCAL:PORTABLE').csv, csv);
    const canonical = canonicalJson(backup.manifest, 'The exported manifest is outside the workspace format.');
    assert.equal(backup.sha256, createHash('sha256').update(canonical).digest('hex'));

    await clean.reload();
    await expect(clean.getByRole('heading', { name: 'PORTABLE', exact: true })).toHaveCount(0);
    await clean.getByRole('button', { name: 'Workspace backup', exact: true }).click();
    await clean.getByLabel('Backup file', { exact: true }).setInputFiles({
      name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes,
    });
    await clean.getByRole('button', { name: 'Restore workspace', exact: true }).click();
    await expect(clean.getByText('Workspace restored.', { exact: true })).toBeVisible();
    await clean.reload();
    await expectQuote(clean);
    t.diagnostic(`${engine.name()} ${browser.version()} on ${process.platform} ${process.arch}`);
  });
}
