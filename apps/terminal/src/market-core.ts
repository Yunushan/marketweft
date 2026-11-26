/** Chart-facing numbers represent six-place fixed-point prices and volume. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const replayKinds = ['open', 'bar', 'missing', 'close'] as const;
export interface ReplayEvent {
  kind: typeof replayKinds[number];
  eventTime: number;
  observedAt: number;
  barIndex: number | null;
  sessionIndex: number;
  utcOffsetMinutes: number;
  earlyClose: boolean;
}

export interface Split {
  actionId?: string;
  canceled?: boolean;
  announcedAt: number;
  effectiveAt: number;
  observedAt: number;
  newShares: number;
  oldShares: number;
}

const dividendKinds = ['report', 'ex', 'pay'] as const;
export interface DividendMovement {
  currency: string;
  receivableDelta: bigint;
  cashDelta: bigint;
  receivable: bigint;
  cash: bigint;
}
export interface DividendEvent {
  at: number;
  kind: typeof dividendKinds[number];
  id: string;
  announcedAt: number;
  exAt: number;
  payAt: number;
  observedAt: number;
  currency: string;
  amountPerShare: bigint;
  movements: DividendMovement[];
}

const universeStatuses = ['member', 'removed', 'delisted'] as const;
export interface UniverseListing {
  listingId: string;
  instrument: string;
  status: typeof universeStatuses[number];
  changeId: string;
  effectiveAt: number;
  observedAt: number;
}

export interface ScreenPrice {
  ticks: bigint;
  observedAt: number;
}

export interface ScreenRow {
  listingId: string;
  instrument: string;
  rank: number | null;
  returnUnits: bigint | null;
  baseline: ScreenPrice | null;
  current: ScreenPrice | null;
}

export interface HeatmapListing {
  listingId: string;
  instrument: string;
  rank: number | null;
  returnUnits: bigint | null;
  weight: number | null;
  effectiveAt: number | null;
  observedAt: number | null;
  contribution: bigint | null;
}

interface WeightTotals {
  knownWeight: number;
  coveredWeight: number;
  contribution: bigint | null;
}

export interface SectorGroup extends WeightTotals {
  sector: string | null;
  weightedReturn: bigint | null;
  listings: HeatmapListing[];
}

export interface Heatmap extends WeightTotals {
  groups: SectorGroup[];
}

export interface FinancialIssuer {
  id: string;
  suggestedAt: number;
}

export interface Filing {
  sourceId: string;
  fiscalStart: number;
  fiscalEnd: number;
  publishedAt: number;
  observedAt: number;
  currency: string;
  revenue: bigint | null;
  commonNetIncome: bigint | null;
  commonEquity: bigint | null;
  operatingCashFlow: bigint | null;
}

export interface MarketCap {
  sourceId: string;
  at: number;
  observedAt: number;
  currency: string;
  ticks: bigint;
}

export type Multiple =
  | { kind: 'value'; units: bigint }
  | { kind: 'missing-filing' | 'missing-cap' | 'currency' | 'missing-denominator' | 'nonpositive-denominator' };

export interface Valuation {
  filing: Filing | null;
  marketCap: MarketCap | null;
  priceEarnings: Multiple;
  priceSales: Multiple;
  priceBook: Multiple;
}

export interface MacroRecord {
  recordId: string;
  publishedAt: number;
  observedAt: number;
  scheduledAt: number | null;
  value: bigint | null;
  supersedes: string | null;
}

export interface MacroRelease {
  releaseId: string;
  seriesId: string;
  referenceDate: number;
  unit: string;
  schedule: MacroRecord | null;
  forecast: MacroRecord | null;
  actualHistory: MacroRecord[];
}

export interface OptionSource {
  instrument: string;
  currency: string;
  firstObservedAt: number;
}

export interface OptionUnderlying {
  at: number;
  observedAt: number;
  spot: bigint;
  rate: bigint;
  dividendYield: bigint;
}

export interface OptionAnalytics {
  volatility: number;
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

const unavailableOptions = [
  'expired', 'stale-option', 'missing-bid-ask', 'crossed', 'missing-underlying',
  'stale-underlying', 'model-range', 'price-bounds', 'unresolved-vol',
] as const;

export type OptionUnavailable = typeof unavailableOptions[number];

export interface OptionReport {
  id: string;
  expiration: number;
  strike: bigint;
  side: 'call' | 'put';
  at: number;
  observedAt: number;
  bid: bigint | null;
  ask: bigint | null;
  result: OptionAnalytics | OptionUnavailable;
}

export interface OptionSnapshot {
  underlying: OptionUnderlying | null;
  options: OptionReport[];
}

export interface AlertObservation {
  id: string;
  measuredAt: number;
  observedAt: number;
  ticks: string;
  comparisonNumerator: string;
  comparisonCount: number;
}

export interface AlertCrossing {
  schemaVersion: 1;
  id: string;
  rule: {
    id: string;
    revision: string;
    series: string;
    effectiveAt: number;
    observedAt: number;
    kind: 'threshold' | 'sma';
    operand: string;
    direction: 'above' | 'below' | 'either';
  };
  direction: 'above' | 'below';
  previous: AlertObservation;
  current: AlertObservation;
}

export interface PaperConfig {
  startingCash: string;
  positionLimit: string;
  exposureLimit: string;
  feePerShare: string;
  feePerOrder: string;
}

export interface PaperOrder {
  id: string;
  instrument: string;
  side: string;
  at: number;
  limit: bigint;
  shares: bigint;
  remaining: bigint;
  status: string;
}

export interface PaperReceipt {
  id: string;
  observedAt: number;
  kind: string;
  orderId: string | null;
  sourceId: string | null;
  priceAt: number | null;
  shares: bigint | null;
  price: bigint | null;
  status: string;
  cashDelta: bigint;
  fee: bigint;
  realizedDelta: bigint;
}

export interface PaperSnapshot {
  cash: bigint;
  reserved: bigint;
  available: bigint;
  committed: bigint;
  realized: bigint;
  halted: boolean;
  orders: PaperOrder[];
  positions: { instrument: string; shares: bigint; cost: bigint }[];
  receipts: PaperReceipt[];
}

export interface BacktestConfig {
  paper: PaperConfig;
  fastWindow: string;
  slowWindow: string;
  targetShares: string;
  participation: string;
  slippage: string;
  limitBuffer: string;
  maxWait: string;
}

export interface BacktestResult {
  ledger: PaperSnapshot;
  drawdown: bigint;
  signals: { at: number; barIndex: number; side: string }[];
  marks: { at: number; close: bigint; cash: bigint; shares: bigint; equity: bigint }[];
}

export interface WalkForwardConfig {
  trainingBars: string;
  testBars: string;
  candidates: string;
}

export interface WalkForwardFold {
  trainingStart: number;
  trainingEnd: number;
  testStart: number;
  testEnd: number;
  selected: { fast: number; slow: number };
  scores: { fast: number; slow: number; equity: bigint; drawdown: bigint; fills: number }[];
  test: BacktestResult;
}

export interface ScenarioConfig {
  seed: string;
  paths: string;
  horizon: string;
}

export interface ScenarioStats {
  endingEquity: bigint;
  maxDrawdown: bigint;
  maxExposure: bigint;
}

export interface ThreeQuantiles {
  p05: bigint;
  p50: bigint;
  p95: bigint;
}

export interface ScenarioReport {
  cutoff: number;
  seed: bigint;
  horizon: number;
  firstObserved: number;
  lastObserved: number;
  anchor: number;
  eligibleMoves: number;
  startingCash: bigint;
  baseline: ScenarioStats;
  endingEquity: ThreeQuantiles;
  maxDrawdown: ThreeQuantiles;
  maxExposure: ThreeQuantiles;
  lossPaths: number;
  paths: ScenarioStats[];
}

export interface DelistingValuation {
  state: 'unobserved' | 'shares' | 'missing-proceeds' | 'receivable' | 'paid';
  ordinaryShares: number;
  entitledShares: number;
  change?: { id: string; instrument: string; effectiveAt: number; observedAt: number };
  termsAt?: number;
  offer?: { currency: string; rate: bigint; total: bigint; payAt: number | null };
  reference?: { at: number; currency: string; price: bigint };
  returnPctMicros?: bigint;
  ledger: { at: number; currency: string; delta: bigint; balance: bigint }[];
}

export interface MarketCore {
  instrument(venue: string, symbol: string): string;
  parseCsv(csv: string): Bar[];
  indicator(kind: 'sma' | 'ema', period: number, bars: readonly Bar[]): (number | null)[];
  replay(calendar: string, intervalSeconds: number, bars: readonly Bar[]): ReplayEvent[];
  splitBook(instrument: string, csv: string): Split[];
  adjustSplits(bars: readonly Bar[], splits: readonly Split[], asOf: number): Bar[];
  dividendLedger(instrument: string, csv: string, entitledShares: number): DividendEvent[];
  universeIndex(csv: string): { name: string; checkpoints: number[] };
  universeAsOf(csv: string, effectiveAt: string, knownAt: string): UniverseListing[];
  delistingAsOf(membership: string, terms: string, listing: string, shares: number,
    effectiveAt: string, knownAt: string): DelistingValuation;
  universeScreen(membership: string, prices: string, baselineAt: string,
    effectiveAt: string, knownAt: string): ScreenRow[];
  sectorHeatmap(membership: string, prices: string, sectors: string, baselineAt: string,
    effectiveAt: string, knownAt: string): Heatmap;
  financialIndex(filings: string, caps: string): FinancialIssuer[];
  financialAsOf(filings: string, caps: string, issuer: string, at: string, known: string): Valuation;
  macroIndex(csv: string): number;
  macroAsOf(csv: string, published: string, known: string): MacroRelease[];
  optionIndex(underlying: string, quotes: string): OptionSource;
  optionSnapshot(underlying: string, quotes: string, effective: string, known: string, maxAge: number): OptionSnapshot;
  alertIndex(rules: string, observations: string): number;
  alertReplay(rules: string, observations: string, effective: string, known: string): AlertCrossing[];
  paperIndex(csv: string): number[];
  paperReplay(csv: string, cutoff: string, config: PaperConfig): PaperSnapshot;
  backtestIndex(calendar: string, bars: string, interval: number): number[];
  backtest(instrument: string, calendar: string, bars: string, interval: number,
    cutoff: string, config: BacktestConfig): BacktestResult;
  walkForward(instrument: string, calendar: string, bars: string, interval: number,
    cutoff: string, execution: BacktestConfig, config: WalkForwardConfig): WalkForwardFold[];
  scenarios(instrument: string, calendar: string, bars: string, interval: number,
    cutoff: string, execution: BacktestConfig, config: ScenarioConfig): ScenarioReport;
}

interface MarketExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  mw_version(): number;
  mw_input(bytes: number): number;
  mw_output(): number;
  mw_output_len(): number;
  mw_instrument(): number;
  mw_parse(): number;
  mw_indicator(kind: number, period: number): number;
  mw_replay(calendarBytes: number, intervalSeconds: number): number;
  mw_split_book(): number;
  mw_split_revision_book(): number;
  mw_adjust_splits(records: number): number;
  mw_adjust_split_revisions(records: number): number;
  mw_dividend_ledger(shares: number): number;
  mw_universe_index(): number;
  mw_universe_as_of(): number;
  mw_delisting_as_of(membershipBytes: number, shares: number): number;
  mw_universe_screen(membershipBytes: number): number;
  mw_sector_heatmap(membershipBytes: number, priceBytes: number): number;
  mw_financial_index(filingBytes: number): number;
  mw_financial_as_of(filingBytes: number): number;
  mw_macro_index(): number;
  mw_macro_as_of(): number;
  mw_option_index(underlyingBytes: number): number;
  mw_option_snapshot(underlyingBytes: number, maxAge: number): number;
  mw_alert_index(ruleBytes: number): number;
  mw_alert_replay(ruleBytes: number): number;
  mw_paper_index(): number;
  mw_paper_replay(): number;
  mw_backtest_index(calendarBytes: number, interval: number): number;
  mw_backtest(calendarBytes: number, interval: number): number;
  mw_walk_forward(calendarBytes: number, interval: number): number;
  mw_run_scenarios(calendarBytes: number, interval: number): number;
}

const SCALE = 1_000_000;
const MISSING = -(1n << 63n);
const LIMIT = 8 * 1024 * 1024;
const LEGACY_SPLIT_BYTES = 32;
const SPLIT_ID_BYTES = 40;
const REVISED_SPLIT_BYTES = LEGACY_SPLIT_BYTES + SPLIT_ID_BYTES;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function backtestHeader(instrument: string, cutoff: string, config: BacktestConfig) {
  if (cutoff.length !== 20 || /[\n\r]/.test(instrument + cutoff)) {
    throw new Error('Use an instrument and a YYYY-MM-DDTHH:MM:SSZ UTC observation cutoff.');
  }
  const settings = [config.fastWindow, config.slowWindow, config.targetShares,
    config.participation, config.slippage, config.limitBuffer, config.maxWait].map(value => value.trim());
  if (settings.some(value => !/^\d+$/.test(value))) {
    throw new Error('Use whole-number strategy settings.');
  }
  return [instrument, cutoff, paperSettings(config.paper), settings.join(',')];
}

function decodeBacktest(lines: string[]): BacktestResult {
  const paper: string[] = [];
  const signals: BacktestResult['signals'] = [];
  const marks: BacktestResult['marks'] = [];
  let drawdown = 0n;
  for (const line of lines) {
    const [type, ...fields] = line.split('\t');
    if (type === 'D') {
      drawdown = BigInt(fields[0]);
    } else if (type === 'S') {
      const [at, index, side] = fields;
      signals.push({ at: Number(at), barIndex: Number(index), side });
    } else if (type === 'M') {
      const [at, close, cash, shares, equity] = fields;
      marks.push({ at: Number(at), close: BigInt(close), cash: BigInt(cash), shares: BigInt(shares), equity: BigInt(equity) });
    } else {
      paper.push(line);
    }
  }
  return { ledger: decodePaper(paper.join('\n') + '\n'), drawdown, signals, marks };
}

function decodePaper(text: string): PaperSnapshot {
  const [header, ...rows] = text.slice(0, -1).split('\n');
  const [, cash, reserved, available, committed, realized, halted] = header.split('\t');
  const snapshot: PaperSnapshot = { cash: BigInt(cash), reserved: BigInt(reserved),
    available: BigInt(available), committed: BigInt(committed), realized: BigInt(realized),
    halted: halted === '1', orders: [], positions: [], receipts: [] };
  for (const row of rows) {
    const [type, ...fields] = row.split('\t');
    if (type === 'O') {
      const [id, instrument, side, at, limit, shares, remaining, status] = fields;
      snapshot.orders.push({ id, instrument, side, at: Number(at), limit: BigInt(limit),
        shares: BigInt(shares), remaining: BigInt(remaining), status });
    } else if (type === 'P') {
      const [instrument, shares, cost] = fields;
      snapshot.positions.push({ instrument, shares: BigInt(shares), cost: BigInt(cost) });
    } else if (type === 'E') {
      const [id, observedAt, kind, order, source, effective, shares, price, status, cashDelta, fee, realizedDelta] = fields;
      snapshot.receipts.push({ id, observedAt: Number(observedAt), kind, orderId: order || null, sourceId: source || null,
        priceAt: effective === '' ? null : Number(effective), shares: shares === '' ? null : BigInt(shares),
        price: price === '' ? null : BigInt(price), status, cashDelta: BigInt(cashDelta),
        fee: BigInt(fee), realizedDelta: BigInt(realizedDelta) });
    } else {
      throw new Error('Invalid paper ledger row from the calculation engine.');
    }
  }
  return snapshot;
}

function paperSettings(config: PaperConfig): string {
  const { startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder } = config;
  const settings = [startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder];
  if (settings.some(value => /[,\n\r]/.test(value))) {
    throw new Error('Use plain numbers for account settings.');
  }
  return settings.join(',');
}

function validateInterval(interval: number) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 86400) {
    throw new Error('Replay interval must be 1–86,400 seconds.');
  }
}

export async function instantiateMarketCore(bytes: ArrayBuffer): Promise<MarketCore> {
  const instance = await WebAssembly.instantiate(bytes);
  const api = instance.instance.exports as MarketExports;
  if (api.mw_version() !== 1) throw new Error('Unsupported MarketWeft calculation engine.');

  function input(len: number): DataView {
    if (len > LIMIT) throw new Error('Input exceeds 8 MiB.');
    const ptr = api.mw_input(len);
    if (!ptr) throw new Error('The calculation engine could not allocate input.');
    return new DataView(api.memory.buffer, ptr, len);
  }

  function textInput(text: string) {
    if (text.length > LIMIT) throw new Error('Input exceeds 8 MiB.');
    const data = encoder.encode(text);
    const dest = input(data.byteLength);
    new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(data);
  }

  function output(status: number): DataView {
    const view = new DataView(api.memory.buffer, api.mw_output(), api.mw_output_len());
    if (status !== 0) throw new Error(decoder.decode(view));
    return view;
  }

  function screenInput(times: string[], ...files: string[]) {
    if (times.some(value => value.length !== 20 || /[\n\r]/.test(value))) {
      throw new Error('Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
    }
    textInput([...times, files.join('')].join('\n'));
  }

  function decodeBars(out: DataView): Bar[] {
    const fixed = (offset: number) => Number(out.getBigInt64(offset, true)) / SCALE;
    const bars: Bar[] = [];
    for (let i = 0; i < out.byteLength; i += 48) {
      bars.push({ time: Number(out.getBigInt64(i, true)), open: fixed(i + 8), high: fixed(i + 16),
        low: fixed(i + 24), close: fixed(i + 32), volume: fixed(i + 40) });
    }
    return bars;
  }

  return {
    instrument(venue, symbol) {
      textInput(venue + '\n' + symbol);
      return decoder.decode(output(api.mw_instrument()));
    },
    parseCsv(csv) {
      textInput(csv);
      return decodeBars(output(api.mw_parse()));
    },
    indicator(kind, period, bars) {
      if (kind !== 'sma' && kind !== 'ema') throw new Error('Unknown indicator.');
      if (!Number.isInteger(period) || period < 1 || period > 100_000 || bars.length > 100_000) {
        throw new Error('Series and indicator period must fit within 100,000 bars.');
      }
      const dest = input(bars.length * 8);
      bars.forEach(({ close }, i) => {
        const ticks = Math.round(close * SCALE);
        if (!Number.isSafeInteger(ticks) || Math.abs(close) > 2_000_000_000 ||
          close !== ticks / SCALE) {
          throw new Error('Close must be a finite six-place fixed-point price.');
        }
        dest.setBigInt64(i * 8, BigInt(ticks), true);
      });
      const out = output(api.mw_indicator(kind === 'sma' ? 0 : 1, period));
      return Array.from({ length: bars.length }, (_, i) => {
        const v = out.getBigInt64(i * 8, true);
        return v === MISSING ? null : Number(v) / SCALE;
      });
    },
    replay(calendar, intervalSeconds, bars) {
      if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 86_400) {
        throw new Error('Replay interval must be 1–86,400 seconds.');
      }
      if (bars.length > 100_000) throw new Error('Replay supports up to 100,000 bars.');
      const calendarLimit = 1024 * 1024;
      if (calendar.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
      const encoded = encoder.encode(calendar);
      if (encoded.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
      const dest = input(encoded.length + bars.length * 8);
      new Uint8Array(dest.buffer, dest.byteOffset, encoded.length).set(encoded);
      bars.forEach(({ time }, i) => {
        if (!Number.isSafeInteger(time)) throw new Error('Bar time must be integer UTC seconds.');
        dest.setBigInt64(encoded.length + i * 8, BigInt(time), true);
      });
      const out = output(api.mw_replay(encoded.length, intervalSeconds));
      const events: ReplayEvent[] = [];
      for (let i = 0; i < out.byteLength; i += 32) {
        const index = out.getInt32(i + 16, true);
        const flags = out.getUint32(i + 28, true);
        events.push({
          kind: replayKinds[flags & 255],
          eventTime: Number(out.getBigInt64(i, true)),
          observedAt: Number(out.getBigInt64(i + 8, true)),
          barIndex: index < 0 ? null : index,
          sessionIndex: out.getUint32(i + 20, true),
          utcOffsetMinutes: out.getInt32(i + 24, true),
          earlyClose: Boolean(flags & 256),
        });
      }
      return events;
    },
    universeIndex(csv) {
      textInput(csv);
      const [name, ...checkpoints] = decoder.decode(output(api.mw_universe_index())).split('\n');
      return { name, checkpoints: checkpoints.map(Number) };
    },
    universeAsOf(csv, effectiveAt, knownAt) {
      if ([effectiveAt, knownAt].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput(effectiveAt + '\n' + knownAt + '\n' + csv);
      const text = decoder.decode(output(api.mw_universe_as_of())).trimEnd();
      if (!text) return [];
      return text.split('\n').map(line => {
        const [listingId, instrument, status, changeId, effectiveAt, observedAt] = line.split('\t');
        return { listingId, instrument, status: universeStatuses[Number(status)], changeId,
          effectiveAt: Number(effectiveAt), observedAt: Number(observedAt) };
      });
    },
    delistingAsOf(membership, terms, listing, shares, effectiveAt, knownAt) {
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(listing) || !Number.isInteger(shares) || shares < 0 || shares > 1_000_000
        || [effectiveAt, knownAt].some(time => time.length !== 20 || /[\n\r]/.test(time))) {
        throw new Error('Use a listing ID, up to 1,000,000 whole entitled shares and UTC cutoffs.');
      }
      textInput([listing, effectiveAt, knownAt, membership + terms].join('\n'));
      const text = decoder.decode(output(api.mw_delisting_as_of(encoder.encode(membership).length, shares)));
      const [heading, ...lines] = text.slice(0, -1).split('\n');
      const [state, ordinary, entitled] = heading.split('\t');
      const value: DelistingValuation = { state: state as DelistingValuation['state'],
        ordinaryShares: Number(ordinary), entitledShares: Number(entitled), ledger: [] };
      for (const line of lines) {
        const [tag, a, b, c, d] = line.split('\t');
        if (tag === 'D') value.change = { id: a, instrument: b, effectiveAt: Number(c), observedAt: Number(d) };
        if (tag === 'T') value.termsAt = Number(a);
        if (tag === 'O') value.offer = { currency: a, rate: BigInt(b), total: BigInt(c), payAt: d ? Number(d) : null };
        if (tag === 'R') value.reference = { at: Number(a), currency: b, price: BigInt(c) };
        if (tag === 'P') value.returnPctMicros = BigInt(a);
        if (tag === 'L') value.ledger.push({ at: Number(a), currency: b, delta: BigInt(c), balance: BigInt(d) });
      }
      return value;
    },
    universeScreen(membership, prices, baselineAt, effectiveAt, knownAt) {
      screenInput([baselineAt, effectiveAt, knownAt], membership, prices);
      const membershipBytes = encoder.encode(membership).length;
      const text = decoder.decode(output(api.mw_universe_screen(membershipBytes)));
      if (!text) return [];
      const price = (field: string): ScreenPrice | null => {
        if (field === '') return null;
        const [ticks, observedAt] = field.split(',');
        return { ticks: BigInt(ticks), observedAt: Number(observedAt) };
      };
      return text.slice(0, -1).split('\n').map(line => {
        const [listingId, instrument, rank, change, baseline, current] = line.split('\t');
        return { listingId, instrument, rank: rank === '' ? null : Number(rank),
          returnUnits: change === '' ? null : BigInt(change), baseline: price(baseline),
          current: price(current) };
      });
    },
    sectorHeatmap(membership, prices, sectors, baselineAt, effectiveAt, knownAt) {
      screenInput([baselineAt, effectiveAt, knownAt], membership, prices, sectors);
      const text = decoder.decode(output(api.mw_sector_heatmap(
        encoder.encode(membership).length, encoder.encode(prices).length,
      )));
      const optionalInt = (value: string) => value === '' ? null : Number(value);
      const optionalBigInt = (value: string) => value === '' ? null : BigInt(value);
      const [summary, ...lines] = text.slice(0, -1).split('\n');
      const [, knownWeight, coveredWeight, net] = summary.split('\t');
      const map: Heatmap = {
        knownWeight: Number(knownWeight), coveredWeight: Number(coveredWeight),
        contribution: optionalBigInt(net), groups: [],
      };
      for (const line of lines) {
        const [type, ...fields] = line.split('\t');
        if (type === 'S') {
          const [sector, known, covered, weightedReturn, contribution] = fields;
          map.groups.push({ sector: sector || null, knownWeight: Number(known),
            coveredWeight: Number(covered), weightedReturn: optionalBigInt(weightedReturn),
            contribution: optionalBigInt(contribution), listings: [] });
        } else {
          const group = map.groups.at(-1);
          if (type !== 'L' || !group) throw new Error('Invalid heatmap record from the calculation engine.');
          const [listingId, instrument, rank, change, weight, effective, observed, contribution] = fields;
          group.listings.push({ listingId, instrument, rank: optionalInt(rank),
            returnUnits: optionalBigInt(change), weight: optionalInt(weight),
            effectiveAt: optionalInt(effective), observedAt: optionalInt(observed),
            contribution: optionalBigInt(contribution) });
        }
      }
      return map;
    },
    financialIndex(filings, caps) {
      textInput(filings + caps);
      const text = decoder.decode(output(api.mw_financial_index(encoder.encode(filings).length)));
      return text.trimEnd().split('\n').map(line => {
        const [id, at] = line.split('\t');
        return { id, suggestedAt: Number(at) };
      });
    },
    financialAsOf(filings, caps, issuer, at, known) {
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(issuer)) throw new Error('Select an issuer in the filing history.');
      if ([at, known].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Use YYYY-MM-DDTHH:MM:SSZ UTC timestamps for valuation and knowledge.');
      }
      textInput([issuer, at, known, filings + caps].join('\n'));
      const text = decoder.decode(output(api.mw_financial_as_of(encoder.encode(filings).length)));
      let filing: Filing | null = null;
      let marketCap: MarketCap | null = null;
      const multiples: Multiple[] = [];
      const amount = (value: string) => value === '' ? null : BigInt(value);
      for (const line of text.slice(0, -1).split('\n')) {
        const [type, ...fields] = line.split('\t');
        if (type === 'F') {
          const [sourceId, start, end, pub, obs, currency, revenue, income, equity, cash] = fields;
          filing = { sourceId, fiscalStart: Number(start), fiscalEnd: Number(end), publishedAt: Number(pub),
            observedAt: Number(obs), currency, revenue: amount(revenue), commonNetIncome: amount(income),
            commonEquity: amount(equity), operatingCashFlow: amount(cash) };
        } else if (type === 'C') {
          const [sourceId, time, obs, currency, cap] = fields;
          marketCap = { sourceId, at: Number(time), observedAt: Number(obs), currency, ticks: BigInt(cap) };
        } else if (type === 'R') {
          const [kind, value] = fields;
          switch (kind) {
            case 'value': multiples.push({ kind, units: BigInt(value) }); break;
            case 'missing-filing':
            case 'missing-cap':
            case 'currency':
            case 'missing-denominator':
            case 'nonpositive-denominator': multiples.push({ kind }); break;
            default: throw new Error('Invalid valuation multiple from the calculation engine.');
          }
        }
      }
      const [priceEarnings, priceSales, priceBook] = multiples;
      if (multiples.length !== 3) throw new Error('Incomplete valuation from the calculation engine.');
      return { filing, marketCap, priceEarnings, priceSales, priceBook };
    },
    macroIndex(csv) {
      textInput(csv);
      return Number(decoder.decode(output(api.mw_macro_index())));
    },
    macroAsOf(csv, published, known) {
      if ([published, known].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Calendar times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput([published, known, csv].join('\n'));
      const text = decoder.decode(output(api.mw_macro_as_of()));
      const releases: MacroRelease[] = [];
      if (!text) return releases;
      for (const line of text.slice(0, -1).split('\n')) {
        const [type, ...fields] = line.split('\t');
        if (type === 'H') {
          const [releaseId, seriesId, reference, unit] = fields;
          releases.push({ releaseId, seriesId, referenceDate: Number(reference),
            unit, schedule: null, forecast: null, actualHistory: [] });
          continue;
        }
        const release = releases.at(-1);
        if (!release) throw new Error('Missing macro release identity from the calculation engine.');
        const [recordId, published, observed, scheduled, value, supersedes] = fields;
        const record = { recordId, publishedAt: Number(published), observedAt: Number(observed),
          scheduledAt: scheduled === '' ? null : Number(scheduled),
          value: value === '' ? null : BigInt(value), supersedes: supersedes || null };
        switch (type) {
          case 'S': release.schedule = record; break;
          case 'F': release.forecast = record; break;
          case 'A':
          case 'R': release.actualHistory.push(record); break;
          default: throw new Error('Invalid macro record from the calculation engine.');
        }
      }
      return releases;
    },
    optionIndex(underlying, quotes) {
      textInput(underlying + quotes);
      const text = decoder.decode(output(api.mw_option_index(encoder.encode(underlying).length)));
      const [instrument, currency, firstObservedAt] = text.split('\t');
      return { instrument, currency, firstObservedAt: Number(firstObservedAt) };
    },
    optionSnapshot(underlying, quotes, effective, known, maxAge) {
      if ([effective, known].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 0xffffffff) {
        throw new Error('Maximum quote age must be a whole number from 0 to 4,294,967,295 seconds.');
      }
      textInput([effective, known, underlying + quotes].join('\n'));
      const text = decoder.decode(output(api.mw_option_snapshot(encoder.encode(underlying).length, maxAge)));
      const snapshot: OptionSnapshot = { underlying: null, options: [] };
      if (!text) return snapshot;
      for (const line of text.slice(0, -1).split('\n')) {
        const [type, ...fields] = line.split('\t');
        if (type === 'U') {
          const [at, observedAt, spot, rate, dividendYield] = fields;
          snapshot.underlying = { at: Number(at), observedAt: Number(observedAt), spot: BigInt(spot),
            rate: BigInt(rate), dividendYield: BigInt(dividendYield) };
        } else if (type === 'Q') {
          const [id, expiration, strike, side, at, observedAt, bid, ask, status, ...values] = fields;
          let result: OptionAnalytics | OptionUnavailable;
          if (status === 'ok') {
            const [volatility, price, delta, gamma, vega, theta, rho] = values.map(Number);
            result = { volatility, price, delta, gamma, vega, theta, rho };
          } else {
            const issue = unavailableOptions.find(candidate => candidate === status);
            if (!issue) throw new Error('Invalid option status from the calculation engine.');
            result = issue;
          }
          if (side !== 'call' && side !== 'put') throw new Error('Invalid option side from the calculation engine.');
          snapshot.options.push({ id, expiration: Number(expiration), strike: BigInt(strike), side,
            at: Number(at), observedAt: Number(observedAt),
            bid: bid === '' ? null : BigInt(bid), ask: ask === '' ? null : BigInt(ask), result });
        } else {
          throw new Error('Invalid option row from the calculation engine.');
        }
      }
      return snapshot;
    },
    alertIndex(rules, observations) {
      textInput(rules + observations);
      return Number(decoder.decode(output(api.mw_alert_index(encoder.encode(rules).length))));
    },
    alertReplay(rules, observations, effective, known) {
      if ([effective, known].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Alert times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput([effective, known, rules + observations].join('\n'));
      const text = decoder.decode(output(api.mw_alert_replay(encoder.encode(rules).length)));
      if (!text) return [];
      function observation(fields: string[]): AlertObservation {
        const [id, measuredAt, observedAt, ticks, comparisonNumerator, comparisonCount] = fields;
        return { id, measuredAt: Number(measuredAt), observedAt: Number(observedAt),
          ticks, comparisonNumerator, comparisonCount: Number(comparisonCount) };
      }
      return text.slice(0, -1).split('\n').map(line => {
        const [id, ruleId, revision, series, since, observed, kind, operand, ruleDirection, direction, ...fields] = line.split('\t');
        if ((kind !== 'threshold' && kind !== 'sma') || (direction !== 'above' && direction !== 'below') ||
          (ruleDirection !== 'above' && ruleDirection !== 'below' && ruleDirection !== 'either')) {
          throw new Error('Invalid alert record from the calculation engine.');
        }
        return { schemaVersion: 1, id, rule: { id: ruleId, revision, series, effectiveAt: Number(since),
          observedAt: Number(observed), kind, operand, direction: ruleDirection },
          direction, previous: observation(fields.slice(0, 6)), current: observation(fields.slice(6)) };
      });
    },
    paperIndex(csv) {
      textInput(csv);
      const text = decoder.decode(output(api.mw_paper_index()));
      return text.trimEnd().split('\n').map(Number);
    },
    paperReplay(csv, cutoff, config) {
      if (cutoff.length !== 20 || /[\n\r]/.test(cutoff)) {
        throw new Error('Paper cutoff requires a YYYY-MM-DDTHH:MM:SSZ timestamp.');
      }
      textInput([cutoff, paperSettings(config), csv].join('\n'));
      const text = decoder.decode(output(api.mw_paper_replay()));
      return decodePaper(text);
    },
    backtestIndex(calendar, bars, interval) {
      validateInterval(interval);
      textInput(calendar + bars);
      return decoder.decode(output(api.mw_backtest_index(encoder.encode(calendar).length, interval)))
        .trimEnd().split('\n').map(Number);
    },
    backtest(instrument, calendar, bars, interval, cutoff, config) {
      validateInterval(interval);
      textInput([...backtestHeader(instrument, cutoff, config), calendar + bars].join('\n'));
      const text = decoder.decode(output(api.mw_backtest(encoder.encode(calendar).length, interval)));
      return decodeBacktest(text.slice(0, -1).split('\n'));
    },
    walkForward(instrument, calendar, bars, interval, cutoff, execution, config) {
      validateInterval(interval);
      const lengths = [config.trainingBars.trim(), config.testBars.trim()];
      const candidates = config.candidates.split(',').map(pair => pair.trim());
      if (lengths.some(length => !/^\d+$/.test(length)) || candidates.some(pair => !/^\d+:\d+$/.test(pair))) {
        throw new Error('Use whole-number fold lengths and comma-separated fast:slow candidate pairs.');
      }
      const header = backtestHeader(instrument, cutoff, { ...execution, fastWindow: '1', slowWindow: '2' });
      textInput([...header, [...lengths, ...candidates].join(','), calendar + bars].join('\n'));
      const text = decoder.decode(output(api.mw_walk_forward(encoder.encode(calendar).length, interval)));
      if (!text) return [];
      return text.slice(2, -1).split('\nF\t').map(block => {
        const [heading, ...lines] = block.split('\n');
        const [trainingStart, trainingEnd, testStart, testEnd, fast, slow] = heading.split('\t').map(Number);
        const scores: WalkForwardFold['scores'] = [];
        let result = 0;
        while (lines[result]?.startsWith('C\t')) {
          const [, candidateFast, candidateSlow, equity, drawdown, fills] = lines[result].split('\t');
          scores.push({ fast: Number(candidateFast), slow: Number(candidateSlow), equity: BigInt(equity),
            drawdown: BigInt(drawdown), fills: Number(fills) });
          result += 1;
        }
        return { trainingStart, trainingEnd, testStart, testEnd, selected: { fast, slow }, scores,
          test: decodeBacktest(lines.slice(result)) };
      });
    },
    scenarios(instrument, calendar, bars, interval, cutoff, execution, config) {
      validateInterval(interval);
      const settings = [config.seed, config.paths, config.horizon].map(value => value.trim());
      if (settings.some(value => !/^\d+$/.test(value))) {
        throw new Error('Use a non-negative whole-number seed, path count and horizon.');
      }
      const header = backtestHeader(instrument, cutoff, execution);
      textInput([...header, settings.join(','), calendar + bars].join('\n'));
      const text = decoder.decode(output(api.mw_run_scenarios(encoder.encode(calendar).length, interval)));
      const [heading, baseline, equity, drawdown, exposure, ...rows] = text.slice(0, -1).split('\n');
      const [through, seed, count, horizon, firstObserved, lastObserved, eligibleMoves, anchor, startingCash, lossPaths] = heading.split('\t');
      if (rows.length !== Number(count)) throw new Error('Scenario path count does not match the report.');
      const stats = (line: string): ScenarioStats => {
        const [endingEquity, maxDrawdown, maxExposure] = line.split('\t').map(BigInt);
        return { endingEquity, maxDrawdown, maxExposure };
      };
      const quantiles = (line: string): ThreeQuantiles => {
        const [p05, p50, p95] = line.split('\t').map(BigInt);
        return { p05, p50, p95 };
      };
      return {
        cutoff: Number(through), seed: BigInt(seed), horizon: Number(horizon), firstObserved: Number(firstObserved),
        lastObserved: Number(lastObserved), anchor: Number(anchor), eligibleMoves: Number(eligibleMoves),
        startingCash: BigInt(startingCash), lossPaths: Number(lossPaths), baseline: stats(baseline),
        endingEquity: quantiles(equity), maxDrawdown: quantiles(drawdown), maxExposure: quantiles(exposure),
        paths: rows.map(stats),
      };
    },
    splitBook(instrument, csv) {
      textInput(instrument + '\n' + csv);
      const revised = csv.trimStart().startsWith('instrument,action_id,');
      const width = revised ? REVISED_SPLIT_BYTES : LEGACY_SPLIT_BYTES;
      const out = output(revised ? api.mw_split_revision_book() : api.mw_split_book());
      const records: Split[] = [];
      for (let i = 0; i < out.byteLength; i += width) {
        const row: Split = {
          announcedAt: Number(out.getBigInt64(i, true)),
          effectiveAt: Number(out.getBigInt64(i + 8, true)),
          observedAt: Number(out.getBigInt64(i + 16, true)),
          newShares: out.getUint32(i + 24, true),
          oldShares: out.getUint32(i + 28, true),
        };
        if (revised) {
          const id = new Uint8Array(out.buffer, out.byteOffset + i + LEGACY_SPLIT_BYTES, SPLIT_ID_BYTES);
          row.actionId = decoder.decode(id).replace(/\0+$/, '');
          row.canceled = row.newShares === 0 && row.oldShares === 0;
        }
        records.push(row);
      }
      return records;
    },
    dividendLedger(instrument, csv, entitledShares) {
      if (!Number.isInteger(entitledShares) || entitledShares < 0 || entitledShares > 1_000_000) {
        throw new Error('Supply 0–1,000,000 whole entitled shares.');
      }
      textInput(instrument + '\n' + csv);
      const data = decoder.decode(output(api.mw_dividend_ledger(entitledShares)));
      return data.trimEnd().split('\n').map(line => {
        const [at, kind, id, announcedAt, exAt, payAt, observedAt, currency, perShare, ...changes] = line.split('\t');
        return {
          at: Number(at), kind: dividendKinds[Number(kind)], id,
          announcedAt: Number(announcedAt), exAt: Number(exAt), payAt: Number(payAt),
          observedAt: Number(observedAt), currency, amountPerShare: BigInt(perShare),
          movements: changes.map(change => {
            const [currency, receivableDelta, cashDelta, receivable, cash] = change.split(',');
            return { currency, receivableDelta: BigInt(receivableDelta), cashDelta: BigInt(cashDelta),
              receivable: BigInt(receivable), cash: BigInt(cash) };
          }),
        };
      });
    },
    adjustSplits(bars, splits, asOf) {
      if (bars.length > 100_000 || splits.length > 1_000) throw new Error('Split-adjustment input is too large.');
      const revised = splits.some(row => row.actionId !== undefined || row.canceled);
      const width = revised ? REVISED_SPLIT_BYTES : LEGACY_SPLIT_BYTES;
      const dest = input(8 + splits.length * width + bars.length * 48);
      const timestamp = (offset: number, value: number) => {
        if (!Number.isSafeInteger(value)) throw new Error('Split adjustment requires integer UTC seconds.');
        dest.setBigInt64(offset, BigInt(value), true);
      };
      timestamp(0, asOf);
      let offset = 8;
      for (const row of splits) {
        if (revised) {
          if (!row.actionId || !/^[A-Za-z0-9._-]{1,40}$/.test(row.actionId)) {
            throw new Error('Supply stable action IDs for all revision rows.');
          }
          const id = new Uint8Array(dest.buffer, dest.byteOffset + offset + LEGACY_SPLIT_BYTES, SPLIT_ID_BYTES);
          id.fill(0);
          id.set(encoder.encode(row.actionId));
        }
        timestamp(offset, row.announcedAt);
        timestamp(offset + 8, row.effectiveAt);
        timestamp(offset + 16, row.observedAt);
        if (row.canceled && (row.newShares !== 0 || row.oldShares !== 0)) {
          throw new Error('Canceled splits require blank share counts.');
        }
        for (const [index, value] of [row.newShares, row.oldShares].entries()) {
          if (!row.canceled && (!Number.isInteger(value) || value < 1 || value > 1_000_000)) {
            throw new Error('Share counts must be whole numbers between 1 and 1,000,000.');
          }
          dest.setUint32(offset + 24 + index * 4, value, true);
        }
        offset += width;
      }
      for (const bar of bars) {
        timestamp(offset, bar.time);
        const fields = [bar.open, bar.high, bar.low, bar.close, bar.volume];
        for (const [index, value] of fields.entries()) {
          const ticks = Math.round(value * SCALE);
          if (!Number.isSafeInteger(ticks) || Math.abs(value) > 2_000_000_000 ||
              value !== ticks / SCALE || (index === 4 && value < 0)) {
            throw new Error('Split adjustment requires valid six-place OHLCV values.');
          }
          dest.setBigInt64(offset + 8 + index * 8, BigInt(ticks), true);
        }
        offset += 48;
      }
      return decodeBars(output(revised ? api.mw_adjust_split_revisions(splits.length) : api.mw_adjust_splits(splits.length)));
    },
  };
}

let pending: Promise<MarketCore> | undefined;
export function loadMarketCore(): Promise<MarketCore> {
  pending ??= fetch(new URL('marketweft_core.wasm', document.baseURI))
    .then(async response => {
      if (!response.ok) throw new Error('Could not load the MarketWeft calculation engine.');
      return instantiateMarketCore(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
