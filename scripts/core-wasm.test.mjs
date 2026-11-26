import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { instantiateMarketCore } from '../apps/terminal/src/market-core.ts';

const [wasm, csv] = await Promise.all([
  readFile(new URL('../apps/terminal/public/marketweft_core.wasm', import.meta.url)),
  readFile(new URL('../crates/core/tests/fixtures/reference.csv', import.meta.url), 'utf8'),
]);
const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer);

test('financial Wasm bridge returns exact balances and revision-specific multiples', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-financial-' + name + '.csv', import.meta.url), 'utf8');
  const [filings, caps] = await Promise.all([fixture('filings'), fixture('market-caps')]);
  const iso = t => '2025-04-03T' + t + 'Z';
  assert.deepEqual(core.financialIndex(filings, caps).map(row => row.id), ['DEMO-ALFA', 'DEMO-BETA']);
  const at = (known, issuer = 'DEMO-ALFA') => core.financialAsOf(filings, caps, issuer, iso('14:00:00'), iso(known));
  const original = at('14:19:59');
  assert.deepEqual(original.priceEarnings, { kind: 'value', units: 10000000n });
  assert.equal(original.marketCap.ticks, 12000000000000000n);
  const revised = at('14:20:00');
  assert.equal(revised.filing.sourceId, 'ALFA-FY24-A1');
  assert.equal(revised.filing.operatingCashFlow, -250000000000000n);
  assert.deepEqual(revised.priceEarnings, { kind: 'value', units: 15000000n });
  assert.deepEqual(revised.priceBook, { kind: 'missing-denominator' });
  assert.deepEqual(at('14:25:00'), revised);
  assert.deepEqual(at('14:35:00').priceEarnings, { kind: 'value', units: 20000000n });
  assert.deepEqual(at('14:35:00', 'DEMO-BETA').priceEarnings, { kind: 'nonpositive-denominator' });
  assert.throws(() => at('14:00:00', 'UNKNOWN'), /Select an issuer/);
});

test('sector heatmap Wasm bridge groups the screen and preserves weighted coverage', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-universe' + name + '.csv', import.meta.url), 'utf8');
  const [members, prices, sectors] = await Promise.all([fixture(''), fixture('-prices'), fixture('-sectors')]);
  const iso = t => '2025-06-02T' + t + 'Z';
  const map = (end, known) => core.sectorHeatmap(members, prices, sectors, iso('14:00:00'), iso(end), iso(known));
  const added = map('14:10:00', '14:10:00');
  assert.deepEqual([added.knownWeight, added.coveredWeight, added.contribution], [1000000, 600000, 12000n]);
  assert.deepEqual(added.groups.map(group => [group.sector, group.weightedReturn, group.listings[0].listingId]), [
    ['Technology', 20000n, 'ALFA-001'], ['Financials', null, 'BETA-001'],
  ]);
  assert.equal(map('14:10:00', '14:12:00').contribution, 60000n);
  const revised = map('14:10:00', '14:16:00').groups;
  assert.deepEqual(revised.map(group => [group.sector, group.weightedReturn]), [['Technology', 16000n]]);
  const latest = revised[0].listings[1];
  assert.deepEqual(latest, {
    listingId: 'BETA-001', instrument: 'DEMO:BETA', rank: 2, returnUnits: 10000n,
    weight: 400000, effectiveAt: Date.parse(iso('14:05:00')) / 1000,
    observedAt: Date.parse(iso('14:16:00')) / 1000, contribution: 4000n,
  });
  assert.deepEqual(map('14:35:00', '14:35:00'), { knownWeight: 0, coveredWeight: 0, contribution: null, groups: [] });
  const relisted = map('14:45:00', '14:45:00').groups[0];
  assert.equal(relisted.sector, null);
  assert.equal(relisted.listings[0].weight, null);
});

