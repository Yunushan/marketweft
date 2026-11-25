import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { instantiateMarketCore } from '../apps/terminal/src/market-core.ts';

const [wasm, csv] = await Promise.all([
  readFile(new URL('../apps/terminal/public/marketweft_core.wasm', import.meta.url)),
  readFile(new URL('../crates/core/tests/fixtures/reference.csv', import.meta.url), 'utf8'),
]);
const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer);

test('the shipped wasm asset reproduces the native golden reference', () => {
  const bars = core.parseCsv(csv);
  assert.equal(core.instrument(' xnas', 'aapl '), 'XNAS:AAPL');
  assert.deepEqual(bars[0], { time: 1708905600, open: 9, high: 11, low: 8, close: 10, volume: 100.01 });
  assert.deepEqual(core.indicator('sma', 3, bars), [null, null, 10, 11, 10.666667, 12.333333, 12, 13.666667]);
  assert.deepEqual(core.indicator('ema', 3, bars), [null, null, 10, 11.5, 10.75, 12.375, 12.1875, 13.59375]);
});

test('errors preserve their messages and the calculation engine remains usable', () => {
  const bars = core.parseCsv(csv);
  assert.throws(() => core.parseCsv(csv + '0,0,0,0,0,0\n'), /increase strictly/);
  assert.throws(() => core.instrument('A:A', 'b'), /instrument component/);
  assert.throws(() => core.indicator('sma', 1.5, bars), /100,000/);
  assert.throws(() => core.indicator('ema', 1, [{ ...bars[0], close: NaN }]), /finite/);
  assert.throws(() => core.indicator('ema', 1, [{ ...bars[0], close: 0.0000001 }]), /six-place/);
  assert.deepEqual(core.indicator('ema', 1, []), []);
  assert.equal(core.parseCsv(csv).length, 8);
});

test('large import survives memory growth and preserves extreme six-place ticks', () => {
  const n = 100_000;
  const rows = Array.from({ length: n }, (_, i) => i + ',-1999999999.999999,1999999999.99999,-2000000000,1999999999.999989,0.123456');
  const bars = core.parseCsv(['time,open,high,low,close,volume', ...rows].join('\n'));
  assert.equal(bars.length, n);
  assert.equal(bars[n - 1].open, -1999999999.999999);
  assert.equal(bars[n - 1].volume, 0.123456);
  assert.equal(core.indicator('sma', n, bars)[n - 1], 1999999999.999989);
  assert.equal(core.parseCsv(csv)[0].close, 10);
});
