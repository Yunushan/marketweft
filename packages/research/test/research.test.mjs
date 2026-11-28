import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createResearchEngine, MARKET_CORE_WASM_URL, RESEARCH_SDK_VERSION } from '../dist/index.js'

const sample = new URL('../../../crates/core/tests/fixtures/synthetic-formula-bars.csv', import.meta.url)
const checkedInCore = new URL('../../../apps/terminal/public/marketweft_core.wasm', import.meta.url)
const [csv, wasm, expectedWasm] = await Promise.all([
  readFile(sample, 'utf8'), readFile(new URL(MARKET_CORE_WASM_URL)), readFile(checkedInCore),
])

test('portfolio FX uses exact subtotal ticks and both evidence cutoffs in the public TypeScript SDK', async () => {
  const rates = await readFile(new URL('../../../crates/core/tests/fixtures/synthetic-portfolio-fx.csv', import.meta.url), 'utf8')
  const research = await createResearchEngine(wasm)
  const utc = minute => '2025-06-02T14:' + minute + ':00Z'
  const amounts = [{ currency: 'USD', subtotal: 70000000n }, { currency: 'EUR', subtotal: 225000000n }]
  const run = (known, reporting = 'USD') => research.portfolioFxAsOf(rates, reporting, utc(45), utc(known), amounts)
  const before = run(45)
  assert.deepEqual(before.rows.map(row => [row.currency, row.converted]), [['EUR', null], ['USD', 70000000n]])
  assert.deepEqual([run(46).knownSubtotal, run(49).knownSubtotal, run(50).knownSubtotal], [340000000n, 362500000n, 362500000n])
  assert.deepEqual(run(45), before)
  const inverse = run(49, 'EUR')
  assert.equal(inverse.knownSubtotal, 278846154n)
  assert.equal(inverse.rows[1].rate.inverted, true)
  assert.equal(inverse.rows[1].rate.observedAt, Date.parse(utc(49)) / 1000)
  const wide = (1n << 127n) - 1n
  assert.equal(research.portfolioFxAsOf(rates, 'USD', utc(45), utc(45), [{ currency: 'USD', subtotal: wide }]).knownSubtotal, wide)
})

test('the public TypeScript SDK runs exact contiguous portfolio paths at independent cutoffs', async () => {
  const reports = kind => readFile(new URL(
    '../../../crates/core/tests/fixtures/synthetic-listing-risk-' + kind + '.csv', import.meta.url,
  ), 'utf8')
  const [research, membership, prices] = await Promise.all([createResearchEngine(wasm), reports('membership'), reports('prices')])
  const utc = minute => '2025-06-02T14:0' + minute + ':00Z'
  const allocations = [{ listingId: 'A', weightBasisPoints: 5000 }, { listingId: 'B', weightBasisPoints: 5000 }]
  const run = known => research.portfolioScenarios(membership, prices, allocations, {
    from: utc(0), through: utc(6), known: utc(known), intervalSeconds: 60, startingValue: '100',
    feeBasisPoints: 100, seed: 9007199254740993n, paths: 5, horizon: 4, blockSize: 3,
  })
  const original = run(6)
  assert.equal(original.eligibleBlocks, 1)
  assert.deepEqual(original.paths, Array(5).fill({ endingValue: 99950000n, drawdownMillionths: 500n, fees: 50000n }))
  assert.equal(run(7).eligibleBlocks, 4)
  assert.equal(run(8).eligibleBlocks, 2)
  assert.deepEqual(run(6), original)
})

test('the TypeScript SDK uses the shipped Wasm and preserves exact formula prefixes', async () => {
  assert.deepEqual(wasm, expectedWasm)
  const research = await createResearchEngine(wasm)
  assert.equal(research.version, RESEARCH_SDK_VERSION)
  const bars = research.parseBars(csv)
  const expected = [null, 11000000n, null, null, 14500000n, 16833333n]
  const expression = 'ema(if(close == 11, close / 0, close), 2)'
  assert.deepEqual(research.evaluateFormula(expression, bars), { version: 1, values: expected })
  for (let end = 0; end <= bars.length; end++) {
    assert.deepEqual(research.evaluateFormula(expression, bars.slice(0, end)).values, expected.slice(0, end))
  }
})

