import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import test from 'node:test';
import { startTerminal } from './serve-terminal.mjs';

async function temporary(t) {
  const parent = resolve(tmpdir());
  const path = await mkdtemp(join(parent, 'marketweft-launcher-'));
  t.after(async () => {
    assert.equal(dirname(resolve(path)), parent);
    assert.ok(basename(path).startsWith('marketweft-launcher-'));
    await rm(path, { recursive: true, force: true });
  });
  return path;
}

async function fixture(root) {
  await mkdir(join(root, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'index.html'), '<title>MarketWeft — Local</title>'),
    writeFile(join(root, 'assets', 'app.js'), 'console.log("ok");'),
    writeFile(join(root, 'marketweft_core.wasm'), Buffer.from([0, 97, 115, 109])),
    writeFile(join(root, 'sw.js'), 'self.addEventListener("fetch", () => {});'),
    writeFile(join(root, 'manifest.webmanifest'), '{}'),
    writeFile(join(root, '.env'), 'hidden'),
    writeFile(join(root, 'assets', 'app.js.map'), 'source'),
  ]);
}

function get(port, path, options = {}) {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, path, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => ok({ headers: res.headers, status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

test('a loopback server serves built assets with browser and service-worker MIME types', async t => {
  const root = await temporary(t);
  await fixture(root);
  const server = await startTerminal(root, 0);
  t.after(() => new Promise(done => server.close(done)));
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');
  for (const [path, type] of [
    ['/', 'text/html; charset=utf-8'], ['/assets/app.js?v=123', 'text/javascript; charset=utf-8'],
    ['/sw.js', 'text/javascript; charset=utf-8'], ['/marketweft_core.wasm', 'application/wasm'],
    ['/manifest.webmanifest', 'application/manifest+json'],
  ]) {
    const res = await get(port, path);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], type);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(Number(res.headers['content-length']), res.body.byteLength);
    const head = await get(port, path, { method: 'HEAD' });
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['content-length'], res.headers['content-length']);
  }
  assert.deepEqual((await get(port, '/marketweft_core.wasm')).body, Buffer.from([0, 97, 115, 109]));
  assert.equal((await get(port, '/', { headers: { Host: 'unrelated.example' } })).status, 403);
  const denied = await get(port, '/', { method: 'POST' });
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.allow, 'GET, HEAD');
});

test('file access is limited to preloaded public assets', async t => {
  const parent = await temporary(t);
  const root = join(parent, 'public');
  await fixture(root);
  await mkdir(join(parent, 'outside'));
  await writeFile(join(parent, 'outside', 'private.txt'), 'private');
  await symlink(join(parent, 'outside'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const server = await startTerminal(root, 0);
  t.after(() => new Promise(done => server.close(done)));
  const { port } = server.address();
  for (const path of ['/../outside/private.txt', '/%2e%2e%2foutside%2fprivate.txt', '/assets%5C..%5C.env',
    '/.env', '/assets/app.js.map', '/linked/private.txt', '/package.json', '//outside/private.txt']) {
    assert.equal((await get(port, path)).status, 404, path);
  }
  assert.equal((await get(port, '/%GG')).status, 400);
});

for (const repoLayout of [false, true]) {
  test('CLI locates built assets in ' + (repoLayout ? 'the repository' : 'the extracted archive'), { timeout: 10_000 }, async t => {
    const root = await temporary(t);
    const script = repoLayout ? join(root, 'scripts', 'serve-terminal.mjs') : join(root, 'serve-terminal.mjs');
    await mkdir(dirname(script), { recursive: true });
    await copyFile(new URL('./serve-terminal.mjs', import.meta.url), script);
    await fixture(repoLayout ? join(root, 'apps', 'terminal', 'dist') : join(root, 'dist'));
    const child = spawn(process.execPath, [script, '--port', '0'], { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    });
    const lines = createInterface({ input: child.stdout });
    const { value: banner } = await lines[Symbol.asyncIterator]().next();
    lines.close();
    const url = new URL(banner.match(/https?:\/\/\S+/)[0]);
    assert.equal((await get(Number(url.port), '/')).body.toString(), '<title>MarketWeft — Local</title>');
  });
}
