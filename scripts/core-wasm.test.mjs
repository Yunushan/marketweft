import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { instantiateMarketCore } from '../apps/terminal/src/market-core.ts';
import { parseFormulaStrategy, serializeFormulaStrategy } from '../apps/terminal/src/formula-strategy.ts';

const [wasm, csv] = await Promise.all([
  readFile(new URL('../apps/terminal/public/marketweft_core.wasm', import.meta.url)),
  readFile(new URL('../crates/core/tests/fixtures/reference.csv', import.meta.url), 'utf8'),
]);
const core = await instantiateMarketCore(Uint8Array.from(wasm).buffer);

test('paper replay and each walk-forward candidate compile in their own formula function scope', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars, trades] = await Promise.all([fixture('sessions'), fixture('bars'), fixture('trades')]);
  const config = {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' },
    fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3',
  };
  const cutoffs = { effective: '2025-04-03T14:11:10Z', known: '2025-04-03T14:11:10Z', config };
  const functions = [{ name: 'gate', parameters: ['x'], body: 'x >= 13' }];
  const query = { ...cutoffs, entry: 'gate(close)', exit: 'close <= 10', functions };
  const replay = (source, tape) => core.formulaBacktest('DEMO:SMA', calendar, bars, tape, 60, source);
  core.validateFormulaStrategy(1, query.entry, query.exit, config, functions);
  assert.throws(() => core.validateFormulaStrategy(1, query.entry, query.exit, config), /Unknown formula field or function/);
  const packageText = serializeFormulaStrategy({ languageVersion: 1, source: 'bars', ...query });
  assert.equal(JSON.parse(packageText).packageVersion, 2);
  assert.equal(serializeFormulaStrategy(parseFormulaStrategy(packageText, core)), packageText);
  const invalidPackage = JSON.parse(packageText);
  invalidPackage.functions[0].body = 'x + close';
  assert.throws(() => parseFormulaStrategy(JSON.stringify(invalidPackage), core), /explicit parameter/);
  assert.equal(replay(query, trades).backtest.ledger.receipts.at(-1).sourceId, 'TRADE-9007199254741000');
  assert.deepEqual(replay(query, ''), replay({ ...query, functions: undefined, entry: 'close >= 13' }, ''));

  const folds = core.formulaWalk('DEMO:SMA', calendar, bars, '', 60, { ...cutoffs,
    trainingBars: 6, testBars: 2, candidates: [
      { id: 'Late', entry: query.entry, exit: query.exit, functions },
      { id: 'Rising', entry: query.entry, exit: query.exit,
        functions: [{ name: 'gate', parameters: ['x'], body: 'x >\n lag(x, 1)' }] },
    ] });
  assert.deepEqual(folds[0].scores.map(score => [score.id, score.equity]), [['Rising', 1003400000n], ['Late', 997800000n]]);
  assert.equal(folds[0].testScore.equity, 997400000n);

  const boundedLibrary = Array.from({ length: 16 }, (_, index) => ({
    name: 'f' + index, parameters: ['x'], body: 'x'.padEnd(2048),
  }));
  const large = core.formulaWalk('DEMO:SMA', calendar.trimEnd().concat('\n').padEnd(1024 * 1024),
    bars.trimEnd().concat('\n').padEnd(8 * 1024 * 1024), trades.trimEnd().concat('\n').padEnd(8 * 1024 * 1024), 60, {
      ...cutoffs, trainingBars: 6, testBars: 2, candidates: Array.from({ length: 5 }, (_, index) => ({
        id: 'large-' + index, entry: 'f0(close) >= 13', exit: 'close <= 10', functions: boundedLibrary,
      })),
    });
  assert.equal(large[0].scores.length, 5);
});

test('custom formula functions run across the Wasm boundary in the supplied scope only', async () => {
  const fixture = await readFile(new URL('../crates/core/tests/fixtures/synthetic-formula-bars.csv', import.meta.url), 'utf8');
  const bars = core.parseCsv(fixture);
  const functions = [
    { name: 'gap', parameters: ['x'], body: 'if(x == 11, x / 0,\n x)' },
    { name: 'smooth', parameters: ['x'], body: 'ema(gap(x), 2)' },
  ];
  const expected = core.evaluateFormula('ema(if(close == 11, close / 0, close), 2)', bars);
  assert.deepEqual(core.evaluateFormula('smooth(close)', bars, functions), expected);
  assert.deepEqual(core.evaluateFormula('smooth(close)', bars.slice(0, 5), functions).values, expected.values.slice(0, 5));
  assert.throws(() => core.evaluateFormula('smooth(close)', bars), /Unknown formula field or function/);
  assert.throws(() => core.evaluateFormula('smooth(close)', bars, functions.toReversed()), /Unknown formula field or function/);
  assert.throws(() => core.evaluateFormula('f(close)', bars, [{ name: 'f', parameters: ['x'], body: 'x + high' }]), /explicit parameter/);
  assert.deepEqual(core.evaluateFormula('smooth(close)', bars, functions), expected);
});

test('formula walk-forward freezes rankings, warms the winner and resets paper cash in Wasm', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars, trades] = await Promise.all([fixture('sessions'), fixture('bars'), fixture('trades')]);
  const config = {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' },
    fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3',
  };
  const candidates = [
    { id: 'Late', entry: 'close >= 13', exit: 'close <= 10' },
    { id: 'Rising', entry: 'close >\n lag(close, 1)', exit: 'close <= 10' },
  ];
  const query = { config, trainingBars: 6, testBars: 2, candidates,
    effective: '2025-04-03T14:11:00Z', known: '2025-04-03T14:11:00Z' };
  const run = (overrides, source = bars, tape = '') => core.formulaWalk('DEMO:SMA', calendar, source, tape, 60, { ...query, ...overrides });
  assert.deepEqual(run({ known: '2025-04-03T14:08:00Z' }), []);
  const first = run({ known: '2025-04-03T14:09:00Z' });
  const all = run({});
  assert.equal(all.length, 2);
  assert.deepEqual(first, all.slice(0, 1));
  const fold = first[0];
  assert.deepEqual(fold.scores.map(row => [row.id, row.equity]), [['Rising', 1003400000n], ['Late', 997800000n]]);
  assert.equal(fold.report.evaluations[0].entry, 1000000n);
  assert.equal(fold.report.backtest.marks[0].cash, 1000000000n);
  assert.equal(fold.testScore.equity, 997400000n);
  assert.equal(fold.testScore.turnover, 60000000n);
  const differentBars = bars.replace('T14:07:00Z,15,15,15,15,40', 'T14:07:00Z,13,13,13,13,40');
  const revised = run({}, differentBars)[0];
  assert.deepEqual(revised.scores, fold.scores);
  assert.equal(revised.testScore.equity, 1000000000n);
  assert.equal(run({}, bars, trades)[0].testScore.fills, 0);
  assert.throws(() => run({ candidates: [candidates[0], candidates[0]] }), /unique ASCII strategy IDs/);
});