test('the packaged SDK evaluates a bounded scalar plugin with exact bigint input', async () => {
  const file = new URL('../../../crates/core/tests/fixtures/scalar-plugins.txt', import.meta.url)
  const [source, research] = await Promise.all([readFile(file, 'utf8'), createResearchEngine(wasm)])
  const module = name => Buffer.from(source.match(new RegExp('^' + name + ' ([a-f0-9]+)$', 'm'))[1], 'hex')
  assert.equal(research.evaluateScalarPlugin(module('increment'), -123456789n), -123456788n)
  assert.throws(() => research.evaluateScalarPlugin(module('fuel'), 0n), /execution budget/)
  assert.equal(research.evaluateScalarPlugin(module('increment'), 0n), 1n)
  assert.match(await readFile(new URL('../dist/WASM-THIRD-PARTY.txt', import.meta.url), 'utf8'), /wasmi 2\.0\.3/)
})

test('the packaged SDK exports exact plugin series at separate UTC cutoffs', async () => {
  const file = new URL('../../../crates/core/tests/fixtures/scalar-plugins.txt', import.meta.url)
  const [source, research] = await Promise.all([readFile(file, 'utf8'), createResearchEngine(wasm)])
  const increment = Buffer.from(/^increment ([a-f0-9]+)$/m.exec(source)[1], 'hex')
  const at = '2025-06-03T14:00:00Z'
  const first = Date.parse(at) / 1000
  const bars = research.parseBars('time,open,high,low,close,volume\n' +
    at + ',-0.000005,-0.000005,-0.000005,-0.000005,1\n' +
    '2025-06-03T14:03:00Z,0.000003,0.000003,0.000003,0.000003,1\n')
  assert.deepEqual(research.evaluateScalarPluginSeries(increment, bars, first - 120, first - 1), [])
  const one = { time: first, close: -5n, value: -4n }
  assert.deepEqual(research.evaluateScalarPluginSeries(increment, bars, first, first), [one])
  assert.deepEqual(research.evaluateScalarPluginSeries(increment, bars, first, first + 180),
    [one, { time: first + 180, close: 3n, value: 4n }])
})

test('the packaged SDK supplies exact monthly price evidence at a historical cutoff', async () => {
  const fixture = new URL('../../../crates/core/tests/fixtures/synthetic-monthly-returns.csv', import.meta.url)
  const [history, research] = await Promise.all([readFile(fixture, 'utf8'), createResearchEngine(wasm)])
  const bars = research.parseBars(history)
  const first = research.monthlyReturns(bars, 2024, 2024, bars[1].time)
  assert.equal(first.length, 12)
  assert.deepEqual(first[0], { year: 2024, month: 1, window: 'month-to-date',
    prior: { at: bars[0].time, ticks: 80000000n }, current: { at: bars[1].time, ticks: 90000000n }, percent: 12500000n })
  const later = research.monthlyReturns(bars, 2024, 2024, bars[3].time)
  assert.equal(later[0].percent, 25000000n)
  assert.equal(later[1].percent, -25000000n)
  assert.deepEqual(research.monthlyReturns(bars, 2024, 2024, bars[1].time), first)
})

