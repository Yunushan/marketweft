#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HOST = '127.0.0.1';
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}));

// The packaged build is small. Snapshot its public assets at startup so HTTP
// requests only look up known keys and never construct a filesystem path.
async function loadAssets(root) {
  const assets = new Map();
  async function visit(folder, prefix) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const key = prefix + '/' + entry.name;
      const file = join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(file, key);
      } else if (entry.isFile()) {
        const type = MIME.get(extname(entry.name).toLowerCase());
        if (type) assets.set(key, { type, body: await readFile(file) });
      }
    }
  }
  await visit(root, '');
  if (!assets.has('/index.html')) throw new Error('The terminal build is missing index.html.');
  assets.set('/', assets.get('/index.html'));
  return assets;
}

export async function startTerminal(root, port = 4173) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }
  const assets = await loadAssets(root);
  const server = createServer((req, res) => {
    function reply(status, type, body) {
      res.writeHead(status, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    }
    const plain = 'text/plain; charset=utf-8';
    const host = req.headers.host ?? '';
    if (!new Set([HOST, 'localhost', HOST + ':' + req.socket.localPort,
      'localhost:' + req.socket.localPort]).has(host.toLowerCase())) {
      return reply(403, plain, 'This terminal accepts localhost requests only.\n');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return reply(405, plain, 'Method not allowed.\n');
    }
    let key;
    try {
      key = decodeURIComponent(req.url.split('?', 1)[0]);
    } catch {
      return reply(400, plain, 'Invalid URL encoding.\n');
    }
    const asset = assets.get(key);
    if (!asset) return reply(404, plain, 'Asset not found.\n');
    reply(200, asset.type, asset.body);
  });
  await new Promise((success, failure) => {
    server.once('error', failure);
    server.listen(port, HOST, () => {
      server.off('error', failure);
      success();
    });
  });
  return server;
}

async function main() {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '4173' },
    help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: node serve-terminal.mjs [--port 4173]\nServes the terminal on 127.0.0.1. Press Ctrl+C to stop.');
    return;
  }
  if (!/^\d+$/.test(values.port)) throw new Error('Provide a numeric port, for example --port 4173.');
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'dist')];
  if (basename(here) === 'scripts') candidates.push(join(here, '..', 'apps', 'terminal', 'dist'));
  for (const root of candidates) {
    if (!(await stat(join(root, 'index.html')).catch(() => null))?.isFile()) continue;
    const server = await startTerminal(root, Number(values.port));
    console.log('MarketWeft is running at http://' + HOST + ':' + server.address().port + '/');
    console.log('Press Ctrl+C to stop.');
    return;
  }
  throw new Error('Terminal build missing. Extract the entire quick-start archive, or run npm run build in the repository.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'This port is in use. Choose another with --port 4174.'
      : error.message);
    process.exitCode = 1;
  });
}