test('formula strategy packages round-trip versioned rules and exact settings through Rust validation', async () => {
  const sample = await readFile(new URL('../crates/core/tests/fixtures/synthetic-formula-strategy.mwstrategy.json', import.meta.url), 'utf8');
  assert.equal(serializeFormulaStrategy(parseFormulaStrategy(sample, core)), sample);
  const strategy = { languageVersion: 1, entry: 'close >= sma(close, 3)', exit: 'close <= 10', source: 'trades',
    config: {
      fastWindow: '2', slowWindow: '3', targetShares: '0006', participation: '1000', slippage: '10', limitBuffer: '2000', maxWait: '3',
      paper: { startingCash: '1000.000001', positionLimit: '+10', exposureLimit: '1200', feePerShare: '0.100001', feePerOrder: '-0' },
    },
  };
  const text = serializeFormulaStrategy(strategy);
  assert.equal(serializeFormulaStrategy(parseFormulaStrategy(text, core)), text);
  const change = (key, value) => {
    const manifest = JSON.parse(text);
    manifest[key] = value;
    return JSON.stringify(manifest);
  };
  assert.throws(() => parseFormulaStrategy(change('packageVersion', 2), core), /package version/);
  assert.throws(() => parseFormulaStrategy(change('languageVersion', 2), core), /language version/);
  assert.throws(() => parseFormulaStrategy(change('formulas', { entry: '1', exit: 'lag(close,-1)' }), core), /Exit formula:/);
  assert.throws(() => parseFormulaStrategy(change('account', { ...strategy.config.paper, startingCash: '1\n2' }), core), /Invalid numeric strategy setting/);
  assert.throws(() => parseFormulaStrategy(change('execution', { ...JSON.parse(text).execution, participation: '10001' }), core), /participation/);
  assert.throws(() => parseFormulaStrategy(text.padEnd(32769, ' '), core), /32 KiB/);
  assert.throws(() => parseFormulaStrategy(change('unknown', 1), core), /Invalid formula strategy package fields/);
});

test('formula-driven paper backtests audit missing signals and fill through the shared engine', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars, trades] = await Promise.all([fixture('sessions'), fixture('bars'), fixture('trades')]);
  const config = {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' },
    fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3',
  };
  const query = { config, effective: '2025-04-03T14:11:00Z', known: '2025-04-03T14:11:00Z',
    entry: 'if(close >= 13,\n 1, 0 / 0)', exit: 'close <= 10' };
  const run = (changes, tape = '') => core.formulaBacktest('DEMO:SMA', calendar, bars, tape, 60, { ...query, ...changes });
  const early = run({ known: '2025-04-03T14:05:00Z' });
  assert.deepEqual(early.evaluations[0], { at: 1743688860, barIndex: 0, entry: null, exit: 1000000n, decision: 'sell' });
  assert.equal(early.evaluations.at(-1).decision, 'buy');
  assert.equal(early.backtest.ledger.cash, 1000000000n);
  assert.deepEqual(early.backtest.ledger.receipts.map(row => row.id), ['SUBMIT-4']);
  const later = run({});
  assert.deepEqual(later.evaluations.slice(0, early.evaluations.length), early.evaluations);
  assert.equal(later.backtest.ledger.cash, 957800000n);
  const precise = run({ known: '2025-04-03T14:11:10Z' }, trades);
  assert.equal(precise.backtest.ledger.cash, later.backtest.ledger.cash);
  assert.equal(precise.backtest.ledger.receipts.at(-1).sourceId, 'TRADE-9007199254741000');
  assert.throws(() => run({ exit: 'lag(close, -1)' }), /Exit formula:/);
});

test('time-series formulas preserve exact output, missing values and prefix rules in Wasm', async () => {
  const fixture = await readFile(new URL('../crates/core/tests/fixtures/synthetic-formula-bars.csv', import.meta.url), 'utf8');
  const bars = core.parseCsv(fixture);
  const source = 'ema(if(close == 11, close / 0, close), 2)';
  const result = core.evaluateFormula(source, bars);
  assert.equal(result.version, 1);
  assert.deepEqual(result.values, [null, 11000000n, null, null, 14500000n, 16833333n]);
  for (let end = 0; end <= bars.length; end += 1) {
    assert.deepEqual(core.evaluateFormula(source, bars.slice(0, end)).values, result.values.slice(0, end));
  }
  assert.deepEqual(core.evaluateFormula('coalesce(lag(volume, 1), 0)', bars).values,
    [0n, 100000000n, 150125000n, 80000000n, 110000000n, 105000000n]);
  assert.throws(() => core.evaluateFormula('lag(close, -1)', bars), /literal window or lag/);
  assert.throws(() => core.evaluateFormula('close'.padEnd(2049, ' '), bars), /2,048 source bytes/);
});

test('cross-sectional walk-forward freezes candidates and isolates corporate test replay', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/' + name + '.csv', import.meta.url), 'utf8');
  const [membership, actionMembership, prices, liquidity, dividends, delistings] = await Promise.all([
    fixture('synthetic-listing-risk-membership'), fixture('synthetic-cross-section-membership'),
    fixture('synthetic-listing-risk-prices'), fixture('synthetic-cross-section-walk-liquidity'),
    fixture('synthetic-cross-section-dividends'), fixture('synthetic-cross-section-delisting'),
  ]);
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z';
  const config = {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1000', feePerShare: '0.1', feePerOrder: '0.5' },
    decisionSeconds: '60', lookbackSeconds: '60', topListings: '1', targetShares: '4', limitBuffer: '1000', participation: '10000',
  };
  const params = { trainingDecisions: '2', testDecisions: '2', candidates: '60:2,60:1' };
  const run = (known, marks = prices) => core.crossSectionWalk(membership, marks, liquidity,
    utc(1), utc(6), utc(known), config, params);
  assert.deepEqual(run(3), []);
  const folds = run(6);
  assert.equal(folds.length, 2);
  assert.deepEqual(run(4), folds.slice(0, 1));
  assert.deepEqual(run(7), folds);
  const [first] = folds;
  assert.deepEqual(first.trainingScores.map(row => [row.topListings, row.equity]), [[1, 999300000n], [2, null]]);
  assert.equal(first.testScore.equity, 999100000n);
  assert.equal(first.testScore.turnover, 484000000n);
  const revised = prices.replace('14:04:00Z,2025-06-02T14:04:00Z,121', '14:04:00Z,2025-06-02T14:04:00Z,127');
  const firstRevised = run(6, revised)[0];
  assert.deepEqual(firstRevised.trainingScores, first.trainingScores);
  assert.equal(firstRevised.testScore.equity, 1023100000n);
  const actions = core.crossSectionWalk(actionMembership, prices, liquidity,
    utc(1), utc(6), utc(8), config, { ...params, trainingDecisions: '3', testDecisions: '3' },
    { accountCurrency: 'USD', dividends, delistings });
  assert.equal(actions[0].testScore.equity, 1015100000n);
  assert.throws(() => core.crossSectionWalk(membership, prices, liquidity, utc(1), utc(6), utc(6),
    config, { ...params, candidates: '60:1,60:1' }), /distinct ranking candidates/);
});