test('the packaged SDK replays economic reports and their evidence at independent UTC cutoffs', async () => {
  const fixture = new URL('../../../crates/core/tests/fixtures/synthetic-macro-calendar.csv', import.meta.url)
  const [reports, research] = await Promise.all([readFile(fixture, 'utf8'), createResearchEngine(wasm)])
  const utc = time => '2025-04-03T' + time + 'Z'
  const query = (published, known, data = reports) => research.macroAsOf(data, utc(published), utc(known))
  assert.equal(research.macroIndex(reports), Date.parse(utc('13:02:00')) / 1000)
  assert.deepEqual(query('12:00:00', '14:52:00'), [])
  assert.deepEqual(query('14:29:59', '14:32:00')[0].actualHistory, [])
  assert.deepEqual(query('14:30:00', '14:31:59')[0].actualHistory, [])
  const original = query('14:30:00', '14:32:00')
  assert.deepEqual(original[0].actualHistory, [{
    recordId: 'CPI-A0', publishedAt: 1743690600, observedAt: 1743690720,
    scheduledAt: null, value: 2700000n, supersedes: null,
  }])
  assert.equal(original[0].forecast.recordId, 'CPI-F2')
  assert.equal(original[1].forecast, null)
  const revised = query('14:50:00', '14:52:00')
  assert.deepEqual(revised[0].actualHistory.map(row => [row.recordId, row.value, row.supersedes]), [
    ['CPI-A0', 2700000n, null], ['CPI-A1', 2600000n, 'CPI-A0'], ['CPI-A2', 2800000n, 'CPI-A1'],
  ])
  const wide = reports.replace('2.8,CPI-A1', '-9007199254.740993,CPI-A1')
  assert.equal(query('14:50:00', '14:52:00', wide)[0].actualHistory[2].value, -9007199254740993n)
  const late = reports.replace('14:32:00Z,,2.7', '14:49:00Z,,2.7')
  assert.deepEqual(query('14:45:00', '14:48:00', late)[0].actualHistory, [])
  assert.deepEqual(query('14:30:00', '14:32:00'), original)
  assert.throws(() => research.macroAsOf(reports, '2025-02-29T14:30:00Z', utc('14:32:00')), /UTC timestamps/)
})

test('the packaged SDK reports depth sweep cutoffs and exact fixed-point execution', async () => {
  const depth = new URL('../../../crates/core/tests/fixtures/synthetic-depth.csv', import.meta.url)
  const [reports, research] = await Promise.all([readFile(depth, 'utf8'), createResearchEngine(wasm)])
  const sweep = known => research.recordedDepthSweep('NASDAQ:NVDA', reports, known, 'buy', '5', '100.25')
  const partial = sweep('2025-06-02T14:00:03Z')
  assert.equal(partial.received.sequence, 9007199254740994n)
  assert.equal(partial.execution.filledTicks, 3250000n)
  assert.equal(partial.execution.notionalUnits, 325812500000000n)
  assert.equal(sweep('2025-06-02T14:00:05Z').execution, null)
  assert.deepEqual(sweep('2025-06-02T14:00:03Z'), partial)
})

test('the packaged SDK keeps declared and inferred trade sides with their earlier quote evidence', async () => {
  const fixture = name => new URL('../../../crates/core/tests/fixtures/synthetic-' + name + '.csv', import.meta.url)
  const [trades, depth, research] = await Promise.all([
    readFile(fixture('trade-classification'), 'utf8'), readFile(fixture('depth'), 'utf8'), createResearchEngine(wasm),
  ])
  const query = { from: '2025-06-02T14:00:00Z', through: '2025-06-02T14:00:13Z',
    known: '2025-06-02T14:00:07Z', maxQuoteAgeSeconds: 10 }
  const known = research.classifyRecordedTrades('NASDAQ:NVDA', trades, depth, query)
  const later = research.classifyRecordedTrades('NASDAQ:NVDA', trades, depth, { ...query, known: query.through })
  assert.deepEqual(known, later.slice(0, 7))
  assert.equal(known[2].quote.stamp.sequence, 9007199254740993n)
  assert.equal(known[6].basis, 'reported')
  assert.equal(later[7].side, 'buy')
  assert.equal(later[7].quote.stamp.sequence, 9007199254740994n)
})

test('the packaged SDK distinguishes paper fills, a gap and recovered depth', async () => {
  const fixture = name => new URL('../../../crates/core/tests/fixtures/synthetic-paper-depth-' + name + '.csv', import.meta.url)
  const [controls, depth, research] = await Promise.all([
    readFile(fixture('controls'), 'utf8'), readFile(fixture('liquidity'), 'utf8'), createResearchEngine(wasm),
  ])
  const config = { startingCash: '1000', positionLimit: '10', exposureLimit: '1200', feePerShare: '0.1', feePerOrder: '2' }
  const time = sec => '2025-06-02T14:00:0' + sec + 'Z'
  const query = sec => research.paperDepthReplay('NASDAQ:NVDA', controls, depth, time(sec), config)
  assert.equal(research.paperDepthIndex('NASDAQ:NVDA', controls, depth).length, 9)
  assert.equal(query(4).ledger.positions[0].shares, 4n)
  assert.equal(query(6).depthStatus.kind, 'sequence-gap')
  assert.equal(query(7).ledger.cash, 697500000n)
  assert.equal(query(9).ledger.halted, true)
})

