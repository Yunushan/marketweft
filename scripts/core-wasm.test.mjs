import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { instantiateMarketCore } from '../apps/terminal/src/market-core.ts';

const [wasm, csv] = await Promise.all([
  readFile(new URL('../apps/terminal/public/marketweft_core.wasm', import.meta.url)),
  readFile(new URL('../crates/core/tests/fixtures/reference.csv', import.meta.url), 'utf8'),
]);
const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer);

test('Wasm split snapshots gate all fields and revisions by replay observation time', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-split-' + name + '.csv', import.meta.url), 'utf8');
  const bars = core.parseCsv(await fixture('ohlcv'));
  const saved = structuredClone(bars);
  const actionText = await fixture('actions');
  const splits = core.splitBook('DEMO:SPLIT', actionText);
  const [split] = splits;
  const asOf = split.effectiveAt;
  assert.throws(() => core.splitBook('LOCAL:SPLIT', actionText), /selected VENUE:SYMBOL/);
  assert.deepEqual(core.adjustSplits(bars.slice(0, 12), splits, asOf - 1), bars.slice(0, 12));
  const adjusted = core.adjustSplits(bars.slice(0, 13), splits, asOf + 600);
  assert.deepEqual(adjusted[11], {
    time: bars[11].time, open: 52.75, high: 53.75, low: 52.25,
    close: 53.25, volume: 1620.000002,
  });
  assert.deepEqual(adjusted[12], bars[12]);
  const delayed = { ...split, observedAt: asOf + 610 };
  const revision = { ...delayed, observedAt: asOf + 620, newShares: 3 };
  assert.deepEqual(core.adjustSplits(bars.slice(0, 13), [delayed, revision], asOf + 609), bars.slice(0, 13));
  assert.equal(core.adjustSplits(bars.slice(0, 13), [delayed, revision], asOf + 610)[11].close, 53.25);
  assert.equal(core.adjustSplits(bars.slice(0, 13), [delayed, revision], asOf + 620)[11].close, 35.5);
  assert.deepEqual(core.adjustSplits(bars.slice(0, 13), [delayed, revision], asOf + 609), bars.slice(0, 13));
  assert.deepEqual(bars, saved);
});

test('Wasm replay schedules the expected UTC cutoffs and every indicator prefix', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/' + name, import.meta.url), 'utf8');
  const bars = core.parseCsv(await fixture('nyse-2025-replay-ohlcv.csv'));
  const calendar = await fixture('nyse-2025-replay-sessions.csv');
  const events = core.replay(calendar, 1800, bars);
  assert.equal(events.length, 294);
  const utc = text => Date.parse(text) / 1000;
  const opens = events.filter(event => event.kind === 'open');
  assert.deepEqual(opens.slice(0, 2).map(event => [event.eventTime, event.utcOffsetMinutes]), [
    [utc('2025-10-31T13:30:00Z'), -240], [utc('2025-11-03T14:30:00Z'), -300],
  ]);
  assert.deepEqual(events.filter(event => event.kind === 'missing').map(event => [event.eventTime, event.observedAt, event.barIndex]), [
    [utc('2025-11-03T15:00:00Z'), utc('2025-11-03T15:30:00Z'), null],
  ]);
  assert.equal(events.at(-1).observedAt, utc('2025-11-28T18:00:00Z'));
  assert.equal(events.at(-1).earlyClose, true);
  const batch = [['sma', 20], ['ema', 9]].map(([kind, period]) => [kind, period, core.indicator(kind, period, bars)]);
  const visible = [];
  for (const event of events) {
    if (event.barIndex !== null) {
      assert.equal(event.barIndex, visible.length);
      assert.equal(event.observedAt, bars[event.barIndex].time + 1800);
      visible.push(bars[event.barIndex]);
    }
    for (const [kind, period, expected] of batch) {
      assert.deepEqual(core.indicator(kind, period, visible), expected.slice(0, visible.length));
    }
  }
  assert.equal(visible.length, bars.length);
  assert.throws(() => core.replay(calendar, 1800, [{ ...bars[0], time: bars[0].time + 1 }]), /off the interval grid/);
});

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