test('recorded execution keeps exact trade sequence and late cutoff fills in Wasm', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars, trades] = await Promise.all([fixture('sessions'), fixture('bars'), fixture('trades')]);
  const utc = clock => '2025-04-03T' + clock + 'Z';
  const config = {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' },
    fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3',
  };
  const run = (known, effective = '14:11:00', tape = trades) => core.recordedBacktest('DEMO:SMA', calendar, bars, tape, 60, {
    effective: utc(effective), known: utc(known), config,
  });
  assert.equal(run('14:05:29').ledger.cash, 1000000000n);
  assert.equal(run('14:05:30', '14:05:19').ledger.cash, 1000000000n);
  const partial = run('14:05:30');
  assert.equal(partial.marks.at(-1).shares, 2n);
  assert.equal(partial.marks.at(-1).equity, 995800000n);
  assert.equal(run('14:07:10').ledger.cash, 924500000n);
  const end = run('14:11:10');
  assert.equal(end.ledger.cash, 957800000n);
  const executed = end.ledger.receipts.filter(row => row.kind === 'fill');
  assert.deepEqual(executed.map(row => [row.sourceId, row.shares]), [
    ['TRADE-9007199254740995', 2n], ['TRADE-9007199254740996', 3n], ['TRADE-9007199254740997', 1n],
    ['TRADE-9007199254740998', 3n], ['TRADE-9007199254741000', 3n],
  ]);
  const sideTagged = trades.trimEnd().split('\n').map((row, i) => row + (i ? ',unknown' : ',aggressor')).join('\n');
  assert.deepEqual(run('14:11:10', '14:11:00', sideTagged), end);
  assert.deepEqual(run('14:05:30'), partial);
  assert.throws(() => run('14:05:30', '14:11:00', trades.replaceAll('DEMO:SMA', 'DEMO:BAD')), /must match/);
  const fullSize = trades.padEnd(8 * 1024 * 1024, ' ');
  assert.deepEqual(run('14:05:30', '14:11:00', fullSize), partial);
  assert.throws(() => run('14:05:30', '14:11:00', fullSize + ' '), /Trade CSV exceeds 8 MiB/);
});

test('paper corporate cash preserves revised proceeds and exact dividend currency across cutoffs', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/' + name + '.csv', import.meta.url), 'utf8');
  const [membership, prices, liquidity, dividends, delistings] = await Promise.all([
    fixture('synthetic-cross-section-membership'), fixture('synthetic-listing-risk-prices'),
    fixture('synthetic-cross-section-liquidity'), fixture('synthetic-cross-section-dividends'),
    fixture('synthetic-cross-section-delisting'),
  ]);
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z';
  const run = (known, through = 6) => core.crossSectionReplay(membership, prices, liquidity, utc(1), utc(through), utc(known), {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1000', feePerShare: '0.1', feePerOrder: '0.5' },
    decisionSeconds: '60', lookbackSeconds: '60', topListings: '1', targetShares: '4', limitBuffer: '1000', participation: '10000',
  }, { accountCurrency: 'USD', dividends, delistings });
  assert.deepEqual(run(7, 4).delistingPostings, []);
  const receivable = run(5);
  assert.equal(receivable.cash, 540600000n);
  assert.equal(receivable.delistingClaims[0].state, 'receivable');
  assert.equal(receivable.delistingClaims[0].amount, 500000000n);
  assert.equal(receivable.dividendPostings[0].shares, 2n);
  const revised = run(7);
  assert.equal(revised.cash, 1056600000n);
  assert.deepEqual(revised.delistingPostings.map(row => row.cashDelta), [500000000n, 20000000n]);
  assert.deepEqual(revised.dividendPostings.map(row => [row.currency, row.cashDelta]), [
    ['USD', 4000000n], ['USD', -4000000n], ['EUR', 6000000n],
  ]);
  assert.equal(revised.dividendPostings[2].receiptId, null);
  assert.ok(revised.receipts.some(row => row.id === revised.delistingPostings[1].receiptId && row.cashDelta === 20000000n));
  const restored = run(8);
  assert.deepEqual(restored.delistingClaims, []);
  assert.equal(restored.positions[0].cost, 463400000n);
  assert.equal(restored.cash, 536600000n);
  assert.deepEqual(run(5), receivable);
});

test('cross-sectional paper replay executes only later observed liquidity and reconciles turnover', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/' + name + '.csv', import.meta.url), 'utf8');
  const [membership, prices, liquidity] = await Promise.all([
    fixture('synthetic-listing-risk-membership'), fixture('synthetic-listing-risk-prices'),
    fixture('synthetic-cross-section-liquidity'),
  ]);
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z';
  const run = (known, marks = prices) => core.crossSectionReplay(membership, marks, liquidity, utc(1), utc(6), utc(known), {
    paper: { startingCash: '1000', positionLimit: '10', exposureLimit: '1000', feePerShare: '0.1', feePerOrder: '0.5' },
    decisionSeconds: '60', lookbackSeconds: '60', topListings: '1', targetShares: '4', limitBuffer: '1000', participation: '10000',
  });
  const first = run(1);
  assert.equal(first.decisions.length, 1);
  assert.equal(first.cash, 1000000000n);
  assert.equal(first.reservedCash, 484900000n);
  assert.deepEqual(first.positions, []);
  const later = run(6);
  assert.equal(later.turnover, 462000000n);
  assert.equal(later.fees, 1400000n);
  assert.equal(later.cash, 536600000n);
  assert.equal(later.equity, 1069000000n);
  const fills = later.receipts.filter(row => row.kind === 'fill');
  assert.deepEqual(fills.map(row => [row.listingId, row.side, row.sourceId, row.shares]), [
    ['A', 'buy', 'Q-9007199254740995', 2n], ['A', 'buy', 'Q-9007199254740996', 2n],
  ]);
  assert.deepEqual(run(7).decisions, later.decisions);
  assert.deepEqual(run(1), first);
  assert.equal(run(6, marksWithoutA(prices)).equity, null);
});

function marksWithoutA(prices) {
  return prices.split('\n').filter(line => !line.startsWith('RISK,A,2025-06-02T14:06:00Z')).join('\n');
}