test('screen Wasm bridge retains missing ends, revisions and precise rank units', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-universe' + name + '.csv', import.meta.url), 'utf8');
  const [membership, prices] = await Promise.all([fixture(''), fixture('-prices')]);
  const iso = t => '2025-06-02T' + t + 'Z';
  const rows = (end, known) => core.universeScreen(membership, prices, iso('14:00:00'), iso(end), iso(known));
  assert.deepEqual(rows('14:10:00', '14:11:59').map(r => [r.listingId, r.rank, r.returnUnits]), [
    ['ALFA-001', 1, 20000n], ['BETA-001', null, null],
  ]);
  assert.deepEqual(rows('14:10:00', '14:12:00')[0], {
    listingId: 'BETA-001', instrument: 'DEMO:BETA', rank: 1, returnUnits: 120000n,
    baseline: { ticks: 50000000n, observedAt: Date.parse(iso('14:00:00')) / 1000 },
    current: { ticks: 56000000n, observedAt: Date.parse(iso('14:12:00')) / 1000 },
  });
  assert.equal(rows('14:10:00', '14:16:00')[0].listingId, 'ALFA-001');
  assert.equal(rows('14:20:00', '14:25:00').length, 1);
  assert.deepEqual(rows('14:35:00', '14:35:00'), []);
  assert.equal(rows('14:50:00', '14:50:00')[1].current, null);
  assert.throws(() => core.universeScreen(membership, prices, iso('14:12:00'), iso('14:10:00'), iso('14:12:00')), /Baseline/);
  assert.throws(() => core.universeScreen(membership, prices.replace('DEMO-BASKET', 'WRONG'), iso('14:00:00'), iso('14:10:00'), iso('14:16:00')), /IDs must match/);
});

test('Wasm universe queries gate each listing by knowledge and effective time', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-universe.csv', import.meta.url), 'utf8');
  const iso = t => '2025-06-02T' + t + 'Z';
  const state = (end, known) => core.universeAsOf(csv, iso(end), iso(known))
    .map(row => [row.listingId, row.status, row.changeId]);
  const book = core.universeIndex(csv);
  assert.equal(book.name, 'DEMO-BASKET');
  assert.equal(book.checkpoints.length, 11);
  assert.deepEqual(state('13:59:59', '15:20:00'), []);
  assert.deepEqual(state('14:10:00', '14:04:59'), [['ALFA-001', 'member', 'ALFA-BASE']]);
  assert.deepEqual(state('14:10:00', '14:05:00'), [['ALFA-001', 'member', 'ALFA-BASE'], ['BETA-001', 'member', 'BETA-JOIN']]);
  assert.deepEqual(state('14:20:00', '14:25:00')[0], ['ALFA-001', 'removed', 'ALFA-REMOVE']);
  const delisted = core.universeAsOf(csv, iso('14:30:00'), iso('14:35:00')).at(-1);
  assert.deepEqual(delisted, { listingId: 'BETA-001', instrument: 'DEMO:BETA', status: 'delisted', changeId: 'BETA-DELIST',
    effectiveAt: Date.parse(iso('14:30:00')) / 1000, observedAt: Date.parse(iso('14:35:00')) / 1000 });
  assert.deepEqual(state('14:45:00', '14:45:00').at(-1), ['BETA-002', 'member', 'BETA-NEW']);
  assert.deepEqual(state('15:20:00', '15:04:59')[0], ['ALFA-001', 'removed', 'ALFA-PLANNED']);
  assert.deepEqual(state('15:20:00', '15:05:00')[0], ['ALFA-001', 'member', 'ALFA-RETURN']);
  assert.throws(() => core.universeAsOf(csv, '2025-06-31T14:00:00Z', iso('14:35:00')), /UTC timestamps/);
});

test('Wasm dividend events and cash balances survive the bridge without losing precision', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-cash-dividends.csv', import.meta.url), 'utf8');
  const events = core.dividendLedger('DEMO:DIVIDEND', csv, 100);
  assert.deepEqual(events.map(e => [e.kind, e.id]), [
    ['report', 'ALPHA'], ['ex', 'ALPHA'], ['report', 'ALPHA'], ['report', 'ALPHA'],
    ['report', 'BETA'], ['pay', 'ALPHA'], ['report', 'ALPHA'],
  ]);
  assert.deepEqual(events[1].movements[0], { currency: 'USD', receivableDelta: 25000000n, cashDelta: 0n, receivable: 25000000n, cash: 0n });
  assert.equal(events[3].movements.length, 0);
  assert.equal(events[3].payAt, Date.parse('2025-06-04T14:00:00Z') / 1000);
  assert.deepEqual(events.slice(-3).map(e => [e.currency, e.movements[0].cashDelta, e.movements[0].cash]), [
    ['EUR', 10000000n, 10000000n], ['USD', 30000000n, 30000000n], ['USD', -2000000n, 28000000n],
  ]);
  const large = csv.split('\n').slice(0, 2).join('\n').replace('0.250000', '1999999999.999999');
  assert.equal(core.dividendLedger('DEMO:DIVIDEND', large, 1000000).at(-1).movements[0].cash, 1999999999999999000000n);
  assert.throws(() => core.dividendLedger('DEMO:DIVIDEND', csv, -1), /whole entitled shares/);
  assert.throws(() => core.dividendLedger('DEMO:WRONG', csv, 100), /selected VENUE:SYMBOL/);
});

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