test('function libraries stay scoped to each evaluation and engine', async () => {
  const [first, second] = await Promise.all([
    createResearchEngine(wasm), createResearchEngine(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)),
  ])
  const bars = first.parseBars(csv)
  const functionWith = body => [{ name: 'adjust', parameters: ['price'], body }]
  assert.deepEqual(first.evaluateFormula('adjust(close)', bars.slice(0, 2), functionWith('price + 1')).values,
    [11000000n, 13000000n])
  assert.deepEqual(second.evaluateFormula('adjust(close)', bars.slice(0, 2), functionWith('price - 1')).values,
    [9000000n, 11000000n])
  assert.throws(() => first.evaluateFormula('adjust(close)', bars), /Unknown formula field or function/)
  assert.throws(() => second.evaluateFormula('adjust(close)', bars, functionWith('price + high')), /explicit parameter/)
})

test('the TypeScript SDK screens effective members at an independent known cutoff', async () => {
  const fixture = name => new URL('../../../crates/core/tests/fixtures/synthetic-universe' + name, import.meta.url)
  const [membership, prices, research] = await Promise.all([
    readFile(fixture('.csv'), 'utf8'), readFile(fixture('-prices.csv'), 'utf8'), createResearchEngine(wasm),
  ])
  const utc = time => '2025-06-02T' + time + 'Z'
  const query = (effective, known) => research.universeScreen(membership, prices, utc('14:00:00'), utc(effective), utc(known))
  const ranks = rows => rows.map(row => [row.listingId, row.rank, row.returnUnits])
  assert.deepEqual(ranks(query('14:05:00', '14:05:00')), [['ALFA-001', 1, 10_000n]])
  const pending = query('14:10:00', '14:10:00')
  assert.deepEqual(ranks(pending), [['ALFA-001', 1, 20_000n], ['BETA-001', null, null]])
  assert.equal(pending[1].current, null)
  assert.deepEqual(ranks(query('14:10:00', '14:12:00')), [['BETA-001', 1, 120_000n], ['ALFA-001', 2, 20_000n]])
  assert.deepEqual(ranks(query('14:10:00', '14:16:00')), [['ALFA-001', 1, 20_000n], ['BETA-001', 2, 10_000n]])
  assert.deepEqual(ranks(query('14:20:00', '14:25:00')), [['BETA-001', 1, 80_000n]])
  assert.deepEqual(query('14:35:00', '14:35:00'), [])
  assert.equal(query('14:45:00', '14:45:00')[0].baseline, null)
  assert.deepEqual(query('14:10:00', '14:10:00'), pending)
  const extreme = [
    'universe,listing_id,price_at,observed_at,close',
    'DEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,0.000001',
    'DEMO-BASKET,ALFA-001,2025-06-02T14:05:00Z,2025-06-02T14:05:00Z,2000000000',
  ].join('\n')
  const [large] = research.universeScreen(membership, extreme, utc('14:00:00'), utc('14:05:00'), utc('14:05:00'))
  assert.equal(large.returnUnits, (2_000_000_000_000_000n - 1n) * 1_000_000n)
})

test('the public SDK preserves both rank snapshots and the revised observation evidence', async () => {
  const fixture = name => new URL('../../../crates/core/tests/fixtures/synthetic-universe' + name, import.meta.url)
  const [membership, prices, research] = await Promise.all([
    readFile(fixture('.csv'), 'utf8'), readFile(fixture('-prices.csv'), 'utf8'), createResearchEngine(wasm),
  ])
  const utc = time => '2025-06-02T' + time + 'Z'
  const effective = utc('14:10:00')
  const rows = research.compareUniverseRanks(membership, prices, utc('14:00:00'),
    { effective, known: utc('14:12:00') }, { effective, known: utc('14:16:00') })
  assert.deepEqual(rows.map(row => [row.listingId, row.before.rank, row.after.rank, row.rankMove]), [
    ['ALFA-001', 2, 1, 1], ['BETA-001', 1, 2, -1],
  ])
  assert.equal(rows[1].before.membership.changeId, 'BETA-JOIN')
  assert.deepEqual(rows[1].after.current, { ticks: 50500000n, observedAt: Date.parse(utc('14:16:00')) / 1000 })
})

