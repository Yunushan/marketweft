import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = { cwd: root, encoding: 'utf8' };
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps', '--locked'], options));
const target = 'wasm32-unknown-unknown';
execFileSync('cargo', ['build', '--locked', '--release', '--lib', '-p', 'marketweft-core', '--target', target], {
  ...options, stdio: 'inherit',
});
const filename = 'marketweft_core.wasm';
const asset = join(root, 'apps', 'terminal', 'public', filename);
mkdirSync(dirname(asset), { recursive: true });
copyFileSync(join(metadata.target_directory, target, 'release', filename), asset);
console.log('Updated apps/terminal/public/' + filename);