test('portfolio scenarios resample whole vectors and reconcile exact fee paths', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-listing-risk-' + name + '.csv', import.meta.url), 'utf8');
  const [membership, prices] = await Promise.all([fixture('membership'), fixture('prices')]);
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z';
  const allocations = [{ listingId: 'A', weightBasisPoints: 5000 }, { listingId: 'B', weightBasisPoints: 5000 }];
  const defaults = { from: utc(0), through: utc(6), known: utc(6), intervalSeconds: 60, startingValue: '100',
    feeBasisPoints: 0, seed: 9007199254740993n, paths: 10, horizon: 12 };
  const run = changes => core.portfolioScenarios(membership, prices, allocations, { ...defaults, ...changes });
  const earlier = run({});
  assert.equal(earlier.expectedVectors, 6);
  assert.equal(earlier.eligibleVectors, 4);
  assert.deepEqual(earlier.coverage.map(row => row.knownReturns), [6, 4]);
  assert.ok(earlier.paths.every(path => path.endingValue === 100000000n && path.drawdownMillionths === 0n));
  assert.equal(run({ known: utc(7) }).eligibleVectors, 6);
  assert.deepEqual(run({ known: utc(8) }).coverage.map(row => row.knownReturns), [4, 6]);
  assert.deepEqual(run({}), earlier);
  const fee = run({ through: utc(1), known: utc(1), horizon: 1, feeBasisPoints: 100 });
  assert.deepEqual(fee.endingValue, [99950000n, 99950000n, 99950000n]);
  assert.deepEqual(fee.drawdownMillionths, [500n, 500n, 500n]);
  assert.deepEqual(fee.fees, [50000n, 50000n, 50000n]);
  assert.equal(fee.lossPaths, 10);
  assert.throws(() => run({ seed: -1n }), /unsigned 64-bit seed/);
  assert.throws(() => run({ known: utc(0) }), /No interval has observed adjacent closes/);
});

test('listing risk pairs exact adjacent intervals and preserves missing and zero-variance values', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-listing-risk-' + name + '.csv', import.meta.url), 'utf8');
  const [membership, prices] = await Promise.all([fixture('membership'), fixture('prices')]);
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z';
  const at = (known, source = prices) => core.listingRisk(membership, source, 'A', 'B', {
    from: utc(0), through: utc(6), known: utc(known), intervalSeconds: 60, windowPeriods: 3, volatilityPeriods: 1,
  });
  const early = at(6);
  assert.equal(early[0].expectedReturns, 3);
  assert.equal(early[0].pairedReturns, 1);
  assert.equal(early[0].rightVolatility, null);
  assert.equal(early[0].correlation, null);
  assert.deepEqual(early.map(row => row.pairedReturns), [1, 1, 2, 3]);
  const observed = at(7);
  assert.ok(observed.every(row => row.pairedReturns === 3 && Math.abs(row.correlation + 1) < 1e-14));
  assert.ok(Math.abs(observed[0].leftVolatility - 0.1 / Math.sqrt(3)) < 1e-14);
  assert.equal(at(8).at(-1).leftVolatility, null);
  assert.deepEqual(at(6), early);
  const constant = prices.replace(/^RISK,A,(.*),[^,\r\n]+$/gm, 'RISK,A,$1,100');
  assert.ok(at(7, constant).every(row => row.leftVolatility === 0 && row.correlation === null));
});

test('observed price profiles preserve distinct TPO brackets and exact volume value areas', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-footprint.csv', import.meta.url), 'utf8');
  const instrument = 'NASDAQ:NVDA';
  const utc = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
  const at = (known, target = 7000) => core.recordedPriceProfile(instrument, csv, {
    bucketSeconds: 60, priceWidth: '0.5', from: utc(-1), through: utc(60), known: utc(known),
  }, target);
  assert.deepEqual(at(-1), {
    levels: [], volume: null, timeOpportunities: null, observedBrackets: 0, valueAreaBasisPoints: 7000,
  });
  const early = at(60);
  assert.equal(early.observedBrackets, 3);
  assert.deepEqual(early.levels.map(row => row.opportunities), [2, 1, 1]);
  assert.deepEqual(early.volume, {
    pointOfControlFrom: 100500000n, pointOfControlTo: 101000000n,
    valueFrom: 100500000n, valueTo: 101500000n, covered: 5000000n, total: 6500000n,
  });
  assert.deepEqual(early.timeOpportunities, {
    pointOfControlFrom: -500000n, pointOfControlTo: 0n,
    valueFrom: -500000n, valueTo: 101000000n, covered: 3n, total: 4n,
  });
  const late = at(61);
  assert.equal(late.volume.covered, 13000001n);
  assert.equal(late.volume.total, 16600001n);
  assert.equal(late.levels[0].volume.trades, 3);
  assert.deepEqual(late.timeOpportunities, early.timeOpportunities);
  assert.deepEqual(at(65), late);
  assert.deepEqual(at(60), early);
  assert.throws(() => at(61, 10001), /1 to 10,000 basis points/);
});

test('recorded footprint decodes execution buckets, unknown volume and exact cumulative deltas', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-footprint.csv', import.meta.url), 'utf8');
  const instrument = 'NASDAQ:NVDA';
  const utc = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
  assert.deepEqual(core.footprintWindow(instrument, csv), {
    firstExecution: -1, lastExecution: 65, lastObserved: 65,
  });
  const at = known => core.recordedFootprint(instrument, csv, {
    bucketSeconds: 60, priceWidth: '0.5', from: utc(-1), through: utc(60), known: utc(known),
  });
  assert.deepEqual(at(-1), []);
  const old = at(60);
  assert.deepEqual(old.map(b => b.cumulativeDelta), [1250000n, 1000000n, -1000000n]);
  assert.deepEqual(old[0].levels[0], {
    priceFrom: -500000n, priceTo: 0n, volume: { buy: 1250000n, sell: 0n, unknown: 0n, trades: 1 },
  });
  const revised = at(61);
  assert.equal(revised[0].lastSequence, 9007199254740997n);
  assert.equal(revised[0].lastObservedAt, 61);
  assert.equal(revised[1].levels[1].volume.unknown, 3000000n);
  assert.equal(revised[1].levels[1].volume.buy, 10000001n);
  assert.equal(revised[2].cumulativeDelta, 8900001n);
  assert.deepEqual(at(65), revised);
  assert.deepEqual(at(60), old);
  assert.throws(() => core.footprintWindow('NASDAQ:MSFT', csv), /Instrument must match/);
});

