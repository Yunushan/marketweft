import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { instantiateMarketCore } from '../apps/terminal/src/market-core.ts';

const wasm = await readFile(new URL('../apps/terminal/public/marketweft_core.wasm', import.meta.url));
const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer);
const count = 100_000;
const passes = 10;
const csv = ['time,open,high,low,close,volume',
  ...Array.from({ length: count }, (_, i) => i + ',100.10,102,99,101.12,1000.5')].join('\n');
const bars = core.parseCsv(csv);
for (const [label, run] of [
  ['CSV ingest', () => core.parseCsv(csv)],
  ['SMA(20)', () => core.indicator('sma', 20, bars)],
  ['EMA(20)', () => core.indicator('ema', 20, bars)],
]) {
  run();
  const start = performance.now();
  for (let i = 0; i < passes; i++) {
    if (run().length !== count) throw new Error('Benchmark output length mismatch.');
  }
  const duration = performance.now() - start;
  console.log(label + ': ' + (duration / passes).toFixed(2) + ' ms/pass, ' +
    Math.round(count * passes * 1000 / duration) + ' bars/s (10 x 100000, JS + WASM)');
}