test('the public TypeScript SDK reads quarterly evidence from its packaged engine', async () => {
  const fixture = name => new URL('../../../crates/core/tests/fixtures/synthetic-financial-' + name + '.csv', import.meta.url)
  const [filings, caps, research] = await Promise.all([
    readFile(fixture('periods'), 'utf8'), readFile(fixture('market-caps'), 'utf8'), createResearchEngine(wasm),
  ])
  assert.equal(research.financialIndex(filings, caps)[0].id, 'DEMO-ALFA')
  const result = research.financialSnapshot(filings, caps, 'DEMO-ALFA', '2025-04-03T14:00:00Z', '2025-04-03T14:22:00Z')
  assert.equal(result.quarters[3].sourceId, 'ALFA-Q4-A1')
  assert.equal(result.trailing.revenue, 8000000000000010n)
  assert.equal(result.trailing.commonNetIncome, null)
  assert.deepEqual(result.quarterlyValuation.priceSales, { kind: 'value', units: 1500000n })
})


test('the TypeScript SDK preserves point-in-time option quotes, analytics and dividend revisions', async () => {
  const fixture = name => readFile(new URL('../../../crates/core/tests/fixtures/synthetic-option-' + name + '.csv', import.meta.url), 'utf8')
  const [underlying, quotes, cash, research] = await Promise.all([
    fixture('underlying'), fixture('exercise-quotes'), fixture('cash-dividends'), createResearchEngine(wasm),
  ])
  const iso = time => '2025-04-03T' + time + 'Z'
  const at = iso('14:00:00')
  const contract = 'APR-AM-C90'
  const source = research.optionIndex(underlying, quotes)
  assert.equal(source.instrument, 'DEMO:OPT')
  assert.equal(source.currency, 'USD')
  const before = research.optionSnapshot(underlying, quotes, at, at, 300)
  assert.equal(before.underlying.spot, 100_000_000n)
  assert.ok(!before.options.some(row => row.id === contract))
  const call = before.options.find(row => row.id === 'APR-C100')
  assert.equal(call.bid, 8_807_321n)
  assert.equal(call.result.volatility.toFixed(4), '0.2000')
  const visible = research.optionSnapshot(underlying, quotes, at, iso('14:02:00'), 300)
  assert.equal(visible.options.find(row => row.id === contract).result, 'american-volatility-required')
  assert.equal(research.americanOptionPrice(underlying, quotes, contract, at, iso('14:02:00'), 300, .25, 128).toFixed(6), '16.247756')
  assert.equal(research.americanOptionImplied(underlying, quotes, contract, at, iso('14:03:00'), 300, 128).price.toFixed(6), '16.234568')
  const price = known => research.americanOptionCashPrice(underlying, quotes, cash, contract, at, iso(known), 300, .25, 128)
  const implied = known => research.americanOptionCashImplied(underlying, quotes, cash, contract, at, iso(known), 300, 128)
  assert.equal(price('14:04:00').price.toFixed(6), '14.437394')
  const initial = implied('14:04:00')
  const revised = implied('14:06:00')
  const cancelled = implied('14:07:00')
  assert.deepEqual(revised.dividends.map(row => [row.id, row.amountPerShare]), [
    ['EXTRA', 1_000_000n], ['MAIN', 9_000_000n],
  ])
  assert.deepEqual(cancelled.dividends.map(row => row.id), ['MAIN'])
  assert.equal(revised.price.toFixed(6), '16.234568')
  assert.equal((revised.volatility * 100).toFixed(2), '32.53')
  assert.deepEqual(implied('14:04:00'), initial)
})