test('recorded depth verifies atomic frames, exact sequences and recovery at the known cutoff', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-depth.csv', import.meta.url), 'utf8');
  const instrument = 'NASDAQ:NVDA';
  const at = seconds => '2025-06-02T14:00:' + String(seconds).padStart(2, '0') + 'Z';
  const timeline = core.depthCheckpoints(instrument, csv);
  assert.deepEqual(timeline, [0, 2, 3, 5, 6, 9, 10, 11, 12].map(value => Date.parse(at(value)) / 1000));
  const query = seconds => core.recordedDepth(instrument, csv, at(seconds));
  assert.deepEqual(query(0).status, { kind: 'awaiting-snapshot' });
  const first = query(2);
  assert.deepEqual(first.snapshot, { sequence: 9007199254740993n, eventAt: timeline[0] + 1, observedAt: timeline[1] });
  assert.deepEqual(first.bids[0], { priceTicks: 99125000n, sizeTicks: 10000001n });
  assert.deepEqual(query(4).bids[0], { priceTicks: 99500000n, sizeTicks: 4000000n });
  assert.deepEqual(query(6).status, { kind: 'sequence-gap', expected: 9007199254740995n, received: 9007199254740996n });
  assert.deepEqual(query(6).bids, []);
  const recovered = query(9);
  assert.equal(recovered.snapshot.sequence, 9007199254741000n);
  assert.equal(recovered.received.sequence, 9007199254741001n);
  assert.deepEqual(recovered.bids[0], { priceTicks: -4000000n, sizeTicks: 1n });
  assert.deepEqual(query(11).status, { kind: 'crossed', sequence: 9007199254741002n });
  assert.deepEqual(query(12).status, { kind: 'synchronized' });
  assert.deepEqual(query(12).asks, []);
  assert.deepEqual(query(2), first);
  assert.throws(() => core.depthCheckpoints('NASDAQ:MSFT', csv), /Instrument must match/);
  assert.throws(() => core.recordedDepth(instrument, csv, '2025-06-02'), /exact UTC observation cutoff/);
});

test('tick bars keep exact sequence identities and observation-time prefixes', () => {
  const csv = [
    'instrument,executed_at,observed_at,sequence,price,size',
    'LOCAL:TICK,0,0,9007199254740993,5,0.000001',
    'LOCAL:TICK,0,0,9007199254740994,-2,0.000002',
    'LOCAL:TICK,-1,5,9007199254740995,7,0.1',
  ].join('\n');
  const prior = core.recordedTickBars('LOCAL:TICK', csv, 2, '0');
  assert.deepEqual(prior, [{
    bar: { time: 0, open: 5, high: 5, low: -2, close: -2, volume: 0.000003 },
    availableAt: 0, firstSequence: 9007199254740993n, lastSequence: 9007199254740994n,
    observedTrades: 2, targetTrades: 2,
  }]);
  const after = core.recordedTickBars('LOCAL:TICK', csv, 2, '5');
  assert.deepEqual(after.slice(0, 1), prior);
  assert.equal(after[1].bar.open, 7);
  assert.equal(after[1].observedTrades, 1);
  assert.equal(after[1].availableAt, 5);
  assert.throws(() => core.recordedTickBars('LOCAL:OTHER', csv, 2), /Instrument must match/);
});

test('timeframe Wasm rolls exact signed OHLCV, omits empty buckets and reports coverage', () => {
  const source = core.parseCsv([
    'time,open,high,low,close,volume',
    '-60,-10,-5,-11,-7,0.000001',
    '0,-7,-6,-8,-6,0.1',
    '120,-6,1,-9,0,0.000002',
    '360,2,2,2,2,3',
  ].join('\n'));
  const rolled = core.aggregateTimeframe(source, 60, 180);
  assert.deepEqual(rolled, [
    { bar: { ...source[0], time: -180 }, observedBars: 1, expectedBars: 3 },
    { bar: { time: 0, open: -7, high: 1, low: -9, close: 0, volume: 0.100002 },
      observedBars: 2, expectedBars: 3 },
    { bar: source[3], observedBars: 1, expectedBars: 3 },
  ]);
  assert.deepEqual(core.aggregateTimeframe(source.slice(0, 3), 60, 180), rolled.slice(0, 2));
  assert.throws(() => core.aggregateTimeframe(source, 60, 181), /larger whole multiple/);
});

test('session timeframe Wasm anchors to the supplied open and preserves a clipped close', () => {
  const calendar = 'date,open_utc,close_utc,utc_offset_minutes,kind\n' +
    '2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early';
  const bars = core.parseCsv('time,open,high,low,close,volume\n' +
    '2025-11-28T17:30:00Z,-1,3,-2,1,0.000001');
  const sec = t => Date.parse('2025-11-28T' + t + 'Z') / 1000;
  assert.deepEqual(core.aggregateSessionTimeframe(calendar, bars, 3600, 7200), [{
    bar: { ...bars[0], time: sec('16:30:00') }, observedBars: 1, expectedBars: 2,
    closeTime: sec('18:00:00'), sessionOpen: sec('14:30:00'), earlyClose: true,
  }]);
  assert.throws(() => core.aggregateSessionTimeframe(calendar, [{ ...bars[0], time: sec('18:30:00') }],
    3600, 7200), /outside a session/);
});

test('drawing Wasm retains signed measurement and percentages outside the safe JS integer range', () => {
  assert.deepEqual(core.measureDrawing({
    start: { time: 10, ticks: 1 }, end: { time: 5, ticks: 2_000_000_000_000_000 },
  }), {
    elapsedSeconds: -5, priceTicks: 1_999_999_999_999_999n,
    returnPctMicros: 199_999_999_999_999_900_000_000n,
  });
  assert.equal(core.measureDrawing({
    start: { time: 0, ticks: 0 }, end: { time: 1, ticks: -1 },
  }).returnPctMicros, null);
  assert.throws(() => core.measureDrawing({
    start: { time: 0, ticks: 0 }, end: { time: 253_402_300_800, ticks: 0 },
  }), /supported UTC timestamp/);
});

test('backtest Wasm waits for observed liquidity and preserves marks and paper receipts across prefixes', async () => {
  const read = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars] = await Promise.all([read('sessions'), read('bars')]);
  const paper = { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' };
  const policy = { paper, fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3' };
  const iso = t => '2025-04-03T' + t + 'Z';
  const run = time => core.backtest('DEMO:SMA', calendar, bars, 60, iso(time), policy);
  assert.equal(core.backtestIndex(calendar, bars, 60).length, 11);
  const submitted = run('14:05:00');
  assert.deepEqual(run('14:06:00'), submitted);
  assert.equal(submitted.ledger.orders[0].status, 'open');
  assert.equal(submitted.ledger.positions.length, 0);
  const partial = run('14:07:00');
  assert.equal(partial.ledger.orders[0].status, 'partial');
  assert.equal(partial.ledger.positions[0].shares, 2n);
  const end = run('14:11:00');
  assert.equal(end.ledger.cash, 957800000n);
  assert.equal(end.ledger.realized, -42200000n);
  assert.equal(end.marks.length, 10);
  assert.deepEqual(end.marks.slice(0, partial.marks.length), partial.marks);
});

test('walk-forward Wasm decodes complete chronological folds and training-only scores', async () => {
  const read = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars] = await Promise.all([read('sessions'), read('bars')]);
  const paper = { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' };
  const execution = { paper, fastWindow: '2', slowWindow: '3', targetShares: '6', participation: '1000',
    slippage: '0', limitBuffer: '2000', maxWait: '3' };
  const config = { trainingBars: '6', testBars: '2', candidates: '2:3, 1:2' };
  const run = (at, settings = config) => core.walkForward('DEMO:SMA', calendar, bars, 60,
    '2025-04-03T' + at + 'Z', execution, settings);
  assert.deepEqual(run('14:08:00'), []);
  const [first] = run('14:09:00');
  assert.deepEqual(first.selected, { fast: 1, slow: 2 });
  assert.deepEqual(first.scores.map(score => [score.fast, score.slow, score.equity, score.fills]), [
    [1, 2, 1003400000n, 1], [2, 3, 997800000n, 1],
  ]);
  assert.equal(first.test.marks[0].cash, 1000000000n);
  assert.deepEqual(first.test.marks.map(mark => mark.at), [first.testStart, first.testEnd]);
  const final = run('14:11:00');
  assert.equal(final.length, 2);
  assert.deepEqual(final[0], first);
  assert.ok(final[1].testStart > first.testEnd);
  assert.throws(() => run('14:11:00', { ...config, candidates: '1:2, 1:2' }), /unique SMA pairs/);
});

test('seeded scenario Wasm preserves path order, cutoff and unsigned 64-bit seeds', async () => {
  const read = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-backtest-' + name + '.csv', import.meta.url), 'utf8');
  const [calendar, bars] = await Promise.all([read('sessions'), read('bars')]);
  const paper = { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' };
  const execution = { paper, fastWindow: '1', slowWindow: '2', targetShares: '6', participation: '1000',
    slippage: '10', limitBuffer: '2000', maxWait: '3' };
  const cutoff = '2025-04-03T14:10:00Z';
  const seed = '18446744073709551615';
  const run = (history, value = seed, at = cutoff) => core.scenarios('DEMO:SMA', calendar, history, 60, at,
    execution, { seed: value, paths: '64', horizon: '5' });
  const result = run(bars);
  assert.equal(result.seed, BigInt(seed));
  assert.equal(result.eligibleMoves, 8);
  assert.equal(result.anchor, Date.parse('2025-04-03T14:04:00Z') / 1000);
  assert.equal(result.lastObserved, Date.parse(cutoff) / 1000);
  assert.equal(result.paths.length, 64);
  assert.deepEqual(result.baseline, { endingEquity: 1000000000n, maxDrawdown: 0n, maxExposure: 0n });
  assert.deepEqual(result.endingEquity, { p05: 976234700n, p50: 1000000000n, p95: 1019746068n });
  assert.deepEqual(result.maxDrawdown, { p05: 0n, p50: 2637560n, p95: 23765300n });
  assert.deepEqual(result.maxExposure, { p05: 0n, p50: 40444434n, p95: 105300000n });
  assert.deepEqual(result.paths[0], { endingEquity: 997353920n, maxDrawdown: 2646080n, maxExposure: 46080000n });
  const rows = bars.trimEnd().split('\n');
  const later = rows[rows.length - 1].split(',');
  later[later.length - 1] = '0';
  rows[rows.length - 1] = later.join(',');
  assert.deepEqual(run(rows.join('\n')), result);
  const different = run(bars, '0');
  assert.deepEqual(different.baseline, result.baseline);
  assert.notDeepEqual(different.paths, result.paths);
  assert.equal(result.lossPaths, result.paths.filter(path => path.endingEquity < result.startingCash).length);
  assert.throws(() => run(bars, (BigInt(seed) + 1n).toString()), /unsigned 64-bit/);
  assert.throws(() => run(bars, seed, '2025-04-03T14:02:00Z'), /anchor and every horizon bar/);
});

test('paper replay Wasm reconciles cash, fees and observed unique fills', async () => {
  const csv = await readFile(new URL('../crates/core/tests/fixtures/synthetic-paper-events.csv', import.meta.url), 'utf8');
  const config = { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' };
  const at = time => core.paperReplay(csv, '2025-04-03T' + time + 'Z', config);
  assert.equal(core.paperIndex(csv).length, 9);
  const partial = at('14:02:00');
  assert.equal(partial.cash, 801600000n);
  assert.equal(partial.reserved, 300600000n);
  assert.deepEqual(partial.receipts.map(entry => [entry.id, entry.status, entry.fee]), [
    ['OPEN', 'accepted', 0n], ['EARLY', 'price-time', 0n], ['FILL1', 'accepted', 2400000n],
  ]);
  const end = at('14:08:00');
  assert.equal(end.cash, 663700000n);
  assert.equal(end.realized, 13000000n);
  assert.equal(end.halted, true);
  assert.equal(end.receipts.at(-1).status, 'halted');
  assert.equal(end.orders.find(order => order.id === 'PENDING').status, 'canceled');
  assert.deepEqual(at('14:02:00'), partial);
});

test('alert replay Wasm returns auditable and stable crossing IDs at each cutoff', async () => {
  const read = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-alert-' + name + '.csv', import.meta.url), 'utf8');
  const [rules, observations] = await Promise.all([read('rules'), read('observations')]);
  const iso = t => '2025-04-03T' + t + 'Z';
  const run = (at, known) => core.alertReplay(rules, observations, iso(at), iso(known));
  assert.equal(core.alertIndex(rules, observations), Date.parse(iso('14:08:00')) / 1000);
  assert.deepEqual(run('14:08:00', '14:02:00').map(record => record.id), ['LEVEL/R1/O2']);
  const records = run('14:08:00', '14:08:00');
  assert.equal(records.length, 8);
  assert.equal(records[2].id, 'MEAN/R1/O2C');
  assert.equal(records[2].previous.ticks, '6000000');
  assert.equal(records[2].previous.comparisonNumerator, '15000000');
  assert.equal(records[2].current.comparisonNumerator, '12000000');
  assert.equal(records[2].current.comparisonCount, 3);
  assert.deepEqual(run('14:08:00', '14:08:00'), records);
});

test('option chain Wasm exposes correct IV, gated underlying and invalid spread reasons', async () => {
  const read = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-option-' + name + '.csv', import.meta.url), 'utf8');
  const [underlying, quotes] = await Promise.all([read('underlying'), read('quotes')]);
  const iso = t => '2025-04-03T' + t + 'Z';
  assert.deepEqual(core.optionIndex(underlying, quotes), {
    instrument: 'DEMO:OPT', currency: 'USD', firstObservedAt: Date.parse(iso('13:59:00')) / 1000,
  });
  const snapshot = (effective, known, age = 300) => core.optionSnapshot(underlying, quotes, iso(effective), iso(known), age);
  const current = snapshot('14:00:00', '14:00:00');
  const row = id => current.options.find(item => item.id === id);
  assert.equal(current.underlying.spot, 100000000n);
  assert.ok(Math.abs(row('APR-C100').result.volatility - 0.2) < 2e-8);
  assert.ok(Math.abs(row('APR-P100').result.delta + 0.416553855) < 2e-8);
  assert.equal(row('APR-C100').bid, 8807321n);
  assert.equal(row('APR-P110').result, 'crossed');
  assert.equal(row('APR-C105').result, 'missing-bid-ask');
  assert.equal(row('APR-C90'), undefined);
  assert.ok(snapshot('14:00:00', '14:02:00').options.some(item => item.id === 'APR-C90'));
  assert.equal(snapshot('14:00:00', '14:05:00').underlying.spot, 100500000n);
  assert.equal(snapshot('14:01:00', '14:05:00').underlying.spot, 101000000n);
  assert.equal(snapshot('14:00:00', '14:00:00', 0).options.find(item => item.id === 'APR-C100').result, 'stale-underlying');
  assert.throws(() => snapshot('14:00:00', '14:00:00', -1), /Maximum quote age/);
});

test('macro calendar Wasm preserves public and observed times and revision lineage', async () => {
  const data = await readFile(new URL('../crates/core/tests/fixtures/synthetic-macro-calendar.csv', import.meta.url), 'utf8');
  const iso = t => '2025-04-03T' + t + 'Z';
  const asOf = (published, known) => core.macroAsOf(data, iso(published), iso(known));
  assert.equal(core.macroIndex(data), Date.parse(iso('13:02:00')) / 1000);
  assert.deepEqual(asOf('14:30:00', '14:31:59')[0].actualHistory, []);
  assert.deepEqual(asOf('14:29:59', '14:52:00')[0].actualHistory, []);
  assert.deepEqual(asOf('14:30:00', '14:32:00')[0].actualHistory.map(r => r.value), [2700000n]);
  const revised = asOf('14:52:00', '14:52:00')[0];
  assert.equal(revised.forecast.value, 2500000n);
  assert.deepEqual(revised.actualHistory.map(r => [r.recordId, r.value, r.supersedes]), [
    ['CPI-A0', 2700000n, null], ['CPI-A1', 2600000n, 'CPI-A0'], ['CPI-A2', 2800000n, 'CPI-A1'],
  ]);
  assert.throws(() => core.macroIndex(data.replace('2.8,CPI-A1', '2.8,CPI-A0')), /linear revision chain/);
});

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

test('quarterly Wasm replay keeps publication vintages and exact trailing amounts independent of annual multiples', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-financial-' + name + '.csv', import.meta.url), 'utf8');
  const [filings, caps] = await Promise.all([fixture('periods'), fixture('market-caps')]);
  const snapshot = (time, reports = filings) => core.financialSnapshot(
    reports, caps, 'DEMO-ALFA', '2025-04-03T14:00:00Z', '2025-04-03T' + time + 'Z');
  const early = snapshot('14:04:59');
  assert.deepEqual(early.quarters.map(row => row.sourceId), ['ALFA-Q1', 'ALFA-Q3', 'ALFA-Q4']);
  assert.deepEqual(early.trailing, { kind: 'insufficient-quarters' });
  assert.deepEqual(early.quarterlyValuation, {
    priceEarnings: null, priceSales: null, priceBook: { kind: 'value', units: 4000000n },
  });
  const complete = snapshot('14:05:00');
  assert.deepEqual(complete.trailing, { kind: 'available', currency: 'USD',
    revenue: 6000000000000010n, commonNetIncome: 1200000000000010n, operatingCashFlow: 700000000000003n });
  assert.deepEqual(complete.quarterlyValuation.priceEarnings, { kind: 'value', units: 10000000n });
  const revised = snapshot('14:22:00');
  assert.equal(revised.filing.sourceId, 'ALFA-FY24-A1');
  assert.equal(revised.quarters[3].sourceId, 'ALFA-Q4-A1');
  assert.deepEqual(revised.trailing, { kind: 'available', currency: 'USD',
    revenue: 8000000000000010n, commonNetIncome: null, operatingCashFlow: -250000000000005n });
  assert.deepEqual(revised.quarterlyValuation, {
    priceEarnings: { kind: 'missing-denominator' },
    priceSales: { kind: 'value', units: 1500000n },
    priceBook: { kind: 'missing-denominator' },
  });
  assert.deepEqual(snapshot('14:05:00').trailing, complete.trailing);
  assert.equal(snapshot('14:05:00', filings.replace('14:05:00Z,USD', '14:05:00Z,EUR')).trailing.kind, 'currency');
  assert.equal(snapshot('14:05:00', filings.replace('2024-04-01,2024-06-30', '2024-04-02,2024-06-30')).trailing.kind, 'noncontiguous');
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

test('relative series Wasm bridge preserves missing points, revisions and listing state', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-universe' + name + '.csv', import.meta.url), 'utf8');
  const [membership, quotes] = await Promise.all([fixture(''), fixture('-prices')]);
  const prices = quotes +
    'DEMO-BASKET,ALFA-001,2025-06-02T14:12:00Z,2025-06-02T14:12:00Z,105\n' +
    'DEMO-BASKET,BETA-001,2025-06-02T14:12:00Z,2025-06-02T14:13:00Z,57\n';
  const iso = t => '2025-06-02T' + t + 'Z';
  const series = (end, known, rightId = 'BETA-001') => core.relativeSeries(
    membership, prices, 'ALFA-001', rightId, iso('14:10:00'), iso(end), iso(known),
  );
  const missing = series('14:12:00', '14:12:00');
  assert.equal(missing.length, 2);
  assert.equal(missing[0].spreadUnits, 0n);
  assert.deepEqual(missing[1].right, { membership: 'member', close: null, returnUnits: null });
  assert.equal(missing[1].spreadUnits, null);
  const observed = series('14:12:00', '14:13:00')[1];
  assert.deepEqual(observed.right, {
    membership: 'member', close: { ticks: 57000000n, observedAt: Date.parse(iso('14:13:00')) / 1000 },
    returnUnits: 17857n,
  });
  assert.equal(observed.spreadUnits, 11555n);
  assert.equal(series('14:12:00', '14:16:00')[1].spreadUnits, -99301n);
  const removed = series('14:20:00', '14:25:00').at(-1);
  assert.equal(removed.effectiveAt, Date.parse(iso('14:20:00')) / 1000);
  assert.deepEqual(removed.left, { membership: 'removed', close: null, returnUnits: null });
  assert.equal(removed.spreadUnits, null);
  assert.throws(() => series('14:12:00', '14:16:00', 'ALFA-001'), /distinct listing IDs/);
  assert.throws(() => series('14:12:00', '14:16:00', 'BETA-001\n'), /valid listing IDs/);
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

test('portfolio income keeps dividend and delisting subtotals separate across observation vintages', async () => {
  const sources = await Promise.all(['universe', 'portfolio-holdings', 'universe-prices',
    'delisting-terms', 'portfolio-dividends'].map(name => readFile(
    new URL('../crates/core/tests/fixtures/synthetic-' + name + '.csv', import.meta.url), 'utf8'
  )));
  const [membership, holdings, prices, terms, dividends] = sources;
  const utc = minute => '2025-06-02T14:' + minute + ':00Z';
  const query = (effective, known) => core.portfolioAsOf(membership, holdings, prices, terms,
    utc(effective), utc(known), dividends);
  const open = query('37', '37');
  assert.equal(open.totals.find(row => row.currency === 'USD').receivable, 70_000_000n);
  assert.equal(open.income.totals.find(row => row.currency === 'USD').receivable, 7_500_000n);
  const paid = query('55', '55');
  assert.equal(paid.income.totals.find(row => row.currency === 'EUR').cash, 8_000_000n);
  assert.equal(paid.income.totals.find(row => row.currency === 'USD').cash, 5_000_000n);
  const corrected = query('55', '58');
  assert.equal(corrected.income.totals.find(row => row.currency === 'USD').cash, 4_000_000n);
  const repeated = paid.income.dividends.filter(row => row.id === 'BETA-PAYOUT');
  assert.deepEqual(repeated.map(row => [row.listing, row.entitledShares]), [['BETA-001', 10], ['BETA-002', 3]]);
  assert.deepEqual(query('55', '55'), paid);
});

test('portfolio Wasm keeps late closes and delisting cash separate by listing and currency', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-' + name + '.csv', import.meta.url), 'utf8');
  const [universe, holdings, prices, terms] = await Promise.all(
    ['universe', 'portfolio-holdings', 'universe-prices', 'delisting-terms'].map(fixture));
  const time = value => '2025-06-02T' + value + ':00Z';
  const value = (effective, known = effective) => core.portfolioAsOf(universe, holdings, prices, terms, time(effective), time(known));
  assert.equal(value('14:10').unvaluedPositions, 1);
  assert.equal(value('14:10').holdings[1].value, null);
  assert.equal(value('14:10', '14:12').holdings[1].value, 560000000n);
  assert.equal(value('14:35').holdings[1].state, 'missing-proceeds');
  const reused = value('14:45');
  assert.equal(reused.holdings[1].instrument, reused.holdings[2].instrument);
  assert.equal(reused.holdings[1].value, 70000000n);
  assert.equal(reused.holdings[2].value, 225000000n);
  assert.deepEqual(value('14:50').totals[0], { currency: 'USD', sharesValue: 214000000n, receivable: 0n, cash: 70000000n });
  assert.equal(value('14:58').totals[0].cash, 64000000n);
  assert.deepEqual(value('15:04').totals[0], { currency: 'EUR', sharesValue: 0n, receivable: 0n, cash: 72000000n });
  assert.equal(value('15:05').holdings[1].value, 0n);
});

test('delisting Wasm separates the two cutoffs and preserves exact cash reversals', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-' + name + '.csv', import.meta.url), 'utf8');
  const [membership, reports] = await Promise.all([fixture('universe'), fixture('delisting-terms')]);
  const time = hhmm => '2025-06-02T' + hhmm + ':00Z';
  const value = (effective, known = effective, listing = 'BETA-001') =>
    core.delistingAsOf(membership, reports, listing, 10, time(effective), time(known));
  assert.equal(value('14:37', '14:34').ordinaryShares, 10);
  assert.equal(value('14:35').state, 'missing-proceeds');
  assert.equal(value('14:35').offer, undefined);
  assert.equal(value('14:37').offer.total, 70000000n);
  assert.equal(value('14:37').returnPctMicros, -30000000n);
  assert.equal(value('14:50').ledger.length, 1);
  assert.deepEqual(value('15:04').ledger.map(row => [row.currency, row.delta, row.balance]), [
    ['USD', 70000000n, 70000000n], ['USD', 10000000n, 80000000n], ['USD', -80000000n, 0n], ['EUR', 90000000n, 90000000n],
  ]);
  assert.equal(value('15:04').returnPctMicros, undefined);
  assert.equal(value('15:05').offer.total, 0n);
  assert.equal(value('15:05').returnPctMicros, -100000000n);
  assert.equal(value('15:05', '15:05', 'BETA-002').state, 'shares');
});

test('dated dividend entitlement Wasm preserves unknown, zero and revised cash', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-' + name + '.csv', import.meta.url), 'utf8');
  const [dividends, positions] = await Promise.all([fixture('cash-dividends'), fixture('dividend-positions')]);
  const ledger = core.dividendPositionLedger('DEMO:DIVIDEND', dividends, positions);
  assert.equal(ledger[0].entitledShares, null);
  assert.equal(ledger[1].entitledShares, 100);
  assert.equal(ledger[1].movements[0].receivable, 25000000n);
  const exposure = ledger.filter(event => event.kind === 'entitlement');
  assert.deepEqual(exposure.map(event => [event.entitledShares, event.movements[0].receivableDelta, event.movements[0].cashDelta]), [
    [120, 5000000n, 0n], [110, 0n, -3000000n],
  ]);
  const beta = ledger.find(event => event.id === 'BETA');
  assert.equal(beta.entitledShares, 40);
  assert.equal(beta.movements[0].cash, 4000000n);
  assert.equal(ledger.at(-1).movements[0].cash, 30800000n);
  const zero = 'instrument,effective_at,observed_at,shares\nDEMO:DIVIDEND,2025-06-03T13:59:00Z,2025-06-03T14:10:00Z,0\n';
  const missing = core.dividendPositionLedger('DEMO:DIVIDEND', dividends, zero);
  assert.deepEqual(missing.slice(0, 3).map(event => [event.kind, event.entitledShares]), [
    ['report', null], ['ex', null], ['entitlement', 0],
  ]);
  assert.throws(() => core.dividendPositionLedger('DEMO:DIVIDEND', dividends,
    positions.replace('DEMO:DIVIDEND', 'DEMO:WRONG')), /Invalid instrument/);
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

test('split revision Wasm composes same-time IDs and rewinds a canceled action', async () => {
  const fixture = name => readFile(new URL('../crates/core/tests/fixtures/synthetic-split-' + name + '.csv', import.meta.url), 'utf8');
  const [raw, csv] = await Promise.all([fixture('ohlcv'), fixture('revisions')]);
  const bars = core.parseCsv(raw);
  const original = structuredClone(bars);
  const revisions = core.splitBook('DEMO:SPLIT', csv);
  assert.deepEqual(revisions.map(row => [row.actionId, row.canceled]), [
    ['SPLIT-A', false], ['SPLIT-A', false], ['SPLIT-A', true], ['SPLIT-B', false],
  ]);
  const open = bars[12].time;
  const at = (minutes, count) => core.adjustSplits(bars.slice(0, count), revisions, open + 60 * minutes);
  assert.equal(at(0, 12)[11].close, 53.25);
  assert.deepEqual(at(10, 13), bars.slice(0, 13));
  const changed = at(20, 14);
  assert.equal(changed[0].close, 33.666667);
  assert.equal(changed[13].close, 17.833333);
  assert.equal(at(30, 15)[13].close, 35.666667);
  assert.deepEqual(at(30, 15)[14], bars[14]);
  assert.deepEqual(at(20, 14), changed);
  assert.deepEqual(bars, original);
  assert.throws(() => core.splitBook('DEMO:SPLIT', csv.replace(',cancel,,', ',cancel,2,1')), /counts blank/);
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
