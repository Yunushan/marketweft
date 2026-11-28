/** Chart-facing numbers represent six-place fixed-point prices and volume. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceMovement {
  sourceTime: number;
  sourceIndex: number;
  openTicks: bigint;
  closeTicks: bigint;
  sourceCloseTicks: bigint;
}

export type RenkoBrick = PriceMovement;

export interface BollingerBand {
  lower: bigint;
  middle: bigint;
  upper: bigint;
}

export type PriceBand = BollingerBand;

function readOptionalTriples<T>(
  out: DataView, make: (first: bigint, second: bigint, third: bigint) => T,
): (T | null)[] {
  return Array.from({ length: out.byteLength / 24 }, (_, index) => {
    const offset = index * 24;
    const first = out.getBigInt64(offset, true);
    return first === MISSING ? null : make(first, out.getBigInt64(offset + 8, true), out.getBigInt64(offset + 16, true));
  });
}

function readPriceBands(out: DataView): (PriceBand | null)[] {
  return readOptionalTriples(out, (lower, middle, upper) => ({ lower, middle, upper }));
}

export interface CumulativeVolume {
  onBalance: bigint;
  accumulationDistribution: bigint;
}

export interface AroonValue {
  up: bigint;
  down: bigint;
  oscillator: bigint;
}

export interface DirectionalMovement {
  plusDi: bigint | null;
  minusDi: bigint | null;
  adx: bigint | null;
}

export interface MacdValue {
  line: bigint | null;
  signal: bigint | null;
  histogram: bigint | null;
}

export interface StochasticValue {
  percentK: bigint | null;
  percentD: bigint | null;
}

export interface StochasticMomentumValue {
  line: bigint | null;
  signal: bigint | null;
}

export interface BollingerMeasures {
  percentB: bigint | null;
  bandwidth: bigint | null;
}

export interface KagiSegment {
  sourceTime: number;
  sourceIndex: number;
  column: number;
  fromTicks: bigint;
  toTicks: bigint;
  thickBefore: boolean;
  weightChangeTicks: bigint | null;
}

export interface PointFigureBox {
  sourceTime: number;
  sourceIndex: number;
  column: number;
  levelTicks: bigint;
  sourceCloseTicks: bigint;
  mark: 'X' | 'O';
}

export interface ScalarPluginPoint {
  time: number;
  close: bigint;
  value: bigint;
}

export interface FormulaResult {
  version: number;
  values: (bigint | null)[];
}

export interface FormulaFunction {
  name: string;
  parameters: readonly string[];
  body: string;
}

export interface RangeBar {
  bar: Bar;
  availableAt: number;
  firstSequence: bigint;
  lastSequence: bigint;
  observedTrades: number;
  complete: boolean;
  targetRangeTicks: bigint;
  observedRangeTicks: bigint;
}

export interface VolumeBar {
  bar: Bar;
  availableAt: number;
  firstSequence: bigint;
  lastSequence: bigint;
  contributingTrades: number;
  complete: boolean;
  volumeTicks: bigint;
  targetVolumeTicks: bigint;
  firstContributionTicks: bigint;
  lastContributionTicks: bigint;
}

export interface TimeframeBar {
  bar: Bar;
  observedBars: number;
  expectedBars: number;
}

export interface TickBar {
  bar: Bar;
  availableAt: number;
  firstSequence: bigint;
  lastSequence: bigint;
  observedTrades: number;
  targetTrades: number;
}
export interface TradeFlowVolume {
  buy: bigint;
  sell: bigint;
  unknown: bigint;
  trades: number;
}

export interface FootprintLevel {
  priceFrom: bigint;
  priceTo: bigint;
  volume: TradeFlowVolume;
}

export interface FootprintBar {
  startsAt: number;
  endsAt: number;
  lastObservedAt: number;
  firstSequence: bigint;
  lastSequence: bigint;
  volume: TradeFlowVolume;
  cumulativeDelta: bigint;
  levels: FootprintLevel[];
}

export interface FootprintQuery {
  bucketSeconds: number;
  priceWidth: string;
  from: string;
  through: string;
  known: string;
}

export interface PriceProfileArea {
  pointOfControlFrom: bigint;
  pointOfControlTo: bigint;
  valueFrom: bigint;
  valueTo: bigint;
  covered: bigint;
  total: bigint;
}

export interface PriceProfile {
  levels: Array<FootprintLevel & { opportunities: number }>;
  volume: PriceProfileArea | null;
  timeOpportunities: PriceProfileArea | null;
  observedBrackets: number;
  valueAreaBasisPoints: number;
}

export interface FootprintWindow {
  firstExecution: number;
  lastExecution: number;
  lastObserved: number;
}

export interface DepthStamp {
  sequence: bigint;
  eventAt: number;
  observedAt: number;
}

export interface DepthLevel {
  priceTicks: bigint;
  sizeTicks: bigint;
}

export type DepthStatus =
  | { kind: 'no-observation' | 'awaiting-snapshot' | 'synchronized' }
  | { kind: 'sequence-gap'; expected: bigint; received: bigint }
  | { kind: 'crossed'; sequence: bigint };

export interface RecordedDepth {
  status: DepthStatus;
  received: DepthStamp | null;
  snapshot: DepthStamp | null;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface DepthSweep {
  status: DepthStatus;
  received: DepthStamp | null;
  snapshot: DepthStamp | null;
  execution: {
    filledTicks: bigint;
    remainingTicks: bigint;
    notionalUnits: bigint;
    meanPriceTicks: bigint | null;
    fills: DepthLevel[];
  } | null;
}

export interface PaperDepthSnapshot {
  ledger: PaperSnapshot;
  depthStatus: DepthStatus;
  lastDepth: DepthStamp | null;
}

export interface TradeClassificationQuery {
  from: string;
  through: string;
  known: string;
  maxQuoteAgeSeconds: number;
}

export type TradeSideBasis = 'reported' | 'quote-midpoint' | 'at-midpoint' | 'no-depth' |
  'unsynchronized-depth' | 'incomplete-quote' | 'stale-quote' | 'locked-quote';

export interface TradeClassification {
  executedAt: number;
  observedAt: number;
  sequence: bigint;
  priceTicks: bigint;
  sizeTicks: bigint;
  side: 'buy' | 'sell' | 'unknown';
  basis: TradeSideBasis;
  quote: {
    status: DepthStatus;
    stamp: DepthStamp;
    bid: (DepthStamp & { priceTicks: bigint }) | null;
    ask: (DepthStamp & { priceTicks: bigint }) | null;
  } | null;
}

export interface SessionTimeframeBar extends TimeframeBar {
  closeTime: number;
  sessionOpen: number;
  earlyClose: boolean;
}

export interface DrawingEndpoint {
  time: number;
  ticks: number;
}

export interface MeasuredDrawing {
  start: DrawingEndpoint;
  end: DrawingEndpoint;
}

export interface DrawingMeasurement {
  elapsedSeconds: number;
  priceTicks: bigint;
  returnPctMicros: bigint | null;
}

const replayKinds = ['open', 'bar', 'missing', 'close'] as const;
const candlePatternKinds = ['doji', 'bullish-engulfing', 'bearish-engulfing', 'piercing', 'dark-cloud-cover'] as const;
export interface CandlePatternHit {
  kind: typeof candlePatternKinds[number];
  barIndex: number;
  observedAt: number;
}
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

const dividendKinds = ['report', 'ex', 'pay', 'entitlement'] as const;
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
  entitledShares?: number | null;
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

export interface ProviderOhlcv {
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
}

export interface ProviderHistorySnapshot {
  provider: string;
  instrument: string;
  bars: (ProviderOhlcv & { at: number; observedAt: number })[];
}

export interface ProviderBarObservation {
  observedAt: number;
  bar: ProviderOhlcv | null;
}

export interface ScreenPrice {
  ticks: bigint;
  observedAt: number;
}

export interface ListingRiskQuery {
  from: string;
  through: string;
  known: string;
  intervalSeconds: number;
  windowPeriods: number;
  volatilityPeriods: number;
}

export interface ScenarioAllocation {
  listingId: string;
  weightBasisPoints: number;
}

export interface JointScenarioQuery {
  from: string;
  through: string;
  known: string;
  intervalSeconds: number;
  startingValue: string;
  feeBasisPoints: number;
  seed: bigint;
  paths: number;
  horizon: number;
  blockSize?: number;
}

export interface JointScenarioPath {
  endingValue: bigint;
  drawdownMillionths: bigint;
  fees: bigint;
}

export interface JointScenarioReport {
  expectedVectors: number;
  eligibleVectors: number;
  blockSize: number;
  eligibleBlocks: number;
  lossPaths: number;
  coverage: Array<ScenarioAllocation & { knownReturns: number }>;
  endingValue: [bigint, bigint, bigint];
  drawdownMillionths: [bigint, bigint, bigint];
  fees: [bigint, bigint, bigint];
  paths: JointScenarioPath[];
}

export interface ListingRiskPoint {
  fromAt: number;
  throughAt: number;
  expectedReturns: number;
  leftReturns: number;
  rightReturns: number;
  pairedReturns: number;
  leftVolatility: number | null;
  rightVolatility: number | null;
  correlation: number | null;
}

export interface RelativeLegPoint {
  membership: UniverseListing['status'] | null;
  close: ScreenPrice | null;
  returnUnits: bigint | null;
}

export interface RelativePoint {
  effectiveAt: number;
  left: RelativeLegPoint;
  right: RelativeLegPoint;
  spreadUnits: bigint | null;
}

export interface ScreenRow {
  listingId: string;
  instrument: string;
  rank: number | null;
  returnUnits: bigint | null;
  baseline: ScreenPrice | null;
  current: ScreenPrice | null;
}

export type ScreenCutoff = { effective: string; known: string };
export type ScreenComparisonLeg = Pick<ScreenRow, 'rank' | 'returnUnits' | 'baseline' | 'current'> & {
  membership: { state: (typeof universeStatuses)[number]; changeId: string; effectiveAt: number; observedAt: number } | null;
};
export type ScreenComparisonRow = { listingId: string; instrument: string;
  before: ScreenComparisonLeg; after: ScreenComparisonLeg; rankMove: number | null };

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

export interface HeatmapComparison {
  before: Heatmap;
  after: Heatmap;
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

export type TrailingFourQuarters =
  | { kind: 'available'; currency: string; revenue: bigint | null; commonNetIncome: bigint | null;
      operatingCashFlow: bigint | null }
  | { kind: 'insufficient-quarters' | 'noncontiguous' | 'currency' };

export interface QuarterlyValuation {
  priceEarnings: Multiple | null;
  priceSales: Multiple | null;
  priceBook: Multiple;
}

export interface FinancialSnapshot extends Valuation {
  quarters: Filing[];
  trailing: TrailingFourQuarters;
  quarterlyValuation: QuarterlyValuation;
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
  'american-volatility-required', 'missing-contract', 'european-contract',
] as const;

export type OptionUnavailable = typeof unavailableOptions[number];

export interface AmericanImplied {
  volatility: number;
  price: number;
}

export interface OptionCashDividendReport {
  id: string;
  announcedAt: number;
  exAt: number;
  payAt: number;
  observedAt: number;
  currency: string;
  amountPerShare: bigint;
}

export interface AmericanCashPrice {
  price: number;
  dividends: OptionCashDividendReport[];
}

export interface AmericanCashImpliedPrice extends AmericanCashPrice {
  volatility: number;
}

export interface OptionReport {
  id: string;
  expiration: number;
  strike: bigint;
  side: 'call' | 'put';
  exerciseStyle: 'european' | 'american';
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

export interface CrossSectionConfig {
  paper: PaperConfig;
  decisionSeconds: string;
  lookbackSeconds: string;
  topListings: string;
  targetShares: string;
  limitBuffer: string;
  participation: string;
}

export interface CrossSectionActions {
  accountCurrency: string;
  dividends: string;
  delistings: string;
  successorShares?: string;
  capitalReturns?: string;
}

export interface CrossSectionWalkConfig {
  trainingDecisions: string;
  testDecisions: string;
  candidates: string;
}

export interface CrossSectionScore {
  lookbackSeconds: number;
  topListings: number;
  equity: bigint | null;
  cash: bigint;
  turnover: bigint;
  fees: bigint;
  acceptedFills: number;
  decisions: number;
  ranked: number;
  missing: number;
}

export interface CrossSectionFold {
  trainingFrom: number;
  trainingThrough: number;
  testFrom: number;
  testThrough: number;
  trainingScores: CrossSectionScore[];
  testScore: CrossSectionScore | null;
}

export interface CrossSectionDividendPosting {
  listingId: string;
  dividendId: string;
  postedAt: number;
  observedAt: number;
  exAt: number;
  payAt: number;
  shares: bigint;
  currency: string;
  cashDelta: bigint;
  receiptId: string | null;
}

export interface CrossSectionCapitalReturnPosting extends Omit<CrossSectionDividendPosting, 'dividendId'> {
  actionId: string;
}

export interface CrossSectionCapitalReturnClaim {
  listingId: string;
  actionId: string;
  observedAt: number;
  exAt: number;
  payAt: number;
  shares: bigint;
  currency: string;
  amount: bigint;
  state: string;
  positionReceiptId: string | null;
}

export interface CrossSectionDelistingClaim {
  listingId: string;
  changeId: string;
  effectiveAt: number;
  observedAt: number;
  termsObservedAt: number | null;
  payAt: number | null;
  shares: bigint;
  state: string;
  currency: string | null;
  amount: bigint | null;
}

export interface CrossSectionDelistingPosting {
  claim: CrossSectionDelistingClaim;
  postedAt: number;
  cashDelta: bigint;
  receiptId: string | null;
}

export interface CrossSectionSuccessorClaim {
  listingId: string;
  changeId: string;
  effectiveAt: number;
  observedAt: number;
  positionAt: number;
  entitledShares: bigint;
  successorListing: string;
  termsObservedAt: number;
  deliverAt: number | null;
  ratio: string;
  shares: string;
  state: string;
  markObservedAt: number | null;
  mark: bigint | null;
  value: bigint | null;
}

export interface CrossSectionReport {
  cash: bigint;
  reservedCash: bigint;
  fees: bigint;
  turnover: bigint;
  equity: bigint | null;
  decisions: { at: number; eligible: number; missing: number; selected: string[] }[];
  positions: { listingId: string; shares: bigint; cost: bigint; mark: bigint | null }[];
  receipts: (PaperReceipt & { listingId: string; side: string })[];
  dividendPostings: CrossSectionDividendPosting[];
  capitalReturnClaims: CrossSectionCapitalReturnClaim[];
  capitalReturnPostings: CrossSectionCapitalReturnPosting[];
  delistingClaims: CrossSectionDelistingClaim[];
  delistingPostings: CrossSectionDelistingPosting[];
  successorClaims: CrossSectionSuccessorClaim[];
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

export interface RecordedBacktestQuery {
  effective: string;
  known: string;
  config: BacktestConfig;
}

export interface FormulaBacktestQuery extends RecordedBacktestQuery {
  entry: string;
  exit: string;
  functions?: readonly FormulaFunction[];
}

export interface FormulaBacktestResult {
  version: number;
  backtest: BacktestResult;
  evaluations: {
    at: number;
    barIndex: number;
    entry: bigint | null;
    exit: bigint | null;
    decision: 'buy' | 'sell' | null;
  }[];
}

export interface FormulaWalkQuery extends RecordedBacktestQuery {
  trainingBars: number;
  testBars: number;
  candidates: { id: string; entry: string; exit: string; functions?: readonly FormulaFunction[] }[];
}

export interface FormulaWalkScore {
  id: string;
  equity: bigint;
  drawdown: bigint;
  turnover: bigint;
  fees: bigint;
  fills: number;
  unavailableConditions: number;
}

export interface FormulaWalkFold {
  trainingStart: number;
  trainingEnd: number;
  testStart: number;
  testEnd: number;
  scores: FormulaWalkScore[];
  testScore: FormulaWalkScore;
  report: FormulaBacktestResult;
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

export interface FxAmount {
  currency: string;
  subtotal: bigint;
}

export interface FxCurrencyValue extends FxAmount {
  converted: bigint | null;
  rate: {
    baseCurrency: string;
    quoteCurrency: string;
    rateAt: number;
    observedAt: number;
    rateTicks: bigint;
    inverted: boolean;
  } | null;
}

export interface FxTranslation {
  reportingCurrency: string;
  knownSubtotal: bigint | null;
  rows: FxCurrencyValue[];
}

export interface EquityConcentration {
  currency: string | null;
  grossMark: bigint | null;
  positions: { listing: string; mark: bigint | null; rank: number | null; weightMicros: bigint | null }[];
}

type ConcentrationSide = Omit<EquityConcentration['positions'][number], 'listing'>;
export type PortfolioCutoff = { effectiveAt: string; knownAt: string };
export interface EquityConcentrationChange {
  currency: string | null;
  listing: string;
  before: ConcentrationSide | null;
  after: ConcentrationSide | null;
  weightChangeMicros: bigint | null;
  rankImprovement: number | null;
}

export interface PortfolioSnapshot {
  effectiveAt: number;
  knownAt: number;
  unvaluedPositions: number;
  income?: {
    totals: { currency: string; receivable: bigint; cash: bigint }[];
    dividends: {
      listing: string; id: string; announcedAt: number; exAt: number; payAt: number;
      observedAt: number; currency: string; rate: bigint;
      state: 'unknown-position' | 'no-payment' | 'receivable' | 'paid';
      entitledShares: number | null; amount: bigint | null;
    }[];
  };
  totals: { currency: string; sharesValue: bigint; receivable: bigint; cash: bigint }[];
  equityConcentration: EquityConcentration[];
  holdings: {
    listing: string;
    instrument: string | null;
    shares: number;
    positionEffectiveAt: number;
    positionObservedAt: number;
    state: 'unobserved' | 'missing-close' | 'shares' | 'missing-proceeds' | 'receivable' | 'cash';
    currency: string | null;
    value: bigint | null;
    price: bigint | null;
    priceObservedAt: number | null;
    delisting: string | null;
    termsObservedAt: number | null;
  }[];
}

export interface PortfolioSpinOff {
  id: string;
  parent: string;
  child: string;
  announcedAt: number;
  entitlementAt: number;
  distributionAt: number;
  observedAt: number;
  rate: { numerator: number; denominator: number };
  state: 'unknown-position' | 'no-distribution' | 'receivable' | 'distributed';
  entitledParentShares: number | null;
  positionEffectiveAt: number | null;
  positionObservedAt: number | null;
  childShares: { numerator: bigint; denominator: number } | null;
}

export interface PortfolioSpinOffCash {
  id: string;
  child: string;
  fractionalShares: { numerator: bigint; denominator: number } | null;
  state: 'unknown-position' | 'missing-terms' | 'no-payment' | 'receivable' | 'paid';
  terms: { currency: string; payAt: number; observedAt: number; rate: bigint } | null;
  amount: bigint | null;
}

export interface PortfolioSuccessorShare {
  listing: string;
  delisting: string;
  delistedAt: number;
  delistingObservedAt: number;
  state: 'missing-terms' | 'unknown-position' | 'no-distribution' | 'receivable' | 'delivered';
  entitledShares: number | null;
  positionEffectiveAt: number | null;
  positionObservedAt: number | null;
  terms: {
    listing: string;
    observedAt: number;
    deliverAt: number | null;
    rate: { numerator: number; denominator: number };
  } | null;
  successorShares: { numerator: bigint; denominator: number } | null;
}

export interface PortfolioSuccessorDeliveryPosting {
  postedAt: number;
  listing: string;
  delisting: string;
  successor: string;
  delistedAt: number;
  delistingObservedAt: number;
  positionEffectiveAt: number;
  positionObservedAt: number;
  entitledShares: number;
  termsObservedAt: number;
  scheduledDeliveryAt: number;
  delta: { numerator: bigint; denominator: number };
  balance: { numerator: bigint; denominator: number };
}

export interface PortfolioCapitalReturn {
  listingId: string;
  actionId: string;
  announcedAt: number;
  exAt: number;
  payAt: number;
  observedAt: number;
  currency: string;
  amountPerShare: bigint;
  state: 'unknown-position' | 'no-payment' | 'receivable' | 'paid';
  entitledShares: number | null;
  amount: bigint | null;
  basis: { observedAt: number; before: bigint; reduction: bigint; remaining: bigint; excess: bigint } | null;
}

export interface CapitalReturnCutoff {
  effectiveAt: string;
  knownAt: string;
}

export interface CapitalReturnAmounts {
  receivable: bigint | null;
  cash: bigint | null;
  basisReduction: bigint | null;
  aboveBasis: bigint | null;
}

export interface CapitalReturnComparison {
  listingId: string;
  actionId: string;
  currency: string;
  baseline: CapitalReturnObservation | null;
  comparison: CapitalReturnObservation | null;
  baselineAmounts: CapitalReturnAmounts;
  comparisonAmounts: CapitalReturnAmounts;
  change: CapitalReturnAmounts;
}

export interface CapitalReturnObservation {
  state: PortfolioCapitalReturn['state'];
  currency: string;
  observedAt: number;
  basisObservedAt: number | null;
}

export interface RightsSettlementPosting {
  offeringId: string;
  exerciseId: string;
  effectiveAt: number;
  observedAt: number;
  stage: PortfolioRightsExercise['stage'];
  asset: { kind: 'shares' } | { kind: 'cash'; currency: string };
  delta: bigint;
  balance: bigint;
}

export interface PortfolioRightsExercise {
  offeringId: string;
  exerciseId: string;
  effectiveAt: number;
  observedAt: number;
  requestedAt: number;
  stage: 'requested' | 'allocated' | 'settled' | 'cancelled';
  requestedShares: bigint;
  assessment: 'unavailable' | 'outside-window' | 'within-capacity' | 'above-capacity';
  basicCapacity: bigint | null;
  allocation: { shares: bigint; currency: string; unitPrice: bigint } | null;
  settlement: { shares: bigint; cashPaid: bigint; cashVariance: bigint } | null;
}

export interface PortfolioRightsOffering {
  offeringId: string;
  listingId: string;
  observedAt: number;
  phase: 'announced' | 'awaiting-open' | 'open' | 'expired' | 'cancelled';
  terms: {
    subscriptionListing: string; announcedAt: number; entitlementAt: number; opensAt: number; expiresAt: number;
    numerator: number; denominator: number; currency: string; subscriptionPrice: bigint;
    fractionPolicy: 'down' | 'nearest' | 'up';
  } | null;
  entitlement: {
    holdingEffectiveAt: number; holdingObservedAt: number; heldShares: number;
    exactShares: { numerator: bigint; denominator: number }; subscribableShares: bigint; fullSubscriptionCost: bigint;
  } | null;
}

export interface PaperSuccessorDeliveryPosting extends PortfolioSuccessorDeliveryPosting {
  positionReceiptId: string;
}

export interface PortfolioSpinOffBasis {
  id: string;
  parent: string;
  child: string;
  distributionAt: number;
  state: 'unknown-position' | 'missing-terms' | 'no-distribution' | 'awaiting-distribution' | 'allocated';
  terms: { currency: string; observedAt: number; originalParentBasis: bigint; childBasisFraction: bigint } | null;
  allocation: { retainedParentBasis: bigint; childBasis: bigint } | null;
}

export type DrawdownPoint = { peakAt: number; peakClose: bigint; percent: bigint };
const MONTH_WINDOWS = ['complete', 'month-to-date', 'future'] as const;
export type MonthlyClose = { at: number; ticks: bigint };
export interface MonthlyReturn {
  year: number;
  month: number;
  window: typeof MONTH_WINDOWS[number];
  prior: MonthlyClose | null;
  current: MonthlyClose | null;
  percent: bigint | null;
}
export interface CloseDistribution {
  firstAt: number;
  lastAt: number;
  minimum: bigint;
  lowerQuartile: bigint;
  median: bigint;
  upperQuartile: bigint;
  maximum: bigint;
}

export type ConfirmedSwing = { pivotAt: number; confirmedAt: number; close: bigint; side: 'high' | 'low' };

export type AnchoredVwapPoint = { price: bigint; cumulativeVolume: bigint };
export type AnchoredTwapPoint = { price: bigint; elapsedSeconds: number };

export type RiskRewardSide = 'long' | 'short';
export type GannFanLevel = { priceUnits: number; timeUnits: number; ticks: bigint };
export type FibonacciChannelLevel = { ratioThousandths: number; offsetTicks: bigint };
export type FibonacciCircleLevel = { ratioThousandths: number; elapsedSeconds: number; ticks: bigint };
export type VortexValue = { positive: bigint; negative: bigint };
export type ElderRayValue = { bull: bigint; bear: bigint };
export type RelativeVigorValue = { vigor: bigint | null; signal: bigint | null };
export type OpeningGap = { priorAt: number; priorClose: bigint; difference: bigint };
export type FloorPivotLevels = { priorCloseAt: number; pivot: bigint; supportOne: bigint; supportTwo: bigint;
  resistanceOne: bigint; resistanceTwo: bigint };
export type RiskRewardMeasurement = { riskTicks: bigint; rewardTicks: bigint; rewardPerRiskMicros: bigint };

export type RegressionChannel = { observations: number; startTicks: bigint; endTicks: bigint; residualTicks: bigint };
export type CloseRegressionValues = { slope: bigint | null; forecast: bigint | null };

export interface MarketCore {
  evaluateFormula(source: string, bars: readonly Bar[], functions?: readonly FormulaFunction[]): FormulaResult;
  evaluateScalarPlugin(module: Uint8Array, ticks: bigint): bigint;
  evaluateScalarPluginSeries(module: Uint8Array, bars: readonly Bar[], from: number, through: number): ScalarPluginPoint[];
  instrument(venue: string, symbol: string): string;
  parseCsv(csv: string): Bar[];
  heikinAshi(bars: readonly Bar[]): Bar[];
  renko(bars: readonly Bar[], brickTicks: bigint): RenkoBrick[];
  threeLineBreak(bars: readonly Bar[]): PriceMovement[];
  kagi(bars: readonly Bar[], reversalTicks: bigint): KagiSegment[];
  pointAndFigure(bars: readonly Bar[], boxTicks: bigint): PointFigureBox[];
  recordedTickBars(instrument: string, csv: string, targetTrades: number, knownAt?: string): TickBar[];
  recordedRangeBars(instrument: string, csv: string, targetRangeTicks: bigint, knownAt?: string): RangeBar[];
  recordedVolumeBars(instrument: string, csv: string, targetVolumeTicks: bigint, knownAt?: string): VolumeBar[];
  footprintWindow(instrument: string, csv: string): FootprintWindow;
  recordedFootprint(instrument: string, csv: string, query: FootprintQuery): FootprintBar[];
  recordedPriceProfile(instrument: string, csv: string, query: FootprintQuery, valueAreaBasisPoints: number): PriceProfile;
  depthCheckpoints(instrument: string, csv: string): number[];
  recordedDepth(instrument: string, csv: string, knownAt: string): RecordedDepth;
  recordedDepthSweep(instrument: string, csv: string, knownAt: string, side: 'buy' | 'sell',
    size: string, limit?: string): DepthSweep;
  classifyRecordedTrades(instrument: string, trades: string, depth: string,
    query: TradeClassificationQuery): TradeClassification[];
  aggregateTimeframe(bars: readonly Bar[], sourceSeconds: number, targetSeconds: number): TimeframeBar[];
  aggregateSessionTimeframe(calendar: string, bars: readonly Bar[], sourceSeconds: number,
    targetSeconds: number): SessionTimeframeBar[];
  measureDrawing(drawing: MeasuredDrawing): DrawingMeasurement;
  gannFanLevels(drawing: MeasuredDrawing): GannFanLevel[];
  gannBoxLevels(drawing: MeasuredDrawing & { divisions: number }): DrawingEndpoint[];
  fibonacciChannelLevels(points: readonly [DrawingEndpoint, DrawingEndpoint, DrawingEndpoint]): FibonacciChannelLevel[];
  fibonacciCircleLevels(drawing: MeasuredDrawing): FibonacciCircleLevel[];
  measureRiskReward(side: RiskRewardSide, entry: number, stop: number, target: number): RiskRewardMeasurement;
  indicator(kind: 'sma' | 'ema' | 'rsi' | 'atr', period: number, bars: readonly Bar[]): (number | null)[];
  bollingerBands(period: number, bars: readonly Bar[]): (BollingerBand | null)[];
  donchianChannels(period: number, bars: readonly Bar[]): (PriceBand | null)[];
  keltnerChannels(emaPeriod: number, atrPeriod: number, bars: readonly Bar[]): (PriceBand | null)[];
  cumulativeVolume(bars: readonly Bar[]): CumulativeVolume[];
  priceVolumeTrend(bars: readonly Bar[]): (bigint | null)[];
  volumeRateOfChange(period: number, bars: readonly Bar[]): (bigint | null)[];
  volumeOscillator(fast: number, slow: number, bars: readonly Bar[]): (bigint | null)[];
  aroon(period: number, bars: readonly Bar[]): (AroonValue | null)[];
  commodityChannelIndex(period: number, bars: readonly Bar[]): (bigint | null)[];
  closeChanges(intervalSeconds: number, bars: readonly Bar[]): (bigint | null)[];
  openingGaps(bars: readonly Bar[]): (OpeningGap | null)[];
  rebasedPercentChanges(anchorAt: number, bars: readonly Bar[]): (bigint | null)[];
  anchoredVwap(anchorAt: number, bars: readonly Bar[]): (AnchoredVwapPoint | null)[];
  anchoredTwap(anchorAt: number, bars: readonly Bar[]): (AnchoredTwapPoint | null)[];
  regressionChannel(startAt: number, endAt: number, bars: readonly Bar[]): RegressionChannel | null;
  rollingCloseRegression(period: number, bars: readonly Bar[]): CloseRegressionValues[];
  observedDrawdown(bars: readonly Bar[]): (DrawdownPoint | null)[];
  observedCloseDistributions(bars: readonly Bar[], size: number): CloseDistribution[];
  monthlyReturns(bars: readonly Bar[], firstYear: number, lastYear: number, knownThrough: number): MonthlyReturn[];
  confirmedCloseSwings(left: number, right: number, intervalSeconds: number, bars: readonly Bar[]): (ConfirmedSwing | null)[];
  rateOfChange(period: number, bars: readonly Bar[]): (bigint | null)[];
  coppockCurve(smoothing: number, first: number, second: number, bars: readonly Bar[]): (bigint | null)[];
  verticalHorizontalFilter(period: number, bars: readonly Bar[]): (bigint | null)[];
  psychologicalLine(period: number, bars: readonly Bar[]): (bigint | null)[];
  chandeMomentumOscillator(period: number, bars: readonly Bar[]): (bigint | null)[];
  trix(period: number, bars: readonly Bar[]): (bigint | null)[];
  vortexIndicator(period: number, bars: readonly Bar[]): (VortexValue | null)[];
  balanceOfPower(bars: readonly Bar[]): (bigint | null)[];
  elderForceIndex(period: number, bars: readonly Bar[]): (bigint | null)[];
  elderRayIndex(period: number, bars: readonly Bar[]): (ElderRayValue | null)[];
  demarker(period: number, bars: readonly Bar[]): (bigint | null)[];
  relativeVigor(period: number, bars: readonly Bar[]): RelativeVigorValue[];
  chaikinVolatility(smoothing: number, comparison: number, bars: readonly Bar[]): (bigint | null)[];
  dailyFloorPivots(bars: readonly Bar[], queryTimes: readonly number[]): (FloorPivotLevels | null)[];
  linearlyWeightedAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  kaufmanAdaptiveMovingAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  kaufmanEfficiencyRatio(period: number, bars: readonly Bar[]): (bigint | null)[];
  doubleExponentialMovingAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  tripleExponentialMovingAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  hullMovingAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  directionalMovement(diPeriod: number, adxPeriod: number, bars: readonly Bar[]): DirectionalMovement[];
  adxRating(diPeriod: number, adxPeriod: number, bars: readonly Bar[]): (bigint | null)[];
  moneyFlowIndex(period: number, bars: readonly Bar[]): (bigint | null)[];
  volumeWeightedAverage(period: number, bars: readonly Bar[]): (bigint | null)[];
  chaikinMoneyFlow(period: number, bars: readonly Bar[]): (bigint | null)[];
  chaikinOscillator(fast: number, slow: number, bars: readonly Bar[]): (bigint | null)[];
  macd(fast: number, slow: number, signal: number, bars: readonly Bar[]): MacdValue[];
  percentagePriceOscillator(fast: number, slow: number, signal: number, bars: readonly Bar[]): MacdValue[];
  normalizedAverageTrueRange(period: number, bars: readonly Bar[]): (bigint | null)[];
  williamsPercentR(period: number, bars: readonly Bar[]): (bigint | null)[];
  stochasticOscillator(lookback: number, smoothing: number, signal: number, bars: readonly Bar[]): StochasticValue[];
  stochasticRsi(rsi: number, lookback: number, smoothing: number, signal: number, bars: readonly Bar[]): StochasticValue[];
  ultimateOscillator(short: number, medium: number, long: number, bars: readonly Bar[]): (bigint | null)[];
  choppinessIndex(period: number, bars: readonly Bar[]): (bigint | null)[];
  detrendedPriceOscillator(period: number, bars: readonly Bar[]): (bigint | null)[];
  massIndex(smoothing: number, sum: number, bars: readonly Bar[]): (bigint | null)[];
  stochasticMomentumIndex(lookback: number, first: number, second: number, signal: number, bars: readonly Bar[]): StochasticMomentumValue[];
  bollingerMeasures(period: number, bars: readonly Bar[]): BollingerMeasures[];
  replay(calendar: string, intervalSeconds: number, bars: readonly Bar[]): ReplayEvent[];
  replayCandlePatterns(calendar: string, intervalSeconds: number, bars: readonly Bar[], knownAt: number): CandlePatternHit[];
  splitBook(instrument: string, csv: string): Split[];
  adjustSplits(bars: readonly Bar[], splits: readonly Split[], asOf: number): Bar[];
  dividendLedger(instrument: string, csv: string, entitledShares: number): DividendEvent[];
  dividendPositionLedger(instrument: string, dividends: string, positions: string): DividendEvent[];
  universeIndex(csv: string): { name: string; checkpoints: number[] };
  universeAsOf(csv: string, effectiveAt: string, knownAt: string): UniverseListing[];
  providerHistoryAsOf(csv: string, effectiveAt: string, knownAt: string): ProviderHistorySnapshot;
  providerBarObservations(csv: string, barAt: string, effectiveAt: string, knownAt: string): ProviderBarObservation[];
  delistingAsOf(membership: string, terms: string, listing: string, shares: number,
    effectiveAt: string, knownAt: string): DelistingValuation;
  portfolioAsOf(membership: string, holdings: string, prices: string, terms: string,
    effectiveAt: string, knownAt: string, dividends?: string): PortfolioSnapshot;
  portfolioFxAsOf(rates: string, reporting: string, effectiveAt: string, knownAt: string,
    subtotals: readonly FxAmount[]): FxTranslation;
  portfolioSuccessorSharesAsOf(membership: string, holdings: string, terms: string, effectiveAt: string, knownAt: string): PortfolioSuccessorShare[];
  portfolioRightsAsOf(membership: string, holdings: string, reports: string, effectiveAt: string, knownAt: string): PortfolioRightsOffering[];
  portfolioRightsExercisesAsOf(membership: string, holdings: string, rights: string, exercises: string, effectiveAt: string, knownAt: string): PortfolioRightsExercise[];
  portfolioRightsSettlementJournal(membership: string, rights: string, exercises: string, effectiveAt: string, knownAt: string): RightsSettlementPosting[];
  portfolioCapitalReturnsAsOf(membership: string, holdings: string, returns: string, basis: string, effectiveAt: string, knownAt: string): PortfolioCapitalReturn[];
  compareEquityConcentration(membership: string, holdings: string, prices: string, terms: string,
    before: PortfolioCutoff, after: PortfolioCutoff): EquityConcentrationChange[];
  comparePortfolioCapitalReturns(membership: string, holdings: string, returns: string, basis: string, baseline: CapitalReturnCutoff, comparison: CapitalReturnCutoff): CapitalReturnComparison[];
  portfolioSuccessorDeliveryLedger(membership: string, holdings: string, terms: string,
    effectiveAt: string, knownAt: string): PortfolioSuccessorDeliveryPosting[];
  portfolioSpinOffsAsOf(membership: string, holdings: string, reports: string,
    effectiveAt: string, knownAt: string): PortfolioSpinOff[];
  portfolioSpinOffCashAsOf(membership: string, holdings: string, reports: string, cashTerms: string,
    effectiveAt: string, knownAt: string): PortfolioSpinOffCash[];
  portfolioSpinOffBasisAsOf(membership: string, holdings: string, reports: string, basisTerms: string,
    effectiveAt: string, knownAt: string): PortfolioSpinOffBasis[];
  compareUniverseRanks(membership: string, prices: string, baselineAt: string,
    before: ScreenCutoff, after: ScreenCutoff): ScreenComparisonRow[];
  universeScreen(membership: string, prices: string, baselineAt: string,
    effectiveAt: string, knownAt: string): ScreenRow[];
  relativeSeries(membership: string, prices: string, leftId: string, rightId: string,
    baselineAt: string, effectiveAt: string, knownAt: string): RelativePoint[];
  listingRisk(membership: string, prices: string, leftId: string, rightId: string, query: ListingRiskQuery): ListingRiskPoint[];
  crossSectionReplay(membership: string, prices: string, liquidity: string, from: string,
    through: string, known: string, config: CrossSectionConfig, actions?: CrossSectionActions): CrossSectionReport;
  crossSectionSuccessorDeliveryJournal(membership: string, prices: string, liquidity: string, from: string,
    through: string, known: string, config: CrossSectionConfig, actions: CrossSectionActions): PaperSuccessorDeliveryPosting[];
  crossSectionWalk(membership: string, prices: string, liquidity: string, from: string,
    through: string, known: string, config: CrossSectionConfig, walk: CrossSectionWalkConfig,
    actions?: CrossSectionActions): CrossSectionFold[];
  portfolioScenarios(membership: string, prices: string, allocations: ScenarioAllocation[],
    query: JointScenarioQuery): JointScenarioReport;
  sectorHeatmap(membership: string, prices: string, sectors: string, baselineAt: string,
    effectiveAt: string, knownAt: string): Heatmap;
  compareSectorHeatmaps(membership: string, prices: string, sectors: string, baselineAt: string,
    before: ScreenCutoff, after: ScreenCutoff): HeatmapComparison;
  financialIndex(filings: string, caps: string): FinancialIssuer[];
  financialAsOf(filings: string, caps: string, issuer: string, at: string, known: string): Valuation;
  financialSnapshot(filings: string, caps: string, issuer: string, at: string, known: string): FinancialSnapshot;
  macroIndex(csv: string): number;
  macroAsOf(csv: string, published: string, known: string): MacroRelease[];
  optionIndex(underlying: string, quotes: string): OptionSource;
  optionSnapshot(underlying: string, quotes: string, effective: string, known: string, maxAge: number): OptionSnapshot;
  americanOptionPrice(underlying: string, quotes: string, contract: string, effective: string, known: string,
    maxAge: number, volatility: number, steps: number): number | OptionUnavailable;
  americanOptionImplied(underlying: string, quotes: string, contract: string, effective: string, known: string,
    maxAge: number, steps: number): AmericanImplied | OptionUnavailable;
  americanOptionCashPrice(underlying: string, quotes: string, cash: string, contract: string,
    effective: string, known: string, maxAge: number, volatility: number, steps: number): AmericanCashPrice | OptionUnavailable;
  americanOptionCashImplied(underlying: string, quotes: string, cash: string, contract: string,
    effective: string, known: string, maxAge: number, steps: number): AmericanCashImpliedPrice | OptionUnavailable;
  alertIndex(rules: string, observations: string): number;
  alertReplay(rules: string, observations: string, effective: string, known: string): AlertCrossing[];
  paperIndex(csv: string): number[];
  paperReplay(csv: string, cutoff: string, config: PaperConfig): PaperSnapshot;
  paperDepthIndex(instrument: string, controls: string, depth: string): number[];
  paperDepthReplay(instrument: string, controls: string, depth: string, cutoff: string,
    config: PaperConfig): PaperDepthSnapshot;
  backtestIndex(calendar: string, bars: string, interval: number): number[];
  backtest(instrument: string, calendar: string, bars: string, interval: number,
    cutoff: string, config: BacktestConfig): BacktestResult;
  recordedBacktest(instrument: string, calendar: string, bars: string, trades: string,
    interval: number, query: RecordedBacktestQuery): BacktestResult;
  formulaBacktest(instrument: string, calendar: string, bars: string, trades: string,
    interval: number, query: FormulaBacktestQuery): FormulaBacktestResult;
  formulaWalk(instrument: string, calendar: string, bars: string, trades: string,
    interval: number, query: FormulaWalkQuery): FormulaWalkFold[];
  validateFormulaStrategy(languageVersion: number, entry: string, exit: string, config: BacktestConfig,
    functions?: readonly FormulaFunction[]): void;
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
  mw_heikin_ashi(): number;
  mw_renko(brickTicks: bigint): number;
  mw_three_line_break(): number;
  mw_kagi(reversalTicks: bigint): number;
  mw_point_and_figure(boxTicks: bigint): number;
  mw_tick_bars(targetTrades: number): number;
  mw_range_bars(targetRangeTicks: bigint): number;
  mw_volume_bars(targetVolumeTicks: bigint): number;
  mw_footprint_window(): number;
  mw_trade_footprint(bucketSeconds: number): number;
  mw_price_profile(bucketSeconds: number, valueAreaBasisPoints: number): number;
  mw_depth_checkpoints(): number;
  mw_recorded_depth(): number;
  mw_recorded_depth_sweep(): number;
  mw_trade_classification_input(bytes: number): number;
  mw_classify_recorded_trades(tradeBytes: number, maxAge: number): number;
  mw_aggregate_timeframe(sourceSeconds: number, targetSeconds: number): number;
  mw_aggregate_session_timeframe(calendarBytes: number, sourceSeconds: number, targetSeconds: number): number;
  mw_measure_drawing(startTime: bigint, startTicks: bigint, endTime: bigint, endTicks: bigint): number;
  mw_gann_fan_levels(startTime: bigint, startTicks: bigint, endTime: bigint, endTicks: bigint): number;
  mw_gann_box_levels(startTime: bigint, startTicks: bigint, endTime: bigint, endTicks: bigint, divisions: number): number;
  mw_fibonacci_channel_levels(startTime: bigint, startTicks: bigint, endTime: bigint, endTicks: bigint, widthTime: bigint, widthTicks: bigint): number;
  mw_fibonacci_circle_levels(centreTime: bigint, centreTicks: bigint, radiusTime: bigint, radiusTicks: bigint): number;
  mw_vortex_indicator(period: number): number;
  mw_balance_of_power(): number;
  mw_elder_force_index(period: number): number;
  mw_elder_ray_index(period: number): number;
  mw_demarker(period: number): number;
  mw_relative_vigor(period: number): number;
  mw_chaikin_volatility(smoothing: number, comparison: number): number;
  mw_daily_floor_pivots(sourceCount: number): number;
  mw_measure_risk_reward(side: number, entry: bigint, stop: bigint, target: bigint): number;
  mw_indicator(kind: number, period: number): number;
  mw_atr(period: number): number;
  mw_bollinger_bands(period: number): number;
  mw_donchian_channels(period: number): number;
  mw_keltner_channels(emaPeriod: number, atrPeriod: number): number;
  mw_cumulative_volume(): number;
  mw_price_volume_trend(): number;
  mw_volume_rate_of_change(period: number): number;
  mw_volume_oscillator(fast: number, slow: number): number;
  mw_aroon(period: number): number;
  mw_commodity_channel_index(period: number): number;
  mw_close_changes(intervalSeconds: number): number;
  mw_opening_gaps(): number;
  mw_rebased_percent_changes(anchorAt: bigint): number;
  mw_observed_drawdown(): number;
  mw_monthly_returns(firstYear: number, lastYear: number, knownThrough: bigint): number;
  mw_observed_close_distributions(size: number): number;
  mw_regression_channel(startAt: bigint, endAt: bigint): number;
  mw_rolling_close_regression(period: number): number;
  mw_anchored_vwap(anchorAt: bigint): number;
  mw_anchored_twap(anchorAt: bigint): number;
  mw_confirmed_close_swings(left: number, right: number, intervalSeconds: number): number;
  mw_rate_of_change(period: number): number;
  mw_coppock_curve(smoothing: number, first: number, second: number): number;
  mw_vertical_horizontal_filter(period: number): number;
  mw_psychological_line(period: number): number;
  mw_chande_momentum_oscillator(period: number): number;
  mw_trix(period: number): number;
  mw_linearly_weighted_average(period: number): number;
  mw_kaufman_adaptive_moving_average(period: number): number;
  mw_kaufman_efficiency_ratio(period: number): number;
  mw_double_exponential_moving_average(period: number): number;
  mw_triple_exponential_moving_average(period: number): number;
  mw_hull_moving_average(period: number): number;
  mw_directional_movement(diPeriod: number, adxPeriod: number): number;
  mw_adx_rating(diPeriod: number, adxPeriod: number): number;
  mw_money_flow_index(period: number): number;
  mw_volume_weighted_average(period: number): number;
  mw_chaikin_money_flow(period: number): number;
  mw_chaikin_oscillator(fast: number, slow: number): number;
  mw_macd(fast: number, slow: number, signal: number): number;
  mw_percentage_price_oscillator(fast: number, slow: number, signal: number): number;
  mw_normalized_average_true_range(period: number): number;
  mw_williams_percent_r(period: number): number;
  mw_stochastic_oscillator(lookback: number, smoothing: number, signal: number): number;
  mw_stochastic_rsi(rsi: number, lookback: number, smoothing: number, signal: number): number;
  mw_ultimate_oscillator(short: number, medium: number, long: number): number;
  mw_choppiness_index(period: number): number;
  mw_detrended_price_oscillator(period: number): number;
  mw_mass_index(smoothing: number, sum: number): number;
  mw_stochastic_momentum_index(lookback: number, first: number, second: number, signal: number): number;
  mw_bollinger_measures(period: number): number;
  mw_formula_version(): number;
  mw_evaluate_scalar_plugin(ticks: bigint): number;
  mw_evaluate_scalar_plugin_series(moduleBytes: number, from: bigint, through: bigint): number;
  mw_evaluate_formula(sourceBytes: number): number;
  mw_evaluate_formula_library(sourceBytes: number, libraryBytes: number): number;
  mw_replay(calendarBytes: number, intervalSeconds: number): number;
  mw_replay_candle_patterns(calendarBytes: number, intervalSeconds: number): number;
  mw_split_book(): number;
  mw_split_revision_book(): number;
  mw_adjust_splits(records: number): number;
  mw_adjust_split_revisions(records: number): number;
  mw_dividend_ledger(shares: number): number;
  mw_dividend_position_ledger(dividendBytes: number): number;
  mw_universe_index(): number;
  mw_universe_as_of(): number;
  mw_provider_history_as_of(): number;
  mw_provider_bar_observations(barAt: bigint): number;
  mw_delisting_as_of(membershipBytes: number, shares: number): number;
  mw_portfolio_as_of(membershipBytes: number, holdingsBytes: number, priceBytes: number): number;
  mw_portfolio_income_as_of(membershipBytes: number, holdingsBytes: number, priceBytes: number, termsBytes: number): number;
  mw_portfolio_successor_shares_as_of(membershipBytes: number, holdingsBytes: number): number;
  mw_portfolio_rights_as_of(membershipBytes: number, holdingsBytes: number): number;
  mw_portfolio_rights_exercises_as_of(membershipBytes: number, holdingsBytes: number, rightsBytes: number): number;
  mw_portfolio_rights_settlement_journal(membershipBytes: number, rightsBytes: number): number;
  mw_portfolio_capital_returns_as_of(membershipBytes: number, holdingBytes: number, returnsBytes: number): number;
  mw_compare_equity_concentration(membershipBytes: number, holdingBytes: number, priceBytes: number): number;
  mw_compare_portfolio_capital_returns(membershipBytes: number, holdingBytes: number, returnsBytes: number): number;
  mw_portfolio_successor_delivery_ledger(membershipBytes: number, holdingsBytes: number): number;
  mw_portfolio_spin_offs_as_of(membershipBytes: number, holdingsBytes: number): number;
  mw_portfolio_spin_off_cash_as_of(membershipBytes: number, holdingsBytes: number, actionBytes: number): number;
  mw_portfolio_spin_off_basis_as_of(membershipBytes: number, holdingsBytes: number, actionBytes: number): number;
  mw_universe_screen(membershipBytes: number): number;
  mw_compare_universe_ranks(membershipBytes: number): number;
  mw_relative_series(membershipBytes: number): number;
  mw_listing_risk(membershipBytes: number, intervalSeconds: number, windowPeriods: number, volatilityPeriods: number): number;
  mw_portfolio_scenarios(membershipBytes: number): number;
  mw_portfolio_fx_as_of(): number;
  mw_sector_heatmap(membershipBytes: number, priceBytes: number): number;
  mw_compare_sector_heatmaps(membershipBytes: number, priceBytes: number): number;
  mw_financial_index(filingBytes: number): number;
  mw_financial_as_of(filingBytes: number): number;
  mw_financial_snapshot(filingBytes: number): number;
  mw_macro_index(): number;
  mw_macro_as_of(): number;
  mw_option_index(underlyingBytes: number): number;
  mw_option_snapshot(underlyingBytes: number, maxAge: number): number;
  mw_american_option_price(underlyingBytes: number, maxAge: number, volatility: number, steps: number): number;
  mw_american_option_implied(underlyingBytes: number, maxAge: number, steps: number): number;
  mw_american_option_cash_price(underlyingBytes: number, quoteBytes: number, maxAge: number,
    volatility: number, steps: number): number;
  mw_american_option_cash_implied(underlyingBytes: number, quoteBytes: number, maxAge: number,
    steps: number): number;
  mw_alert_index(ruleBytes: number): number;
  mw_alert_replay(ruleBytes: number): number;
  mw_paper_index(): number;
  mw_paper_replay(): number;
  mw_paper_depth_input(bytes: number): number;
  mw_paper_depth_index(controlsBytes: number): number;
  mw_paper_depth_replay(controlsBytes: number): number;
  mw_cross_section_replay(membershipBytes: number, priceBytes: number): number;
  mw_cross_section_actions(membershipBytes: number, priceBytes: number, liquidityBytes: number, dividendBytes: number): number;
  mw_cross_section_walk(membershipBytes: number, priceBytes: number, liquidityBytes: number, dividendBytes: number): number;
  mw_cross_section_with_successors(membershipBytes: number, priceBytes: number, liquidityBytes: number,
    dividendBytes: number, delistingBytes: number, walk: number): number;
  mw_cross_section_with_distributions(membershipBytes: number, priceBytes: number, liquidityBytes: number,
    dividendBytes: number, delistingBytes: number, successorBytes: number, mode: number): number;
  mw_cross_section_successor_delivery_journal(membershipBytes: number, priceBytes: number, liquidityBytes: number,
    dividendBytes: number, delistingBytes: number): number;
  mw_backtest_index(calendarBytes: number, interval: number): number;
  mw_backtest(calendarBytes: number, interval: number): number;
  mw_recorded_backtest(calendarBytes: number, barBytes: number, interval: number): number;
  mw_recorded_backtest_input(bytes: number): number;
  mw_formula_backtest(calendarBytes: number, barBytes: number, entryBytes: number, exitBytes: number, interval: number): number;
  mw_formula_backtest_library(calendarBytes: number, barBytes: number, entryBytes: number, exitBytes: number,
    libraryBytes: number, interval: number): number;
  mw_formula_walk(calendarBytes: number, barBytes: number, candidateBytes: number, interval: number): number;
  mw_validate_formula_strategy(languageVersion: number, entryBytes: number): number;
  mw_validate_formula_strategy_library(languageVersion: number, entryBytes: number, libraryBytes: number): number;
  mw_walk_forward(calendarBytes: number, interval: number): number;
  mw_run_scenarios(calendarBytes: number, interval: number): number;
}

const SCALE = 1_000_000;
const MISSING = -(1n << 63n);
const WIDE_MISSING = -(1n << 127n);

function validateIndicatorHistory(period: number, length: number): void {
  if (!validIndicatorPeriod(period) || length > MAX_INDICATOR_PERIOD)
    throw new Error('Series and indicator period must fit within 100,000 bars.');
}

function readWideIndicator(out: DataView, length: number): (bigint | null)[] {
  return Array.from({ length }, (_, index) => {
    const ticks = signed128(out, index * 16);
    return ticks === WIDE_MISSING ? null : ticks;
  });
}

function signed128(out: DataView, offset: number): bigint {
  return (out.getBigInt64(offset + 8, true) << 64n) | out.getBigUint64(offset, true);
}
const LIMIT = 8 * 1024 * 1024;
const LEGACY_SPLIT_BYTES = 32;
const SPLIT_ID_BYTES = 40;
const REVISED_SPLIT_BYTES = LEGACY_SPLIT_BYTES + SPLIT_ID_BYTES;
export const DEFAULT_INDICATOR_PERIODS = { sma: 20, ema: 9 } as const;
export const MAX_INDICATOR_PERIOD = 100_000;
export const MAX_SCALAR_PLUGIN_SERIES_BARS = 256;

export function validIndicatorPeriod(period: unknown): period is number {
  return typeof period === 'number' && Number.isInteger(period) &&
    period >= 1 && period <= MAX_INDICATOR_PERIOD;
}

export function validRsiPeriod(period: unknown): period is number {
  return validIndicatorPeriod(period) && period >= 2;
}

function decodeDividendEvents(text: string, withPositions = false): DividendEvent[] {
  return text.slice(0, -1).split('\n').map(line => {
    const [at, kind, id, announcedAt, exAt, payAt, observedAt, currency, perShare, ...fields] = line.split('\t');
    const event: DividendEvent = {
      at: Number(at), kind: dividendKinds[Number(kind)], id,
      announcedAt: Number(announcedAt), exAt: Number(exAt), payAt: Number(payAt),
      observedAt: Number(observedAt), currency, amountPerShare: BigInt(perShare),
      movements: (withPositions ? fields.slice(1) : fields).map(change => {
        const [currency, receivableDelta, cashDelta, receivable, cash] = change.split(',');
        return { currency, receivableDelta: BigInt(receivableDelta), cashDelta: BigInt(cashDelta),
          receivable: BigInt(receivable), cash: BigInt(cash) };
      }),
    };
    if (withPositions) event.entitledShares = fields[0] === '' ? null : Number(fields[0]);
    return event;
  });
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function backtestHeader(instrument: string, cutoff: string, config: BacktestConfig) {
  if (cutoff.length !== 20 || /[\n\r]/.test(instrument + cutoff)) {
    throw new Error('Use an instrument and a YYYY-MM-DDTHH:MM:SSZ UTC observation cutoff.');
  }
  return [instrument, cutoff, ...backtestSettings(config)];
}

function backtestSettings(config: BacktestConfig): [string, string] {
  const settings = [config.fastWindow, config.slowWindow, config.targetShares,
    config.participation, config.slippage, config.limitBuffer, config.maxWait].map(value => value.trim());
  if (settings.some(value => !/^\d+$/.test(value))) {
    throw new Error('Use whole-number strategy settings.');
  }
  return [paperSettings(config.paper), settings.join(',')];
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

function decodeFormulaBacktest(lines: string[], version: number): FormulaBacktestResult {
  const evaluations: FormulaBacktestResult['evaluations'] = [];
  const backtest = decodeBacktest(lines.filter(line => {
    if (!line.startsWith('C\t')) return true;
    const [, at, bar, entryValue, exitValue, side] = line.split('\t');
    if (side !== '' && side !== 'buy' && side !== 'sell') throw new Error('Invalid formula signal.');
    evaluations.push({ at: Number(at), barIndex: Number(bar), entry: entryValue ? BigInt(entryValue) : null,
      exit: exitValue ? BigInt(exitValue) : null, decision: side || null });
    return false;
  }));
  return { version, backtest, evaluations };
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
      snapshot.receipts.push(decodePaperReceipt(fields));
    } else {
      throw new Error('Invalid paper ledger row from the calculation engine.');
    }
  }
  return snapshot;
}

function decodePaperReceipt(fields: string[]): PaperReceipt {
  const [id, observedAt, kind, order, source, effective, shares, price, status, cashDelta, fee, realizedDelta] = fields;
  return { id, observedAt: Number(observedAt), kind, orderId: order || null, sourceId: source || null,
    priceAt: effective === '' ? null : Number(effective), shares: shares === '' ? null : BigInt(shares),
    price: price === '' ? null : BigInt(price), status, cashDelta: BigInt(cashDelta),
    fee: BigInt(fee), realizedDelta: BigInt(realizedDelta) };
}

function decodeSuccessorDelivery(fields: string[]): PortfolioSuccessorDeliveryPosting {
  const [posted, listing, delisting, successor, delisted, delistingObserved, positionEffective,
    positionObserved, entitled, termsObserved, scheduled, delta, denom, balance, balanceDenom] = fields;
  return {
    postedAt: Number(posted), listing, delisting, successor, delistedAt: Number(delisted),
    delistingObservedAt: Number(delistingObserved), positionEffectiveAt: Number(positionEffective),
    positionObservedAt: Number(positionObserved), entitledShares: Number(entitled),
    termsObservedAt: Number(termsObserved), scheduledDeliveryAt: Number(scheduled),
    delta: { numerator: BigInt(delta), denominator: Number(denom) },
    balance: { numerator: BigInt(balance), denominator: Number(balanceDenom) },
  };
}

function crossSectionSettings(config: CrossSectionConfig): string {
  const settings = [config.decisionSeconds, config.lookbackSeconds, config.topListings,
    config.targetShares, config.limitBuffer, config.participation];
  if (settings.some(value => !/^\d+$/.test(value))) {
    throw new Error('Use whole numbers for ranking settings.');
  }
  return settings.join(',') + '\n' + paperSettings(config.paper) + '\n';
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

function decodeScreenPrice(field: string): ScreenPrice | null {
  if (field === '') return null;
  const [ticks, observedAt] = field.split(',');
  return { ticks: BigInt(ticks), observedAt: Number(observedAt) };
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

  function checkOptionCutoffs(effective: string, known: string, maxAge: number) {
    if ([effective, known].some(value => value.length !== 20 || /[\n\r]/.test(value)))
      throw new Error('Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
    if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 0xffffffff)
      throw new Error('Maximum quote age must be a whole number from 0 to 4,294,967,295 seconds.');
  }

  function americanOptionInput(underlying: string, quotes: string, contract: string,
    effective: string, known: string, maxAge: number, steps: number): number {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(contract))
      throw new Error('Select a valid American contract ID.');
    checkOptionCutoffs(effective, known, maxAge);
    if (!Number.isInteger(steps) || steps < 1 || steps > 256)
      throw new Error('Use 1 to 256 whole pricing steps.');
    textInput([contract, effective, known, underlying + quotes].join('\n'));
    return encoder.encode(underlying).length;
  }

  function parseCashOption(payload: string): (AmericanCashPrice & { volatility?: number }) | OptionUnavailable {
    const issue = unavailableOptions.find(candidate => candidate === payload);
    if (issue) return issue;
    const [heading, ...rows] = payload.trimEnd().split('\n');
    const [status, price, volatility] = heading.split('\t');
    if (status !== 'value' || !price || !Number.isFinite(Number(price)) ||
        (volatility !== undefined && (!volatility || !Number.isFinite(Number(volatility)))))
      throw new Error('Invalid cash dividend option value from the calculation engine.');
    const dividends = rows.map(row => {
      const [tag, id, announcedAt, exAt, payAt, observedAt, currency, amount] = row.split('\t');
      if (tag !== 'D' || !amount)
        throw new Error('Invalid cash dividend report from the calculation engine.');
      return { id, announcedAt: Number(announcedAt), exAt: Number(exAt), payAt: Number(payAt),
        observedAt: Number(observedAt), currency, amountPerShare: BigInt(amount) };
    });
    return volatility === undefined
      ? { price: Number(price), dividends }
      : { price: Number(price), volatility: Number(volatility), dividends };
  }

  function financialQuery(filings: string, caps: string, issuer: string, at: string, known: string,
    includeQuarters: boolean) {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(issuer)) throw new Error('Select an issuer in the filing history.');
    if ([at, known].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
      throw new Error('Use YYYY-MM-DDTHH:MM:SSZ UTC timestamps for valuation and knowledge.');
    }
    textInput([issuer, at, known, filings + caps].join('\n'));
    const bytes = encoder.encode(filings).length;
    const status = includeQuarters ? api.mw_financial_snapshot(bytes) : api.mw_financial_as_of(bytes);
    const text = decoder.decode(output(status));
    let filing: Filing | null = null;
    let marketCap: MarketCap | null = null;
    let trailing: TrailingFourQuarters | null = null;
    const quarters: Filing[] = [];
    const multiples: Multiple[] = [];
    const quarterlyMultiples: (Multiple | null)[] = [];
    const amount = (value: string) => value === '' ? null : BigInt(value);
    for (const line of text.slice(0, -1).split('\n')) {
      const [type, ...fields] = line.split('\t');
      if (type === 'F' || type === 'Q') {
        const [sourceId, start, end, pub, obs, currency, revenue, income, equity, cash] = fields;
        const row = { sourceId, fiscalStart: Number(start), fiscalEnd: Number(end), publishedAt: Number(pub),
          observedAt: Number(obs), currency, revenue: amount(revenue), commonNetIncome: amount(income),
          commonEquity: amount(equity), operatingCashFlow: amount(cash) };
        if (type === 'F') filing = row;
        else quarters.push(row);
      } else if (type === 'C') {
        const [sourceId, time, obs, currency, cap] = fields;
        marketCap = { sourceId, at: Number(time), observedAt: Number(obs), currency, ticks: BigInt(cap) };
      } else if (type === 'R' || type === 'U') {
        const [kind, value] = fields;
        let multiple: Multiple | null;
        switch (kind) {
          case 'value': multiple = { kind, units: BigInt(value) }; break;
          case 'missing-filing':
          case 'missing-cap':
          case 'currency':
          case 'missing-denominator':
          case 'nonpositive-denominator': multiple = { kind }; break;
          case 'missing-quarters': multiple = null; break;
          default: throw new Error('Invalid valuation multiple from the calculation engine.');
        }
        if (type === 'U') quarterlyMultiples.push(multiple);
        else if (multiple) multiples.push(multiple);
      } else if (type === 'T') {
        const [kind, currency, revenue, income, cash] = fields;
        switch (kind) {
          case 'available': trailing = { kind, currency, revenue: amount(revenue),
            commonNetIncome: amount(income), operatingCashFlow: amount(cash) }; break;
          case 'insufficient-quarters':
          case 'noncontiguous':
          case 'currency': trailing = { kind }; break;
          default: throw new Error('Invalid quarterly coverage from the calculation engine.');
        }
      }
    }
    const [priceEarnings, priceSales, priceBook] = multiples;
    if (multiples.length !== 3) throw new Error('Incomplete valuation from the calculation engine.');
    return { valuation: { filing, marketCap, priceEarnings, priceSales, priceBook },
      quarters, trailing, quarterlyMultiples };
  }

  function screenInput(times: string[], ...files: string[]) {
    if (times.some(value => value.length !== 20 || /[\n\r]/.test(value))) {
      throw new Error('Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
    }
    textInput([...times, files.join('')].join('\n'));
  }

  function portfolioInput(effectiveAt: string, knownAt: string, ...files: string[]) {
    portfolioTimesInput([effectiveAt, knownAt], ...files);
  }

  function portfolioTimesInput(times: string[], ...files: string[]) {
    if (times.some(time => time.length !== 20 || /[\n\r]/.test(time))) {
      throw new Error('Use YYYY-MM-DDTHH:MM:SSZ UTC portfolio cutoffs.');
    }
    textInput([...times, files.join('')].join('\n'));
  }

  function decodeHeatmap(text: string): Heatmap {
    const optionalInt = (value: string) => value === '' ? null : Number(value);
    const optionalBigInt = (value: string) => value === '' ? null : BigInt(value);
    const [summary, ...lines] = text.replace(/\n$/, '').split('\n');
    const [kind, knownWeight, coveredWeight, net] = summary.split('\t');
    if (kind !== 'H') throw new Error('Invalid heatmap summary from the calculation engine.');
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
  }

  function validListingId(id: string) {
    return id.length >= 1 && id.length <= 40 && !/[^a-zA-Z0-9._-]/.test(id);
  }

  function putPairInput(membership: string, prices: string, leftId: string, rightId: string, times: string[]) {
    if (![leftId, rightId].every(validListingId)) {
      throw new Error('Use two valid listing IDs.');
    }
    screenInput(times, leftId, '\n', rightId, '\n', membership, prices);
  }

  function putFootprintInput(instrument: string, csv: string, { bucketSeconds, priceWidth, from, through, known }: FootprintQuery) {
    if (!Number.isInteger(bucketSeconds) || bucketSeconds < 1 || bucketSeconds > 0xffffffff) {
      throw new Error('Use a positive whole-second footprint interval.');
    }
    if ([instrument, priceWidth, from, through, known].some(value => /[\r\n]/.test(value))) {
      throw new Error('Use one instrument, price increment and exact UTC times.');
    }
    textInput([instrument, from, through, known, priceWidth, csv].join('\n'));
  }

  function decodeDepthStatus(summary: string): DepthStatus {
    const [kind, first, second] = summary.split('\t');
    switch (kind) {
      case 'no-observation':
      case 'awaiting-snapshot':
      case 'synchronized':
        return { kind };
      case 'sequence-gap':
        return { kind, expected: BigInt(first), received: BigInt(second) };
      case 'crossed':
        return { kind, sequence: BigInt(first) };
      default:
        throw new Error('Invalid depth status from the calculation engine.');
    }
  }

  function decodeFlowVolume(buy: string, sell: string, unknown: string, trades: string): TradeFlowVolume {
    return { buy: BigInt(buy), sell: BigInt(sell), unknown: BigInt(unknown), trades: Number(trades) };
  }

  function decodeBar(out: DataView, start: number): Bar {
    const fixed = (offset: number) => Number(out.getBigInt64(start + offset, true)) / SCALE;
    return { time: Number(out.getBigInt64(start, true)), open: fixed(8), high: fixed(16),
      low: fixed(24), close: fixed(32), volume: fixed(40) };
  }

  function decodePriceMovements(rows: DataView): PriceMovement[] {
    return Array.from({ length: rows.byteLength / 40 }, (_, index) => {
      const offset = index * 40;
      return {
        sourceTime: Number(rows.getBigInt64(offset, true)),
        sourceIndex: Number(rows.getBigInt64(offset + 8, true)),
        openTicks: rows.getBigInt64(offset + 16, true),
        closeTicks: rows.getBigInt64(offset + 24, true),
        sourceCloseTicks: rows.getBigInt64(offset + 32, true),
      };
    });
  }

  function decodeBars(out: DataView): Bar[] {
    return Array.from({ length: out.byteLength / 48 }, (_, i) => decodeBar(out, i * 48));
  }

  function putIndicatorBars(bars: readonly Bar[], operation: string, extraBytes = 0) {
    const dest = input(bars.length * 48 + extraBytes);
    for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, operation);
    return dest;
  }

  function observedIndicator(
    calculate: (period: number) => number, period: number, bars: readonly Bar[], label: string,
  ): (bigint | null)[] {
    validateIndicatorHistory(period, bars.length);
    putIndicatorBars(bars, label);
    return readIndicatorTicks(output(calculate(period)), bars.length);
  }

  function readIndicatorTicks(out: DataView, length: number) {
    return Array.from({ length }, (_, index) => {
      const ticks = out.getBigInt64(index * 8, true);
      return ticks === MISSING ? null : ticks;
    });
  }

  function readIndicatorPairs<T>(out: DataView, length: number, pair: (first: bigint | null, second: bigint | null) => T): T[] {
    function value(offset: number) {
      const ticks = out.getBigInt64(offset, true);
      return ticks === MISSING ? null : ticks;
    }
    return Array.from({ length }, (_, index) => pair(value(index * 16), value(index * 16 + 8)));
  }

  function readStochasticValues(out: DataView, length: number): StochasticValue[] {
    return readIndicatorPairs(out, length, (percentK, percentD) => ({ percentK, percentD }));
  }

  function observedCloseIndicator(
    calculate: (period: number) => number, period: number, bars: readonly Bar[],
  ) {
    validateIndicatorHistory(period, bars.length);
    putIndicatorCloses(bars);
    return readIndicatorTicks(output(calculate(period)), bars.length);
  }

  function putIndicatorCloses(bars: readonly Bar[]) {
    const dest = input(bars.length * 8);
    bars.forEach(({ close }, index) => {
      const ticks = Math.round(close * SCALE);
      if (!Number.isSafeInteger(ticks) || Math.abs(close) > 2_000_000_000 ||
        close !== ticks / SCALE) {
        throw new Error('Close must be a finite six-place fixed-point price.');
      }
      dest.setBigInt64(index * 8, BigInt(ticks), true);
    });
  }

  function putBar(dest: DataView, start: number, bar: Bar, operation: string) {
    if (!Number.isSafeInteger(bar.time)) throw new Error(operation + ' requires integer UTC seconds.');
    dest.setBigInt64(start, BigInt(bar.time), true);
    for (const [index, value] of [bar.open, bar.high, bar.low, bar.close, bar.volume].entries()) {
      const ticks = Math.round(value * SCALE);
      if (!Number.isSafeInteger(ticks) || Math.abs(value) > 2_000_000_000 ||
          value !== ticks / SCALE || (index === 4 && value < 0)) {
        throw new Error(operation + ' requires valid six-place OHLCV values.');
      }
      dest.setBigInt64(start + 8 + index * 8, BigInt(ticks), true);
    }
  }

  function replayCalendar(calendar: string, intervalSeconds: number, count: number) {
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 86_400) {
      throw new Error('Replay interval must be 1–86,400 seconds.');
    }
    if (count > 100_000) throw new Error('Replay supports up to 100,000 bars.');
    const calendarLimit = 1024 * 1024;
    if (calendar.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
    const encoded = encoder.encode(calendar);
    if (encoded.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
    return encoded;
  }

  function putBacktestInput(calendar: string, bars: string, trades: string, parts: Uint8Array[]) {
    const sessionBytes = encoder.encode(calendar);
    const barBytes = encoder.encode(bars);
    const tradeBytes = encoder.encode(trades);
    if (sessionBytes.length > 1024 * 1024) throw new Error('Session calendar exceeds 1 MiB.');
    if (barBytes.length > LIMIT) throw new Error('Bar history exceeds 8 MiB.');
    if (tradeBytes.length > LIMIT) throw new Error('Trade CSV exceeds 8 MiB.');
    const chunks = [...parts, sessionBytes, barBytes, tradeBytes];
    const size = chunks.reduce((sum, part) => sum + part.length, 0);
    const ptr = api.mw_recorded_backtest_input(size);
    if (!ptr) throw new Error('The calculation engine could not allocate recorded backtest input.');
    const dest = new Uint8Array(api.memory.buffer, ptr, size);
    let offset = 0;
    for (const chunk of chunks) {
      dest.set(chunk, offset);
      offset += chunk.length;
    }
    return { calendarBytes: sessionBytes.length, barBytes: barBytes.length };
  }

  function putPaperDepthInput(instrument: string, controls: string, depth: string, settings: string[] = []) {
    if (/[\r\n]/.test(instrument)) throw new Error('Use a single depth instrument.');
    const header = encoder.encode([instrument, ...settings, ''].join('\n'));
    const controlsBytes = encoder.encode(controls);
    const depthBytes = encoder.encode(depth);
    if (controlsBytes.length > 2 * 1024 * 1024 || depthBytes.length > LIMIT) {
      throw new Error('Use up to 2 MiB of paper controls and 8 MiB of depth reports.');
    }
    const size = header.length + controlsBytes.length + depthBytes.length;
    const ptr = api.mw_paper_depth_input(size);
    if (!ptr) throw new Error('The calculation engine could not allocate paper depth input.');
    const dest = new Uint8Array(api.memory.buffer, ptr, size);
    dest.set(header);
    dest.set(controlsBytes, header.length);
    dest.set(depthBytes, header.length + controlsBytes.length);
    return controlsBytes.length;
  }

  function encodeFormulaFunctions(functions: readonly FormulaFunction[] = []) {
    if (functions.length > 16) throw new Error('Supply at most 16 custom formula functions.');
    const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
    const chunks = functions.flatMap(({ name, parameters, body }) => {
      if (parameters.length < 1 || parameters.length > 4 || ![name, ...parameters].every(value => identifier.test(value))) {
        throw new Error('Use ASCII function names and one to four ASCII parameters.');
      }
      const expression = encoder.encode(body);
      if (expression.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
      return [encoder.encode(name + '\t' + parameters.join(',') + '\t' + expression.length + '\n'), expression];
    });
    return { chunks, bytes: chunks.reduce((length, part) => length + part.length, 0) };
  }

  function timedBacktestHeader(instrument: string, { effective, known, config }: RecordedBacktestQuery) {
    if (effective.length !== 20 || /[\r\n]/.test(effective)) {
      throw new Error('Use a YYYY-MM-DDTHH:MM:SSZ effective cutoff.');
    }
    return encoder.encode([...backtestHeader(instrument, known, config), effective, ''].join('\n'));
  }

  function putTimeframeInput(bars: readonly Bar[], source: number, target: number,
    calendar?: Uint8Array) {
    if (![source, target].every(n => Number.isInteger(n) && n > 0 && n <= 0xffffffff) ||
      bars.length > 100_000) {
      throw new Error('Use positive integer UTC intervals and at most 100,000 bars.');
    }
    const start = calendar?.byteLength ?? 0;
    const dest = input(start + bars.length * 48);
    if (calendar) new Uint8Array(dest.buffer, dest.byteOffset, start).set(calendar);
    bars.forEach((bar, index) => putBar(dest, start + index * 48, bar, 'Timeframe aggregation'));
  }

  function decodeTimeframeBar(out: DataView, start: number): TimeframeBar {
    return { bar: decodeBar(out, start), observedBars: out.getUint32(start + 48, true),
      expectedBars: out.getUint32(start + 52, true) };
  }

  return {
    evaluateScalarPlugin(module, ticks) {
      if (typeof api.mw_evaluate_scalar_plugin !== 'function')
        throw new Error('Scalar plugins require a compatible MarketWeft calculation engine.');
      if (module.byteLength > 64 * 1024) throw new Error('Scalar plugin exceeds 64 KiB.');
      if (typeof ticks !== 'bigint' || BigInt.asIntN(64, ticks) !== ticks)
        throw new Error('Scalar plugin input must fit a signed 64-bit integer.');
      const dest = input(module.byteLength);
      new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(module);
      return output(api.mw_evaluate_scalar_plugin(ticks)).getBigInt64(0, true);
    },
    evaluateScalarPluginSeries(module, bars, from, through) {
      if (typeof api.mw_evaluate_scalar_plugin_series !== 'function')
        throw new Error('Plugin series require a compatible MarketWeft calculation engine.');
      if (module.byteLength > 64 * 1024) throw new Error('Scalar plugin exceeds 64 KiB.');
      if (bars.length > 100_000) throw new Error('Scalar plugin series support up to 100,000 source bars.');
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(through))
        throw new Error('Use integer UTC seconds for scalar plugin closes.');
      const dest = input(module.byteLength + bars.length * 48);
      new Uint8Array(dest.buffer, dest.byteOffset, module.byteLength).set(module);
      bars.forEach((bar, index) => putBar(dest, module.byteLength + index * 48, bar, 'Scalar plugin'));
      const result = output(api.mw_evaluate_scalar_plugin_series(module.byteLength, BigInt(from), BigInt(through)));
      return Array.from({ length: result.byteLength / 24 }, (_, index) => {
        const offset = index * 24;
        return { time: Number(result.getBigInt64(offset, true)), close: result.getBigInt64(offset + 8, true),
          value: result.getBigInt64(offset + 16, true) };
      });
    },
    evaluateFormula(source, bars, functions) {
      const sourceBytes = encoder.encode(source);
      if (sourceBytes.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
      if (bars.length > 100_000) throw new Error('Formula histories support at most 100,000 bars.');
      const library = encodeFormulaFunctions(functions);
      const historyOffset = sourceBytes.length + library.bytes;
      const dest = input(historyOffset + bars.length * 48);
      const payload = new Uint8Array(dest.buffer, dest.byteOffset, historyOffset);
      let offset = 0;
      for (const part of [sourceBytes, ...library.chunks]) {
        payload.set(part, offset);
        offset += part.length;
      }
      for (const [index, bar] of bars.entries()) {
        putBar(dest, historyOffset + index * 48, bar, 'Formula evaluation');
      }
      const values = output(library.bytes ? api.mw_evaluate_formula_library(sourceBytes.length, library.bytes)
        : api.mw_evaluate_formula(sourceBytes.length));
      return { version: api.mw_formula_version(), values: Array.from({ length: bars.length }, (_, index) => {
        const value = values.getBigInt64(index * 8, true);
        return value === -(1n << 63n) ? null : value;
      }) };
    },
    measureRiskReward(side, entry, stop, target) {
      if (side !== 'long' && side !== 'short') throw new Error('Choose long or short for the drawing.');
      if (![entry, stop, target].every(Number.isSafeInteger)) throw new Error('Drawing prices require whole ticks.');
      const [risk, reward, multiple] = decoder.decode(output(api.mw_measure_risk_reward(
        side === 'long' ? 0 : 1, BigInt(entry), BigInt(stop), BigInt(target),
      ))).split('\t');
      return { riskTicks: BigInt(risk), rewardTicks: BigInt(reward), rewardPerRiskMicros: BigInt(multiple) };
    },
    measureDrawing({ start, end }) {
      if (![start.time, start.ticks, end.time, end.ticks].every(Number.isSafeInteger)) {
        throw new Error('Drawing endpoints require whole UTC seconds and whole price ticks.');
      }
      const [elapsed, price, pct] = decoder.decode(output(api.mw_measure_drawing(
        BigInt(start.time), BigInt(start.ticks), BigInt(end.time), BigInt(end.ticks),
      ))).split('\t');
      return { elapsedSeconds: Number(elapsed), priceTicks: BigInt(price),
        returnPctMicros: pct === '' ? null : BigInt(pct) };
    },
    gannFanLevels({ start, end }) {
      if (![start.time, start.ticks, end.time, end.ticks].every(Number.isSafeInteger)) {
        throw new Error('Drawing endpoints require whole UTC seconds and whole price ticks.');
      }
      const data = output(api.mw_gann_fan_levels(BigInt(start.time), BigInt(start.ticks), BigInt(end.time), BigInt(end.ticks)));
      if (data.byteLength !== 90) throw new Error('Invalid Gann fan response size.');
      return Array.from({ length: 9 }, (_, index) => {
        const offset = index * 10;
        return { priceUnits: data.getUint8(offset), timeUnits: data.getUint8(offset + 1), ticks: data.getBigInt64(offset + 2, true) };
      });
    },
    gannBoxLevels({ start, end, divisions }) {
      if (![start.time, start.ticks, end.time, end.ticks].every(Number.isSafeInteger)) {
        throw new Error('Drawing endpoints require whole UTC seconds and whole price ticks.');
      }
      if (![2, 4, 8].includes(divisions)) throw new Error('Choose 2, 4, or 8 Gann box divisions.');
      const data = output(api.mw_gann_box_levels(BigInt(start.time), BigInt(start.ticks), BigInt(end.time), BigInt(end.ticks), divisions));
      if (data.byteLength !== (divisions + 1) * 16) throw new Error('Invalid Gann box response size.');
      return Array.from({ length: divisions + 1 }, (_, index) => {
        const offset = index * 16;
        return { time: Number(data.getBigInt64(offset, true)), ticks: Number(data.getBigInt64(offset + 8, true)) };
      });
    },
    fibonacciChannelLevels(points) {
      if (!points.every(point => Number.isSafeInteger(point.time) && Number.isSafeInteger(point.ticks))) {
        throw new Error('Drawing endpoints require whole UTC seconds and whole price ticks.');
      }
      const [start, end, width] = points;
      const data = output(api.mw_fibonacci_channel_levels(BigInt(start.time), BigInt(start.ticks),
        BigInt(end.time), BigInt(end.ticks), BigInt(width.time), BigInt(width.ticks)));
      if (data.byteLength !== 60) throw new Error('Invalid Fibonacci channel response size.');
      return Array.from({ length: 6 }, (_, index) => {
        const offset = index * 10;
        return { ratioThousandths: data.getUint16(offset, true), offsetTicks: data.getBigInt64(offset + 2, true) };
      });
    },
    fibonacciCircleLevels({ start, end }) {
      if (![start.time, start.ticks, end.time, end.ticks].every(Number.isSafeInteger)) {
        throw new Error('Drawing endpoints require whole UTC seconds and whole price ticks.');
      }
      const data = output(api.mw_fibonacci_circle_levels(BigInt(start.time), BigInt(start.ticks), BigInt(end.time), BigInt(end.ticks)));
      if (data.byteLength !== 9 * 18) throw new Error('Invalid Fibonacci circle response size.');
      return Array.from({ length: 9 }, (_, index) => {
        const offset = index * 18;
        return {
          ratioThousandths: data.getUint16(offset, true),
          elapsedSeconds: Number(data.getBigInt64(offset + 2, true)),
          ticks: data.getBigInt64(offset + 10, true),
        };
      });
    },
    instrument(venue, symbol) {
      textInput(venue + '\n' + symbol);
      return decoder.decode(output(api.mw_instrument()));
    },
    parseCsv(csv) {
      textInput(csv);
      return decodeBars(output(api.mw_parse()));
    },
    recordedTickBars(instrument, csv, targetTrades, knownAt = '') {
      if (!Number.isInteger(targetTrades) || targetTrades < 1 || targetTrades > 100_000) {
        throw new Error('Use 1 to 100,000 trades per bar.');
      }
      if (/[\r\n]/.test(instrument + knownAt)) throw new Error('Use a single instrument and UTC cutoff.');
      textInput([instrument, knownAt, csv].join('\n'));
      const out = output(api.mw_tick_bars(targetTrades));
      return Array.from({ length: out.byteLength / 80 }, (_, i) => {
        const start = i * 80;
        return {
          bar: decodeBar(out, start),
          availableAt: Number(out.getBigInt64(start + 48, true)),
          firstSequence: out.getBigUint64(start + 56, true),
          lastSequence: out.getBigUint64(start + 64, true),
          observedTrades: out.getUint32(start + 72, true),
          targetTrades: out.getUint32(start + 76, true),
        };
      });
    },
    recordedRangeBars(instrument, csv, targetRangeTicks, knownAt = '') {
      if (targetRangeTicks < 1n || targetRangeTicks > 2_000_000_000_000_000n)
        throw new Error('Use a positive six-place price range.');
      if (/[\r\n]/.test(instrument + knownAt)) throw new Error('Use a single instrument and UTC cutoff.');
      textInput([instrument, knownAt, csv].join('\n'));
      const out = output(api.mw_range_bars(targetRangeTicks));
      return Array.from({ length: out.byteLength / 96 }, (_, i) => {
        const start = i * 96;
        return {
          bar: decodeBar(out, start),
          availableAt: Number(out.getBigInt64(start + 48, true)),
          firstSequence: out.getBigUint64(start + 56, true),
          lastSequence: out.getBigUint64(start + 64, true),
          observedTrades: out.getUint32(start + 72, true),
          complete: out.getUint32(start + 76, true) === 1,
          targetRangeTicks: out.getBigInt64(start + 80, true),
          observedRangeTicks: out.getBigInt64(start + 88, true),
        };
      });
    },
    recordedVolumeBars(instrument, csv, targetVolumeTicks, knownAt = '') {
      if (targetVolumeTicks < 1n || targetVolumeTicks > 2_000_000_000_000_000n)
        throw new Error('Use a positive six-place target volume.');
      if (/[\r\n]/.test(instrument + knownAt)) throw new Error('Use a single instrument and UTC cutoff.');
      textInput([instrument, knownAt, csv].join('\n'));
      const out = output(api.mw_volume_bars(targetVolumeTicks));
      return Array.from({ length: out.byteLength / 104 }, (_, i) => {
        const start = i * 104;
        return {
          bar: decodeBar(out, start),
          availableAt: Number(out.getBigInt64(start + 48, true)),
          firstSequence: out.getBigUint64(start + 56, true),
          lastSequence: out.getBigUint64(start + 64, true),
          contributingTrades: out.getUint32(start + 72, true),
          complete: out.getUint32(start + 76, true) === 1,
          volumeTicks: out.getBigInt64(start + 40, true),
          targetVolumeTicks: out.getBigInt64(start + 80, true),
          firstContributionTicks: out.getBigInt64(start + 88, true),
          lastContributionTicks: out.getBigInt64(start + 96, true),
        };
      });
    },
    footprintWindow(instrument, csv) {
      if (/[\r\n]/.test(instrument)) throw new Error('Use a single footprint instrument.');
      textInput(instrument + '\n' + csv);
      const out = output(api.mw_footprint_window());
      return {
        firstExecution: Number(out.getBigInt64(0, true)),
        lastExecution: Number(out.getBigInt64(8, true)),
        lastObserved: Number(out.getBigInt64(16, true)),
      };
    },
    recordedFootprint(instrument, csv, query) {
      putFootprintInput(instrument, csv, query);
      const text = decoder.decode(output(api.mw_trade_footprint(query.bucketSeconds)));
      const bars: FootprintBar[] = [];
      for (const line of text.trimEnd().split('\n')) {
        if (!line) continue;
        const [tag, ...fields] = line.split('\t');
        if (tag === 'B') {
          const [start, end, observed, first, last, buy, sell, unknown, trades, cumulative] = fields;
          bars.push({ startsAt: Number(start), endsAt: Number(end), lastObservedAt: Number(observed),
            firstSequence: BigInt(first), lastSequence: BigInt(last),
            volume: decodeFlowVolume(buy, sell, unknown, trades), cumulativeDelta: BigInt(cumulative), levels: [] });
        } else {
          const bar = bars.at(-1);
          if (tag !== 'L' || !bar) throw new Error('Invalid footprint data from the calculation engine.');
          const [from, to, buy, sell, unknown, trades] = fields;
          bar.levels.push({ priceFrom: BigInt(from), priceTo: BigInt(to), volume: decodeFlowVolume(buy, sell, unknown, trades) });
        }
      }
      return bars;
    },
    recordedPriceProfile(instrument, csv, query, valueAreaBasisPoints) {
      if (!Number.isInteger(valueAreaBasisPoints) || valueAreaBasisPoints < 1 || valueAreaBasisPoints > 10_000) {
        throw new Error('Use a value-area target from 1 to 10,000 basis points.');
      }
      putFootprintInput(instrument, csv, query);
      const text = decoder.decode(output(api.mw_price_profile(query.bucketSeconds, valueAreaBasisPoints)));
      const [header, ...lines] = text.trimEnd().split('\n');
      const [kind, brackets, target] = header.split('\t');
      if (kind !== 'H') throw new Error('Invalid profile summary from the calculation engine.');
      const result: PriceProfile = { levels: [], volume: null, timeOpportunities: null,
        observedBrackets: Number(brackets), valueAreaBasisPoints: Number(target) };
      for (const line of lines) {
        const [tag, ...fields] = line.split('\t');
        if (tag === 'V' || tag === 'T') {
          const [pointFrom, pointTo, valueFrom, valueTo, covered, total] = fields.map(value => BigInt(value));
          result[tag === 'V' ? 'volume' : 'timeOpportunities'] = {
            pointOfControlFrom: pointFrom, pointOfControlTo: pointTo, valueFrom, valueTo, covered, total,
          };
        } else if (tag === 'L') {
          const [priceFrom, priceTo, buy, sell, unknown, trades, opportunities] = fields;
          result.levels.push({ priceFrom: BigInt(priceFrom), priceTo: BigInt(priceTo),
            volume: decodeFlowVolume(buy, sell, unknown, trades), opportunities: Number(opportunities) });
        } else {
          throw new Error('Invalid profile data from the calculation engine.');
        }
      }
      return result;
    },
    depthCheckpoints(instrument, csv) {
      if (/[\r\n]/.test(instrument)) throw new Error('Use a single depth instrument.');
      textInput(instrument + '\n' + csv);
      const out = output(api.mw_depth_checkpoints());
      return Array.from({ length: out.byteLength / 8 }, (_, i) => Number(out.getBigInt64(i * 8, true)));
    },
    recordedDepth(instrument, csv, knownAt) {
      if (/[\r\n]/.test(instrument + knownAt)) throw new Error('Use a single instrument and UTC cutoff.');
      textInput([instrument, knownAt, csv].join('\n'));
      const [summary, ...rows] = decoder.decode(output(api.mw_recorded_depth())).trimEnd().split('\n');
      const view: RecordedDepth = { status: decodeDepthStatus(summary), received: null, snapshot: null, bids: [], asks: [] };
      for (const row of rows) {
        const [tag, first, second, third] = row.split('\t');
        if (tag === 'B' || tag === 'A') {
          const levels = tag === 'B' ? view.bids : view.asks;
          levels.push({ priceTicks: BigInt(first), sizeTicks: BigInt(second) });
        } else if (tag === 'R' || tag === 'S') {
          const stamp = { sequence: BigInt(first), eventAt: Number(second), observedAt: Number(third) };
          view[tag === 'R' ? 'received' : 'snapshot'] = stamp;
        } else {
          throw new Error('Invalid recorded depth row from the calculation engine.');
        }
      }
      return view;
    },
    recordedDepthSweep(instrument, csv, knownAt, side, size, limit = '') {
      if (/[\r\n]/.test(instrument + knownAt) || /[,\r\n]/.test(side + size + limit)) {
        throw new Error('Use a single instrument, UTC cutoff and sweep request.');
      }
      textInput([instrument, knownAt, [side, size.trim(), limit.trim()].join(','), csv].join('\n'));
      const [summary, ...rows] = decoder.decode(output(api.mw_recorded_depth_sweep())).trimEnd().split('\n');
      const result: DepthSweep = { status: decodeDepthStatus(summary), received: null, snapshot: null, execution: null };
      for (const row of rows) {
        const [tag, first, second, third, fourth] = row.split('\t');
        if (tag === 'R' || tag === 'S') {
          result[tag === 'R' ? 'received' : 'snapshot'] = { sequence: BigInt(first), eventAt: Number(second), observedAt: Number(third) };
        } else if (tag === 'E') {
          result.execution = { filledTicks: BigInt(first), remainingTicks: BigInt(second), notionalUnits: BigInt(third),
            meanPriceTicks: fourth ? BigInt(fourth) : null, fills: [] };
        } else if (tag === 'F' && result.execution) {
          result.execution.fills.push({ priceTicks: BigInt(first), sizeTicks: BigInt(second) });
        } else throw new Error('Invalid depth sweep row from the calculation engine.');
      }
      return result;
    },
    classifyRecordedTrades(instrument, trades, depth, query) {
      const cutoffs = [query.from, query.through, query.known];
      if (/[\r\n]/.test(instrument) || cutoffs.some(time => time.length !== 20 || /[\r\n]/.test(time))) {
        throw new Error('Use one instrument and exact UTC trade cutoffs.');
      }
      const age = query.maxQuoteAgeSeconds;
      if (!Number.isInteger(age) || age < 1 || age > 0xffffffff) {
        throw new Error('Use a positive whole-second maximum quote age.');
      }
      const header = encoder.encode([instrument, ...cutoffs, ''].join('\n'));
      const tradesBytes = encoder.encode(trades);
      const depthBytes = encoder.encode(depth);
      if (tradesBytes.length > LIMIT || depthBytes.length > LIMIT) throw new Error('Trade and depth CSVs may each use up to 8 MiB.');
      const size = header.length + tradesBytes.length + depthBytes.length;
      const ptr = api.mw_trade_classification_input(size);
      if (!ptr) throw new Error('The calculation engine could not allocate trade classification input.');
      const dest = new Uint8Array(api.memory.buffer, ptr, size);
      dest.set(header);
      dest.set(tradesBytes, header.length);
      dest.set(depthBytes, header.length + tradesBytes.length);
      const text = decoder.decode(output(api.mw_classify_recorded_trades(tradesBytes.length, age)));
      const results: TradeClassification[] = [];
      for (const line of text.trimEnd().split('\n').filter(Boolean)) {
        const [tag, first, second, third, fourth, fifth, sixth, seventh] = line.split('\t');
        if (tag === 'T') {
          results.push({ executedAt: Number(first), observedAt: Number(second), sequence: BigInt(third),
            priceTicks: BigInt(fourth), sizeTicks: BigInt(fifth), side: sixth as TradeClassification['side'],
            basis: seventh as TradeSideBasis, quote: null });
          continue;
        }
        const row = results.at(-1);
        if (!row) throw new Error('Invalid recorded classification evidence.');
        const stamp = { sequence: BigInt(first), eventAt: Number(second), observedAt: Number(third) };
        if (tag === 'Q') {
          row.quote = { stamp, status: decodeDepthStatus([fourth, fifth, sixth].join('\t')), bid: null, ask: null };
        } else if ((tag === 'B' || tag === 'A') && row.quote) {
          row.quote[tag === 'B' ? 'bid' : 'ask'] = { ...stamp, priceTicks: BigInt(fourth) };
        } else throw new Error('Invalid recorded classification evidence.');
      }
      return results;
    },
    heikinAshi(bars) {
      if (bars.length > 100_000) throw new Error('Heikin-Ashi supports up to 100,000 source bars.');
      const dest = input(bars.length * 48);
      for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, 'Heikin-Ashi');
      return decodeBars(output(api.mw_heikin_ashi()));
    },
    renko(bars, brickTicks) {
      if (brickTicks < 1n || brickTicks > 2_000_000_000_000_000n || bars.length > 100_000)
        throw new Error('Use a positive six-place brick size and at most 100,000 source bars.');
      const dest = input(bars.length * 48);
      for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, 'Renko');
      const rows = output(api.mw_renko(brickTicks));
      return decodePriceMovements(rows);
    },
    threeLineBreak(bars) {
      if (bars.length > 100_000)
        throw new Error('Three Line Break supports up to 100,000 source bars.');
      const dest = input(bars.length * 48);
      for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, 'Three Line Break');
      return decodePriceMovements(output(api.mw_three_line_break()));
    },
    kagi(bars, reversalTicks) {
      if (reversalTicks < 1n || reversalTicks > 2_000_000_000_000_000n || bars.length > 100_000)
        throw new Error('Use a positive six-place reversal size and at most 100,000 source bars.');
      const dest = input(bars.length * 48);
      for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, 'Kagi');
      const rows = output(api.mw_kagi(reversalTicks));
      return Array.from({ length: rows.byteLength / 56 }, (_, index) => {
        const offset = index * 56;
        const change = rows.getBigInt64(offset + 48, true);
        return {
          sourceTime: Number(rows.getBigInt64(offset, true)),
          sourceIndex: Number(rows.getBigInt64(offset + 8, true)),
          column: Number(rows.getBigInt64(offset + 16, true)),
          fromTicks: rows.getBigInt64(offset + 24, true),
          toTicks: rows.getBigInt64(offset + 32, true),
          thickBefore: rows.getBigInt64(offset + 40, true) === 1n,
          weightChangeTicks: change === -(1n << 63n) ? null : change,
        };
      });
    },
    pointAndFigure(bars, boxTicks) {
      if (boxTicks < 1n || boxTicks > 2_000_000_000_000_000n || bars.length > 100_000)
        throw new Error('Use a positive six-place box size and at most 100,000 source bars.');
      const dest = input(bars.length * 48);
      for (const [index, bar] of bars.entries()) putBar(dest, index * 48, bar, 'Point and Figure');
      const rows = output(api.mw_point_and_figure(boxTicks));
      return Array.from({ length: rows.byteLength / 48 }, (_, index) => {
        const offset = index * 48;
        return {
          sourceTime: Number(rows.getBigInt64(offset, true)),
          sourceIndex: Number(rows.getBigInt64(offset + 8, true)),
          column: Number(rows.getBigInt64(offset + 16, true)),
          levelTicks: rows.getBigInt64(offset + 24, true),
          sourceCloseTicks: rows.getBigInt64(offset + 32, true),
          mark: rows.getBigInt64(offset + 40, true) === 1n ? 'X' : 'O',
        };
      });
    },
    aggregateTimeframe(bars, sourceSeconds, targetSeconds) {
      putTimeframeInput(bars, sourceSeconds, targetSeconds);
      const out = output(api.mw_aggregate_timeframe(sourceSeconds, targetSeconds));
      return Array.from({ length: out.byteLength / 56 }, (_, i) => decodeTimeframeBar(out, i * 56));
    },
    aggregateSessionTimeframe(calendar, bars, sourceSeconds, targetSeconds) {
      if (calendar.length > 1024 * 1024) throw new Error('Session calendar exceeds 1 MiB.');
      const encoded = encoder.encode(calendar);
      if (encoded.byteLength > 1024 * 1024) throw new Error('Session calendar exceeds 1 MiB.');
      putTimeframeInput(bars, sourceSeconds, targetSeconds, encoded);
      const out = output(api.mw_aggregate_session_timeframe(encoded.byteLength, sourceSeconds, targetSeconds));
      return Array.from({ length: out.byteLength / 76 }, (_, i) => {
        const start = i * 76;
        return { ...decodeTimeframeBar(out, start), closeTime: Number(out.getBigInt64(start + 56, true)),
          sessionOpen: Number(out.getBigInt64(start + 64, true)), earlyClose: out.getUint32(start + 72, true) !== 0 };
      });
    },
    indicator(kind, period, bars) {
      if (kind !== 'sma' && kind !== 'ema' && kind !== 'rsi' && kind !== 'atr') throw new Error('Unknown indicator.');
      if (kind === 'rsi' && !validRsiPeriod(period)) throw new Error('RSI periods must be 2–100,000.');
      validateIndicatorHistory(period, bars.length);
      let out: DataView;
      if (kind === 'atr') {
        putIndicatorBars(bars, 'ATR');
        out = output(api.mw_atr(period));
      } else {
        putIndicatorCloses(bars);
        out = output(api.mw_indicator({ sma: 0, ema: 1, rsi: 2 }[kind], period));
      }
      return Array.from({ length: bars.length }, (_, i) => {
        const v = out.getBigInt64(i * 8, true);
        return v === MISSING ? null : Number(v) / SCALE;
      });
    },
    bollingerBands(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      return readPriceBands(output(api.mw_bollinger_bands(period)));
    },
    donchianChannels(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Donchian Channels');
      return readPriceBands(output(api.mw_donchian_channels(period)));
    },
    keltnerChannels(emaPeriod, atrPeriod, bars) {
      if (!validIndicatorPeriod(emaPeriod) || !validIndicatorPeriod(atrPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Series and indicator periods must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Keltner Channels');
      return readPriceBands(output(api.mw_keltner_channels(emaPeriod, atrPeriod)));
    },
    cumulativeVolume(bars) {
      if (bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Cumulative volume supports up to 100,000 observed bars.');
      putIndicatorBars(bars, 'Cumulative volume');
      const out = output(api.mw_cumulative_volume());
      return Array.from({ length: bars.length }, (_, index) => ({
        onBalance: signed128(out, index * 32), accumulationDistribution: signed128(out, index * 32 + 16),
      }));
    },
    aroon(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Aroon');
      return readOptionalTriples(output(api.mw_aroon(period)), (up, down, oscillator) => ({ up, down, oscillator }));
    },
    commodityChannelIndex(period, bars) {
      return observedIndicator(api.mw_commodity_channel_index, period, bars, 'Commodity Channel Index');
    },
    closeChanges(intervalSeconds, bars) {
      if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 0xffff_ffff)
        throw new Error('Use a positive whole-second close-change interval.');
      if (bars.length > 100_000) throw new Error('Close-change charts support up to 100,000 bars.');
      putIndicatorBars(bars, 'Close-change chart');
      const out = output(api.mw_close_changes(intervalSeconds));
      return Array.from({ length: bars.length }, (_, index) => {
        const delta = out.getBigInt64(index * 8, true);
        return delta === MISSING ? null : delta;
      });
    },
    confirmedCloseSwings(left, right, intervalSeconds, bars) {
      if (![left, right].every(side => Number.isInteger(side) && side >= 1 && side <= 1000) ||
          !Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 0xffff_ffff ||
          bars.length > 100_000) {
        throw new Error('Close swings require 1–1,000 bars on each side, a positive interval, and up to 100,000 bars.');
      }
      putIndicatorBars(bars, 'Close swings');
      const out = output(api.mw_confirmed_close_swings(left, right, intervalSeconds));
      return Array.from({ length: bars.length }, (_, index) => {
        const start = 32 * index;
        const direction = out.getBigInt64(start + 24, true);
        return direction === 0n ? null : {
          pivotAt: Number(out.getBigInt64(start, true)),
          confirmedAt: Number(out.getBigInt64(start + 8, true)),
          close: out.getBigInt64(start + 16, true),
          side: direction > 0n ? 'high' : 'low',
        };
      });
    },
    anchoredVwap(anchorAt, bars) {
      if (!Number.isSafeInteger(anchorAt) || bars.length > 100_000)
        throw new Error('Anchored VWAP requires a whole UTC second and up to 100,000 bars.');
      putIndicatorBars(bars, 'Anchored VWAP');
      const out = output(api.mw_anchored_vwap(BigInt(anchorAt)));
      return Array.from({ length: bars.length }, (_, index) => {
        const start = index * 24;
        const price = out.getBigInt64(start, true);
        return price === MISSING ? null : { price, cumulativeVolume: signed128(out, start + 8) };
      });
    },
    anchoredTwap(anchorAt, bars) {
      if (!Number.isSafeInteger(anchorAt) || bars.length > 100_000)
        throw new Error('Anchored TWAP requires a whole UTC second and up to 100,000 bars.');
      putIndicatorBars(bars, 'Anchored TWAP');
      const out = output(api.mw_anchored_twap(BigInt(anchorAt)));
      return Array.from({ length: bars.length }, (_, index) => {
        const start = index * 16;
        const price = out.getBigInt64(start, true);
        return price === MISSING ? null : { price, elapsedSeconds: Number(out.getBigInt64(start + 8, true)) };
      });
    },
    regressionChannel(startAt, endAt, bars) {
      if (![startAt, endAt].every(Number.isSafeInteger) || bars.length > 100_000)
        throw new Error('A regression channel needs whole UTC seconds and up to 100,000 bars.');
      putIndicatorBars(bars, 'Regression channel');
      const value = decoder.decode(output(api.mw_regression_channel(BigInt(startAt), BigInt(endAt))));
      if (!value) return null;
      const [count, start, end, residual] = value.split('\t');
      return { observations: Number(count), startTicks: BigInt(start), endTicks: BigInt(end), residualTicks: BigInt(residual) };
    },
    rollingCloseRegression(period, bars) {
      if (period < 2) throw new Error('Regression studies need at least two bars per window.');
      validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      return readIndicatorPairs(output(api.mw_rolling_close_regression(period)), bars.length,
        (slope, forecast) => ({ slope, forecast }));
    },
    observedDrawdown(bars) {
      if (bars.length > 100_000) throw new Error('Drawdown charts support up to 100,000 bars.');
      putIndicatorBars(bars, 'Drawdown chart');
      const out = output(api.mw_observed_drawdown());
      return Array.from({ length: bars.length }, (_, index) => {
        const start = 24 * index;
        const percent = out.getBigInt64(start + 16, true);
        return percent === MISSING ? null : {
          peakAt: Number(out.getBigInt64(start, true)),
          peakClose: out.getBigInt64(start + 8, true),
          percent,
        };
      });
    },
    monthlyReturns(bars, firstYear, lastYear, knownThrough) {
      if (![firstYear, lastYear].every(year => Number.isInteger(year) && year >= 1 && year <= 9999) ||
          lastYear < firstYear || lastYear - firstYear >= 30) {
        throw new Error('Choose up to 30 consecutive UTC calendar years between 0001 and 9999.');
      }
      if (!Number.isSafeInteger(knownThrough) || bars.length > 100_000) {
        throw new Error('Monthly returns require a whole UTC second and up to 100,000 bars.');
      }
      putIndicatorBars(bars, 'Monthly returns');
      const data = output(api.mw_monthly_returns(firstYear, lastYear, BigInt(knownThrough)));
      const count = 12 * (lastYear - firstYear + 1);
      if (data.byteLength !== count * 52) throw new Error('Invalid monthly returns response size.');
      const readClose = (offset: number) => {
        const at = data.getBigInt64(offset, true);
        return at === MISSING ? null : { at: Number(at), ticks: data.getBigInt64(offset + 8, true) };
      };
      return Array.from({ length: count }, (_, index) => {
        const start = index * 52;
        const window = MONTH_WINDOWS[data.getUint8(start + 3)];
        if (!window) throw new Error('Invalid monthly returns window.');
        const percent = signed128(data, start + 36);
        return { year: data.getUint16(start, true), month: data.getUint8(start + 2), window,
          prior: readClose(start + 4), current: readClose(start + 20),
          percent: percent === WIDE_MISSING ? null : percent };
      });
    },
    observedCloseDistributions(bars, size) {
      if (!Number.isInteger(size) || size < 2 || size > 10_000) {
        throw new Error('Use 2–10,000 closes per distribution.');
      }
      if (bars.length > 100_000) throw new Error('Close distributions support up to 100,000 source bars.');
      putIndicatorBars(bars, 'Close distribution chart');
      const outputBytes = output(api.mw_observed_close_distributions(size));
      return Array.from({ length: outputBytes.byteLength / 56 }, (_, index) => {
        const start = index * 56;
        return {
          firstAt: Number(outputBytes.getBigInt64(start, true)), lastAt: Number(outputBytes.getBigInt64(start + 8, true)),
          minimum: outputBytes.getBigInt64(start + 16, true), lowerQuartile: outputBytes.getBigInt64(start + 24, true),
          median: outputBytes.getBigInt64(start + 32, true), upperQuartile: outputBytes.getBigInt64(start + 40, true),
          maximum: outputBytes.getBigInt64(start + 48, true),
        };
      });
    },
    openingGaps(bars) {
      validateIndicatorHistory(1, bars.length);
      putIndicatorBars(bars, 'Opening gaps');
      const data = output(api.mw_opening_gaps());
      if (data.byteLength !== bars.length * 24) throw new Error('Invalid opening gaps response size.');
      return Array.from({ length: bars.length }, (_, index) => {
        const offset = index * 24;
        const priorAt = data.getBigInt64(offset, true);
        if (priorAt === MISSING) return null;
        return { priorAt: Number(priorAt), priorClose: data.getBigInt64(offset + 8, true),
          difference: data.getBigInt64(offset + 16, true) };
      });
    },
    rebasedPercentChanges(anchorAt, bars) {
      if (!Number.isSafeInteger(anchorAt) || bars.length > 100_000)
        throw new Error('Rebased change requires a whole UTC second and up to 100,000 bars.');
      putIndicatorBars(bars, 'Rebased change chart');
      return readWideIndicator(output(api.mw_rebased_percent_changes(BigInt(anchorAt))), bars.length);
    },
    rateOfChange(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      return readWideIndicator(output(api.mw_rate_of_change(period)), bars.length);
    },
    coppockCurve(smoothing, first, second, bars) {
      for (const period of [smoothing, first, second]) validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      return readWideIndicator(output(api.mw_coppock_curve(smoothing, first, second)), bars.length);
    },
    verticalHorizontalFilter(period, bars) {
      if (period < 2) throw new Error('Vertical Horizontal Filter needs at least two bars per window.');
      return observedCloseIndicator(api.mw_vertical_horizontal_filter, period, bars);
    },
    psychologicalLine(period, bars) {
      return observedCloseIndicator(api.mw_psychological_line, period, bars);
    },
    chandeMomentumOscillator(period, bars) {
      return observedCloseIndicator(api.mw_chande_momentum_oscillator, period, bars);
    },
    trix(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      return readWideIndicator(output(api.mw_trix(period)), bars.length);
    },
    dailyFloorPivots(bars, queryTimes) {
      if (bars.length > 100_000 || queryTimes.length > 100_000 || !queryTimes.every(Number.isSafeInteger)) {
        throw new Error('Daily pivots require up to 100,000 bars and ordered whole UTC seconds.');
      }
      const data = putIndicatorBars(bars, 'Daily floor pivots', queryTimes.length * 8);
      const timesStart = bars.length * 48;
      queryTimes.forEach((time, index) => data.setBigInt64(timesStart + index * 8, BigInt(time), true));
      const rows = output(api.mw_daily_floor_pivots(bars.length));
      if (rows.byteLength !== queryTimes.length * 48) throw new Error('Invalid daily pivot result size.');
      return Array.from({ length: queryTimes.length }, (_, index) => {
        const offset = index * 48;
        const priorCloseAt = rows.getBigInt64(offset, true);
        if (priorCloseAt === MISSING) return null;
        return { priorCloseAt: Number(priorCloseAt), pivot: rows.getBigInt64(offset + 8, true),
          supportOne: rows.getBigInt64(offset + 16, true), supportTwo: rows.getBigInt64(offset + 24, true),
          resistanceOne: rows.getBigInt64(offset + 32, true), resistanceTwo: rows.getBigInt64(offset + 40, true) };
      });
    },
    elderForceIndex(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Elder Force Index');
      return readWideIndicator(output(api.mw_elder_force_index(period)), bars.length);
    },
    elderRayIndex(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Elder-Ray Index');
      const data = output(api.mw_elder_ray_index(period));
      if (data.byteLength !== bars.length * 16) throw new Error('Invalid Elder-Ray response size.');
      return Array.from({ length: bars.length }, (_, index) => {
        const start = index * 16;
        const bull = data.getBigInt64(start, true);
        return bull === MISSING ? null : { bull, bear: data.getBigInt64(start + 8, true) };
      });
    },
    demarker(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'DeMarker');
      const data = output(api.mw_demarker(period));
      if (data.byteLength !== bars.length * 8) throw new Error('Invalid DeMarker response size.');
      return Array.from({ length: bars.length }, (_, index) => {
        const value = data.getBigInt64(index * 8, true);
        return value === MISSING ? null : value;
      });
    },
    relativeVigor(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Relative Vigor Index');
      const data = output(api.mw_relative_vigor(period));
      if (data.byteLength !== bars.length * 16) throw new Error('Invalid Relative Vigor response size.');
      function at(offset: number) {
        const value = data.getBigInt64(offset, true);
        return value === MISSING ? null : value;
      }
      return Array.from({ length: bars.length }, (_, index) => ({ vigor: at(index * 16), signal: at(index * 16 + 8) }));
    },
    chaikinVolatility(smoothing, comparison, bars) {
      validateIndicatorHistory(smoothing, bars.length);
      validateIndicatorHistory(comparison, bars.length);
      putIndicatorBars(bars, 'Chaikin Volatility');
      return readWideIndicator(output(api.mw_chaikin_volatility(smoothing, comparison)), bars.length);
    },
    vortexIndicator(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Vortex');
      const data = output(api.mw_vortex_indicator(period));
      if (data.byteLength !== bars.length * 32) throw new Error('Invalid Vortex response size.');
      return Array.from({ length: bars.length }, (_, index) => {
        const start = index * 32;
        const positive = signed128(data, start);
        return positive === WIDE_MISSING ? null : { positive, negative: signed128(data, start + 16) };
      });
    },
    balanceOfPower(bars) {
      validateIndicatorHistory(1, bars.length);
      putIndicatorBars(bars, 'Balance of Power');
      const data = output(api.mw_balance_of_power());
      return Array.from({ length: bars.length }, (_, index) => {
        const value = data.getBigInt64(index * 8, true);
        return value === MISSING ? null : value;
      });
    },
    linearlyWeightedAverage(period, bars) {
      return observedCloseIndicator(api.mw_linearly_weighted_average, period, bars);
    },
    doubleExponentialMovingAverage(period, bars) {
      return observedCloseIndicator(api.mw_double_exponential_moving_average, period, bars);
    },
    tripleExponentialMovingAverage(period, bars) {
      return observedCloseIndicator(api.mw_triple_exponential_moving_average, period, bars);
    },
    hullMovingAverage(period, bars) {
      return observedCloseIndicator(api.mw_hull_moving_average, period, bars);
    },
    kaufmanAdaptiveMovingAverage(period, bars) {
      return observedCloseIndicator(api.mw_kaufman_adaptive_moving_average, period, bars);
    },
    kaufmanEfficiencyRatio(period, bars) {
      return observedCloseIndicator(api.mw_kaufman_efficiency_ratio, period, bars);
    },
    priceVolumeTrend(bars) {
      if (bars.length > MAX_INDICATOR_PERIOD) throw new Error('Price Volume Trend supports up to 100,000 observed bars.');
      putIndicatorBars(bars, 'Price Volume Trend');
      return readWideIndicator(output(api.mw_price_volume_trend()), bars.length);
    },
    volumeRateOfChange(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Volume Rate of Change');
      return readWideIndicator(output(api.mw_volume_rate_of_change(period)), bars.length);
    },
    volumeOscillator(fast, slow, bars) {
      validateIndicatorHistory(fast, bars.length);
      validateIndicatorHistory(slow, bars.length);
      if (fast >= slow) throw new Error('The Volume Oscillator fast period must be shorter than the slow period.');
      putIndicatorBars(bars, 'Volume Oscillator');
      return readIndicatorTicks(output(api.mw_volume_oscillator(fast, slow)), bars.length);
    },
    adxRating(diPeriod, adxPeriod, bars) {
      if (![diPeriod, adxPeriod].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Directional periods and histories must fit within 100,000 bars.');
      putIndicatorBars(bars, 'ADX Rating');
      return readIndicatorTicks(output(api.mw_adx_rating(diPeriod, adxPeriod)), bars.length);
    },
    directionalMovement(diPeriod, adxPeriod, bars) {
      if (![diPeriod, adxPeriod].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Series and indicator periods must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Directional Movement System');
      const out = output(api.mw_directional_movement(diPeriod, adxPeriod));
      function value(offset: number) {
        const ticks = out.getBigInt64(offset, true);
        return ticks === MISSING ? null : ticks;
      }
      return Array.from({ length: bars.length }, (_, index) => ({
        plusDi: value(index * 24), minusDi: value(index * 24 + 8), adx: value(index * 24 + 16),
      }));
    },
    moneyFlowIndex(period, bars) {
      return observedIndicator(api.mw_money_flow_index, period, bars, 'Money Flow Index');
    },
    volumeWeightedAverage(period, bars) {
      return observedIndicator(api.mw_volume_weighted_average, period, bars, 'VWMA');
    },
    chaikinMoneyFlow(period, bars) {
      return observedIndicator(api.mw_chaikin_money_flow, period, bars, 'Chaikin Money Flow');
    },
    chaikinOscillator(fast, slow, bars) {
      if (![fast, slow].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Series and indicator periods must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Chaikin Oscillator');
      return readWideIndicator(output(api.mw_chaikin_oscillator(fast, slow)), bars.length);
    },
    macd(fast, slow, signal, bars) {
      if (![fast, slow, signal].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Series and indicator periods must fit within 100,000 bars.');
      putIndicatorCloses(bars);
      const out = output(api.mw_macd(fast, slow, signal));
      function value(offset: number) {
        const ticks = out.getBigInt64(offset, true);
        return ticks === MISSING ? null : ticks;
      }
      return Array.from({ length: bars.length }, (_, index) => ({
        line: value(index * 24), signal: value(index * 24 + 8), histogram: value(index * 24 + 16),
      }));
    },
    percentagePriceOscillator(fast, slow, signal, bars) {
      if (![fast, slow, signal].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD || fast >= slow)
        throw new Error('PPO requires 1–100,000 bar periods and a fast period shorter than the slow period.');
      putIndicatorCloses(bars);
      const out = output(api.mw_percentage_price_oscillator(fast, slow, signal));
      function value(offset: number) {
        const ticks = signed128(out, offset);
        return ticks === WIDE_MISSING ? null : ticks;
      }
      return Array.from({ length: bars.length }, (_, index) => ({
        line: value(index * 48), signal: value(index * 48 + 16), histogram: value(index * 48 + 32),
      }));
    },
    normalizedAverageTrueRange(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorBars(bars, 'Normalized ATR');
      return readWideIndicator(output(api.mw_normalized_average_true_range(period)), bars.length);
    },
    williamsPercentR(period, bars) {
      return observedIndicator(api.mw_williams_percent_r, period, bars, 'Williams %R');
    },
    stochasticOscillator(lookback, smoothing, signal, bars) {
      if (![lookback, smoothing, signal].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Series and indicator periods must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Stochastic Oscillator');
      return readStochasticValues(output(api.mw_stochastic_oscillator(lookback, smoothing, signal)), bars.length);
    },
    stochasticRsi(rsi, lookback, smoothing, signal, bars) {
      if (rsi < 2 || ![rsi, lookback, smoothing, signal].every(validIndicatorPeriod) ||
          bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Stochastic RSI requires an RSI period from 2 through 100,000 and other periods from 1 through 100,000 bars.');
      putIndicatorCloses(bars);
      return readStochasticValues(output(api.mw_stochastic_rsi(rsi, lookback, smoothing, signal)), bars.length);
    },
    ultimateOscillator(short, medium, long, bars) {
      if (![short, medium, long].every(validIndicatorPeriod) || short >= medium || medium >= long ||
          bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Ultimate Oscillator periods must increase strictly within 1–100,000 bars, with at most 100,000 source bars.');
      putIndicatorBars(bars, 'Ultimate Oscillator');
      return readIndicatorTicks(output(api.mw_ultimate_oscillator(short, medium, long)), bars.length);
    },
    choppinessIndex(period, bars) {
      if (period < 2) throw new Error('Choppiness Index needs at least two bars per window.');
      return observedIndicator(api.mw_choppiness_index, period, bars, 'Choppiness Index');
    },
    detrendedPriceOscillator(period, bars) {
      if (period < 2) throw new Error('Detrended Price Oscillator needs at least two bars per window.');
      return observedIndicator(api.mw_detrended_price_oscillator, period, bars, 'Detrended Price Oscillator');
    },
    massIndex(smoothing, sum, bars) {
      if (![smoothing, sum].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Mass Index periods and histories must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Mass Index');
      return readIndicatorTicks(output(api.mw_mass_index(smoothing, sum)), bars.length);
    },
    stochasticMomentumIndex(lookback, first, second, signal, bars) {
      if (![lookback, first, second, signal].every(validIndicatorPeriod) || bars.length > MAX_INDICATOR_PERIOD)
        throw new Error('Stochastic Momentum Index periods and histories must fit within 100,000 bars.');
      putIndicatorBars(bars, 'Stochastic Momentum Index');
      return readIndicatorPairs(output(api.mw_stochastic_momentum_index(lookback, first, second, signal)),
        bars.length, (line, signal) => ({ line, signal }));
    },
    bollingerMeasures(period, bars) {
      validateIndicatorHistory(period, bars.length);
      putIndicatorCloses(bars);
      const out = output(api.mw_bollinger_measures(period));
      function value(offset: number) {
        const ticks = signed128(out, offset);
        return ticks === -(1n << 127n) ? null : ticks;
      }
      return Array.from({ length: bars.length }, (_, index) => ({
        percentB: value(index * 32), bandwidth: value(index * 32 + 16),
      }));
    },
    replayCandlePatterns(calendar, intervalSeconds, bars, knownAt) {
      const encoded = replayCalendar(calendar, intervalSeconds, bars.length);
      if (!Number.isSafeInteger(knownAt)) throw new Error('The observation cutoff must be integer UTC seconds.');
      const start = 8 + encoded.length;
      const dest = input(start + bars.length * 48);
      dest.setBigInt64(0, BigInt(knownAt), true);
      new Uint8Array(dest.buffer, dest.byteOffset + 8, encoded.length).set(encoded);
      for (const [index, bar] of bars.entries()) putBar(dest, start + index * 48, bar, 'Candle pattern replay');
      const out = output(api.mw_replay_candle_patterns(encoded.length, intervalSeconds));
      return Array.from({ length: out.byteLength / 16 }, (_, index) => {
        const offset = index * 16;
        return {
          kind: candlePatternKinds[out.getUint32(offset + 12, true)],
          barIndex: out.getUint32(offset + 8, true),
          observedAt: Number(out.getBigInt64(offset, true)),
        };
      });
    },
    replay(calendar, intervalSeconds, bars) {
      const encoded = replayCalendar(calendar, intervalSeconds, bars.length);
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
    providerHistoryAsOf(csv, effectiveAt, knownAt) {
      if ([effectiveAt, knownAt].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput(effectiveAt + '\n' + knownAt + '\n' + csv);
      const [header, ...lines] = decoder.decode(output(api.mw_provider_history_as_of())).trimEnd().split('\n');
      const [provider, instrument] = header.split('\t');
      return { provider, instrument, bars: lines.map(line => {
        const [at, observed, open, high, low, close, volume] = line.split('\t');
        return { at: Number(at), observedAt: Number(observed), open: BigInt(open),
          high: BigInt(high), low: BigInt(low), close: BigInt(close), volume: BigInt(volume) };
      }) };
    },
    providerBarObservations(csv, barAt, effectiveAt, knownAt) {
      const barTime = new Date(barAt);
      if (Number.isNaN(barTime.getTime()) || barTime.toISOString().replace('.000Z', 'Z') !== barAt) {
        throw new Error('The bar time requires a YYYY-MM-DDTHH:MM:SSZ UTC timestamp.');
      }
      if ([effectiveAt, knownAt].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput(effectiveAt + '\n' + knownAt + '\n' + csv);
      const text = decoder.decode(output(api.mw_provider_bar_observations(BigInt(barTime.getTime() / 1000)))).trimEnd();
      if (!text) return [];
      return text.split('\n').map(line => {
        const [observed, open, high, low, close, volume] = line.split('\t');
        return {
          observedAt: Number(observed),
          bar: open === undefined ? null : { open: BigInt(open), high: BigInt(high),
            low: BigInt(low), close: BigInt(close), volume: BigInt(volume) },
        };
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
    portfolioFxAsOf(rates, reporting, effectiveAt, knownAt, subtotals) {
      if (!/^[A-Z]{3}$/.test(reporting) || subtotals.some(({ currency, subtotal }) =>
        !/^[A-Z]{3}$/.test(currency) || typeof subtotal !== 'bigint')) {
        throw new Error('Use three-letter currencies and exact integer source subtotals.');
      }
      const values = subtotals.map(({ currency, subtotal }) => currency + '=' + subtotal).join('\t');
      portfolioInput(effectiveAt, knownAt, reporting + '\n' + values + '\n', rates);
      const [header, ...lines] = decoder.decode(output(api.mw_portfolio_fx_as_of())).trimEnd().split('\n');
      const [tag, reportingCurrency, knownSubtotal] = header.split('\t');
      if (tag !== 'H' || reportingCurrency !== reporting) throw new Error('Invalid FX translation evidence.');
      return { reportingCurrency, knownSubtotal: knownSubtotal ? BigInt(knownSubtotal) : null,
        rows: lines.map(line => {
          const [kind, currency, amount, converted, baseCurrency, quoteCurrency, rateAt, observedAt,
            rateTicks, inverted] = line.split('\t');
          if (kind !== 'R') throw new Error('Invalid FX source currency evidence.');
          return { currency, subtotal: BigInt(amount), converted: converted ? BigInt(converted) : null,
            rate: baseCurrency ? { baseCurrency, quoteCurrency, rateAt: Number(rateAt), observedAt: Number(observedAt),
              rateTicks: BigInt(rateTicks), inverted: inverted === '1' } : null };
        }),
      };
    },
    portfolioAsOf(membership, holdings, prices, terms, effectiveAt, knownAt, dividends = '') {
      portfolioInput(effectiveAt, knownAt, membership, holdings, prices, terms, dividends);
      const widths = [encoder.encode(membership).length, encoder.encode(holdings).length,
        encoder.encode(prices).length] as const;
      const text = decoder.decode(output(dividends
        ? api.mw_portfolio_income_as_of(...widths, encoder.encode(terms).length)
        : api.mw_portfolio_as_of(...widths)));
      const [header, ...rows] = text.slice(0, -1).split('\n');
      const [, effective, known, unavailable] = header.split('\t');
      const report: PortfolioSnapshot = {
        effectiveAt: Number(effective), knownAt: Number(known), unvaluedPositions: Number(unavailable),
        holdings: [], totals: [], equityConcentration: [],
      };
      const income: NonNullable<PortfolioSnapshot['income']> | undefined = dividends
        ? { totals: [], dividends: [] } : undefined;
      if (income) report.income = income;
      for (const row of rows) {
        const [kind, ...fields] = row.split('\t');
        if (kind === 'G') {
          const [currency, gross] = fields;
          report.equityConcentration.push({ currency: currency || null, grossMark: gross ? BigInt(gross) : null, positions: [] });
        } else if (kind === 'E') {
          const group = report.equityConcentration.at(-1);
          if (!group) throw new Error('Invalid portfolio equity concentration evidence.');
          const [listing, mark, rank, weight] = fields;
          group.positions.push({ listing, mark: mark ? BigInt(mark) : null, rank: rank ? Number(rank) : null,
            weightMicros: weight ? BigInt(weight) : null });
        } else if (kind === 'C') {
          const [currency, sharesValue, receivable, cash] = fields;
          report.totals.push({ currency, sharesValue: BigInt(sharesValue), receivable: BigInt(receivable), cash: BigInt(cash) });
        } else if (kind === 'I' && income) {
          const [currency, receivable, cash] = fields;
          income.totals.push({ currency, receivable: BigInt(receivable), cash: BigInt(cash) });
        } else if (kind === 'D' && income) {
          const [listing, id, announced, ex, pay, observed, currency, rate, state, shares, amount] = fields;
          income.dividends.push({ listing, id, announcedAt: Number(announced), exAt: Number(ex),
            payAt: Number(pay), observedAt: Number(observed), currency, rate: BigInt(rate),
            state: state as typeof income.dividends[number]['state'],
            entitledShares: shares === '' ? null : Number(shares), amount: amount === '' ? null : BigInt(amount) });
        } else if (kind === 'H') {
          const [listing, instrument, shares, effective, observed, state, currency,
            value, price, priceAt, delisting, termsAt] = fields;
          report.holdings.push({
            listing, instrument: instrument || null, shares: Number(shares), positionEffectiveAt: Number(effective),
            positionObservedAt: Number(observed), state: state as PortfolioSnapshot['holdings'][number]['state'],
            currency: currency || null, value: value ? BigInt(value) : null, price: price ? BigInt(price) : null,
            priceObservedAt: priceAt ? Number(priceAt) : null, delisting: delisting || null,
            termsObservedAt: termsAt ? Number(termsAt) : null,
          });
        } else {
          throw new Error('Invalid portfolio record from the calculation engine.');
        }
      }
      return report;
    },
    portfolioSuccessorSharesAsOf(membership, holdings, terms, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, terms);
      const text = decoder.decode(output(api.mw_portfolio_successor_shares_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length,
      )));
      if (!text) return [];
      const optional = (value: string) => value === '' ? null : Number(value);
      return text.slice(0, -1).split('\n').map(line => {
        const [listing, delisting, delisted, observed, state, entitled, positionEffective, positionObserved,
          successor, termsObserved, deliver, rate, shares] = line.split('\t');
        const [rateNumerator, rateDenominator] = rate.split('/');
        const [numerator, denominator] = shares.split('/');
        return {
          listing, delisting, delistedAt: Number(delisted), delistingObservedAt: Number(observed),
          state: state as PortfolioSuccessorShare['state'], entitledShares: optional(entitled),
          positionEffectiveAt: optional(positionEffective), positionObservedAt: optional(positionObserved),
          terms: successor ? {
            listing: successor, observedAt: Number(termsObserved), deliverAt: optional(deliver),
            rate: { numerator: Number(rateNumerator), denominator: Number(rateDenominator) },
          } : null,
          successorShares: shares ? { numerator: BigInt(numerator), denominator: Number(denominator) } : null,
        };
      });
    },
    portfolioCapitalReturnsAsOf(membership, holdings, returns, basis, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, returns, basis);
      const text = decoder.decode(output(api.mw_portfolio_capital_returns_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length, encoder.encode(returns).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [listingId, actionId, announced, ex, pay, observed, currency, rate, state,
          shares, amount, basisObserved, before, reduction, remaining, excess] = line.split('\t');
        return {
          listingId, actionId, announcedAt: Number(announced), exAt: Number(ex), payAt: Number(pay),
          observedAt: Number(observed), currency, amountPerShare: BigInt(rate),
          state: state as PortfolioCapitalReturn['state'],
          entitledShares: shares === '' ? null : Number(shares), amount: amount === '' ? null : BigInt(amount),
          basis: basisObserved === undefined ? null : {
            observedAt: Number(basisObserved), before: BigInt(before), reduction: BigInt(reduction),
            remaining: BigInt(remaining), excess: BigInt(excess),
          },
        };
      });
    },
    compareEquityConcentration(membership, holdings, prices, terms, before, after) {
      portfolioTimesInput([before.effectiveAt, before.knownAt, after.effectiveAt, after.knownAt],
        membership, holdings, prices, terms);
      const text = decoder.decode(output(api.mw_compare_equity_concentration(encoder.encode(membership).length,
        encoder.encode(holdings).length, encoder.encode(prices).length)));
      if (!text) return [];
      const side = (present: string, mark: string, rank: string, weight: string): ConcentrationSide | null =>
        present ? { mark: mark ? BigInt(mark) : null, rank: rank ? Number(rank) : null,
          weightMicros: weight ? BigInt(weight) : null } : null;
      return text.slice(0, -1).split('\n').map(line => {
        const [currency, listing, hasBefore, beforeMark, beforeRank, beforeWeight,
          hasAfter, afterMark, afterRank, afterWeight, change, improvement] = line.split('\t');
        return { currency: currency || null, listing,
          before: side(hasBefore, beforeMark, beforeRank, beforeWeight),
          after: side(hasAfter, afterMark, afterRank, afterWeight),
          weightChangeMicros: change ? BigInt(change) : null,
          rankImprovement: improvement ? Number(improvement) : null };
      });
    },
    comparePortfolioCapitalReturns(membership, holdings, returns, basis, baseline, comparison) {
      portfolioTimesInput(
        [baseline.effectiveAt, baseline.knownAt, comparison.effectiveAt, comparison.knownAt],
        membership, holdings, returns, basis,
      );
      const text = decoder.decode(output(api.mw_compare_portfolio_capital_returns(
        encoder.encode(membership).length, encoder.encode(holdings).length, encoder.encode(returns).length,
      )));
      if (!text) return [];
      const optionalAmount = (value: string) => value === '' ? null : BigInt(value);
      const amounts = ([receivable, cash, basisReduction, aboveBasis]: string[]): CapitalReturnAmounts => ({
        receivable: optionalAmount(receivable), cash: optionalAmount(cash),
        basisReduction: optionalAmount(basisReduction), aboveBasis: optionalAmount(aboveBasis),
      });
      const observation = ([state, currency, observed, basisObserved]: string[]): CapitalReturnObservation | null => state ? {
        state: state as CapitalReturnObservation['state'], currency, observedAt: Number(observed),
        basisObservedAt: basisObserved === '' ? null : Number(basisObserved),
      } : null;
      return text.slice(0, -1).split('\n').map(line => {
        const [listingId, actionId, currency, ...values] = line.split('\t');
        return {
          listingId, actionId, currency, baseline: observation(values.slice(0, 4)),
          comparison: observation(values.slice(4, 8)),
          baselineAmounts: amounts(values.slice(8, 12)), comparisonAmounts: amounts(values.slice(12, 16)),
          change: amounts(values.slice(16, 20)),
        };
      });
    },
    portfolioRightsAsOf(membership, holdings, reports, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, reports);
      const text = decoder.decode(output(api.mw_portfolio_rights_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [offeringId, listingId, observed, phase, subscriptionListing, announced, entitled, opens, expires,
          numerator, denominator, currency, price, policy, holdingEffective, holdingObserved, held,
          exactNumerator, exactDenominator, whole, cost] = line.split('\t');
        return {
          offeringId, listingId, observedAt: Number(observed), phase: phase as PortfolioRightsOffering['phase'],
          terms: subscriptionListing ? { subscriptionListing, announcedAt: Number(announced), entitlementAt: Number(entitled),
            opensAt: Number(opens), expiresAt: Number(expires), numerator: Number(numerator), denominator: Number(denominator),
            currency, subscriptionPrice: BigInt(price), fractionPolicy: policy as NonNullable<PortfolioRightsOffering['terms']>['fractionPolicy'],
          } : null,
          entitlement: holdingEffective ? { holdingEffectiveAt: Number(holdingEffective), holdingObservedAt: Number(holdingObserved),
            heldShares: Number(held), exactShares: { numerator: BigInt(exactNumerator), denominator: Number(exactDenominator) },
            subscribableShares: BigInt(whole), fullSubscriptionCost: BigInt(cost),
          } : null,
        };
      });
    },
    portfolioRightsExercisesAsOf(membership, holdings, rights, exercises, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, rights, exercises);
      const text = decoder.decode(output(api.mw_portfolio_rights_exercises_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length, encoder.encode(rights).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [offeringId, exerciseId, effective, observed, stage, requested, requestedShares, assessment,
          capacity, allocated, currency, unitPrice, settled, paid, variance] = line.split('\t');
        return {
          offeringId, exerciseId, effectiveAt: Number(effective), observedAt: Number(observed),
          requestedAt: Number(requested), requestedShares: BigInt(requestedShares),
          stage: stage as PortfolioRightsExercise['stage'], assessment: assessment as PortfolioRightsExercise['assessment'],
          basicCapacity: capacity === '' ? null : BigInt(capacity),
          allocation: currency ? { shares: BigInt(allocated), currency, unitPrice: BigInt(unitPrice) } : null,
          settlement: settled === undefined ? null : { shares: BigInt(settled), cashPaid: BigInt(paid), cashVariance: BigInt(variance) },
        };
      });
    },
    portfolioRightsSettlementJournal(membership, rights, exercises, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, rights, exercises);
      const text = decoder.decode(output(api.mw_portfolio_rights_settlement_journal(
        encoder.encode(membership).length, encoder.encode(rights).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [offeringId, exerciseId, effective, observed, stage, currency, delta, balance] = line.split('\t');
        return {
          offeringId, exerciseId, effectiveAt: Number(effective), observedAt: Number(observed),
          stage: stage as RightsSettlementPosting['stage'], delta: BigInt(delta), balance: BigInt(balance),
          asset: currency ? { kind: 'cash', currency } : { kind: 'shares' },
        };
      });
    },
    portfolioSuccessorDeliveryLedger(membership, holdings, terms, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, terms);
      const text = decoder.decode(output(api.mw_portfolio_successor_delivery_ledger(
        encoder.encode(membership).length, encoder.encode(holdings).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => decodeSuccessorDelivery(line.split('\t')));
    },
    portfolioSpinOffsAsOf(membership, holdings, reports, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, reports);
      const text = decoder.decode(output(api.mw_portfolio_spin_offs_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length,
      )));
      if (!text) return [];
      const optional = (value: string) => value === '' ? null : Number(value);
      return text.slice(0, -1).split('\n').map(line => {
        const [id, parent, child, announced, entitlement, distribution, observed, rateNumerator,
          rateDenominator, state, parentShares, positionEffective, positionObserved, numerator, denominator] = line.split('\t');
        return {
          id, parent, child, announcedAt: Number(announced), entitlementAt: Number(entitlement),
          distributionAt: Number(distribution), observedAt: Number(observed),
          rate: { numerator: Number(rateNumerator), denominator: Number(rateDenominator) },
          state: state as PortfolioSpinOff['state'], entitledParentShares: optional(parentShares),
          positionEffectiveAt: optional(positionEffective), positionObservedAt: optional(positionObserved),
          childShares: numerator === '' ? null : { numerator: BigInt(numerator), denominator: Number(denominator) },
        };
      });
    },
    portfolioSpinOffCashAsOf(membership, holdings, reports, cashTerms, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, reports, cashTerms);
      const text = decoder.decode(output(api.mw_portfolio_spin_off_cash_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length, encoder.encode(reports).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [id, child, state, fraction, currency, pay, observed, rate, amount] = line.split('\t');
        const [numerator, denominator] = fraction.split('/');
        return {
          id, child, state: state as PortfolioSpinOffCash['state'],
          fractionalShares: fraction ? { numerator: BigInt(numerator), denominator: Number(denominator) } : null,
          terms: currency ? { currency, payAt: Number(pay), observedAt: Number(observed), rate: BigInt(rate) } : null,
          amount: amount === '' ? null : BigInt(amount),
        };
      });
    },
    portfolioSpinOffBasisAsOf(membership, holdings, reports, basisTerms, effectiveAt, knownAt) {
      portfolioInput(effectiveAt, knownAt, membership, holdings, reports, basisTerms);
      const text = decoder.decode(output(api.mw_portfolio_spin_off_basis_as_of(
        encoder.encode(membership).length, encoder.encode(holdings).length, encoder.encode(reports).length,
      )));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [id, parent, child, distributed, state, currency, observed, original, fraction, retained, childBasis] = line.split('\t');
        return {
          id, parent, child, distributionAt: Number(distributed), state: state as PortfolioSpinOffBasis['state'],
          terms: currency ? {
            currency, observedAt: Number(observed), originalParentBasis: BigInt(original), childBasisFraction: BigInt(fraction),
          } : null,
          allocation: retained === '' ? null : { retainedParentBasis: BigInt(retained), childBasis: BigInt(childBasis) },
        };
      });
    },
    compareUniverseRanks(membership, prices, baselineAt, before, after) {
      screenInput([baselineAt, before.effective, before.known, after.effective, after.known], membership, prices);
      const text = decoder.decode(output(api.mw_compare_universe_ranks(encoder.encode(membership).length)));
      if (!text) return [];
      const leg = ([change, rank, value, baseline, current]: string[]): ScreenComparisonLeg => {
        const [state, changeId, effective, observed] = change.split(',');
        return {
          membership: change ? { state: universeStatuses[Number(state)], changeId,
            effectiveAt: Number(effective), observedAt: Number(observed) } : null,
          rank: rank === '' ? null : Number(rank),
          returnUnits: value === '' ? null : BigInt(value),
          baseline: decodeScreenPrice(baseline),
          current: decodeScreenPrice(current),
        };
      };
      return text.slice(0, -1).split('\n').map(line => {
        const fields = line.split('\t');
        return { listingId: fields[0], instrument: fields[1], before: leg(fields.slice(2, 7)),
          after: leg(fields.slice(7, 12)), rankMove: fields[12] === '' ? null : Number(fields[12]) };
      });
    },
    universeScreen(membership, prices, baselineAt, effectiveAt, knownAt) {
      screenInput([baselineAt, effectiveAt, knownAt], membership, prices);
      const membershipBytes = encoder.encode(membership).length;
      const text = decoder.decode(output(api.mw_universe_screen(membershipBytes)));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const [listingId, instrument, rank, change, baseline, current] = line.split('\t');
        return { listingId, instrument, rank: rank === '' ? null : Number(rank),
          returnUnits: change === '' ? null : BigInt(change), baseline: decodeScreenPrice(baseline),
          current: decodeScreenPrice(current) };
      });
    },
    relativeSeries(membership, prices, leftId, rightId, baselineAt, effectiveAt, knownAt) {
      putPairInput(membership, prices, leftId, rightId, [baselineAt, effectiveAt, knownAt]);
      const text = decoder.decode(output(api.mw_relative_series(encoder.encode(membership).length)));
      const leg = (state: string, close: string, change: string): RelativeLegPoint => ({
        membership: state === '' ? null : universeStatuses[Number(state)],
        close: decodeScreenPrice(close),
        returnUnits: change === '' ? null : BigInt(change),
      });
      return text.slice(0, -1).split('\n').map(line => {
        const [at, leftState, leftClose, leftReturn, rightState, rightClose, rightReturn, spread] = line.split('\t');
        return { effectiveAt: Number(at), left: leg(leftState, leftClose, leftReturn),
          right: leg(rightState, rightClose, rightReturn), spreadUnits: spread === '' ? null : BigInt(spread) };
      });
    },
    listingRisk(membership, prices, leftId, rightId, { from, through, known, intervalSeconds, windowPeriods, volatilityPeriods }) {
      if ([intervalSeconds, windowPeriods, volatilityPeriods].some(value =>
        !Number.isInteger(value) || value < 1 || value > 0xffffffff)) {
        throw new Error('Use positive whole numbers for the risk window, interval and volatility scale.');
      }
      putPairInput(membership, prices, leftId, rightId, [from, through, known]);
      const out = output(api.mw_listing_risk(encoder.encode(membership).length, intervalSeconds, windowPeriods, volatilityPeriods));
      return Array.from({ length: out.byteLength / 56 }, (_, index) => {
        const start = index * 56;
        const metric = (offset: number) => {
          const value = out.getFloat64(start + offset, true);
          return Number.isFinite(value) ? value : null;
        };
        return {
          fromAt: Number(out.getBigInt64(start, true)), throughAt: Number(out.getBigInt64(start + 8, true)),
          expectedReturns: out.getUint32(start + 16, true), leftReturns: out.getUint32(start + 20, true),
          rightReturns: out.getUint32(start + 24, true), pairedReturns: out.getUint32(start + 28, true),
          leftVolatility: metric(32), rightVolatility: metric(40), correlation: metric(48),
        };
      });
    },
    crossSectionReplay(membership, prices, liquidity, from, through, known, config, actions) {
      const settings = crossSectionSettings(config);
      const membershipBytes = encoder.encode(membership).length;
      const priceBytes = encoder.encode(prices).length;
      let bytes: DataView;
      if (actions) {
        const { accountCurrency, dividends, delistings, successorShares = '', capitalReturns = '' } = actions;
        if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error('Use a three-letter uppercase paper account currency.');
        screenInput([from, through, known], settings,
          accountCurrency, '\n', membership, prices, liquidity, dividends, delistings, successorShares, capitalReturns);
        const liquidityBytes = encoder.encode(liquidity).length;
        const dividendBytes = encoder.encode(dividends).length;
        bytes = output(capitalReturns
          ? api.mw_cross_section_with_distributions(membershipBytes, priceBytes, liquidityBytes,
            dividendBytes, encoder.encode(delistings).length, encoder.encode(successorShares).length, 0)
          : successorShares
          ? api.mw_cross_section_with_successors(membershipBytes, priceBytes, liquidityBytes,
            dividendBytes, encoder.encode(delistings).length, 0)
          : api.mw_cross_section_actions(membershipBytes, priceBytes, liquidityBytes, dividendBytes));
      } else {
        screenInput([from, through, known], settings, membership, prices, liquidity);
        bytes = output(api.mw_cross_section_replay(membershipBytes, priceBytes));
      }
      const text = decoder.decode(bytes);
      const [header, ...rows] = text.slice(0, -1).split('\n');
      const [tag, cash, reserved, fees, turnover, equity] = header.split('\t');
      if (tag !== 'H') throw new Error('Invalid cross-sectional replay summary.');
      const report: CrossSectionReport = { cash: BigInt(cash), reservedCash: BigInt(reserved),
        fees: BigInt(fees), turnover: BigInt(turnover), equity: equity ? BigInt(equity) : null,
        decisions: [], positions: [], receipts: [], dividendPostings: [], delistingClaims: [], delistingPostings: [],
        successorClaims: [], capitalReturnClaims: [], capitalReturnPostings: [] };
      for (const row of rows) {
        const [type, a, b, c, d] = row.split('\t', 5);
        if (type === 'D') report.decisions.push({ at: Number(a), eligible: Number(b),
          missing: Number(c), selected: d ? d.split(',') : [] });
        else if (type === 'P') report.positions.push({ listingId: a, shares: BigInt(b),
          cost: BigInt(c), mark: d ? BigInt(d) : null });
        else if (type === 'E') report.receipts.push({ listingId: a, side: b,
          ...decodePaperReceipt(row.split('\t').slice(3)) });
        else if (type === 'V' || type === 'R') {
          const [, listingId, actionId, posted, observed, ex, pay, shares, currency, cash, receipt] = row.split('\t');
          const posting = { listingId, postedAt: Number(posted),
            observedAt: Number(observed), exAt: Number(ex), payAt: Number(pay), shares: BigInt(shares),
            currency, cashDelta: BigInt(cash), receiptId: receipt || null };
          if (type === 'V') report.dividendPostings.push({ ...posting, dividendId: actionId });
          else report.capitalReturnPostings.push({ ...posting, actionId });
        } else if (type === 'K') {
          const [, listingId, actionId, observed, ex, pay, shares, currency, amount, state, receipt] = row.split('\t');
          report.capitalReturnClaims.push({ listingId, actionId, observedAt: Number(observed), exAt: Number(ex),
            payAt: Number(pay), shares: BigInt(shares), currency, amount: BigInt(amount), state,
            positionReceiptId: receipt || null });
        } else if (type === 'C' || type === 'S') {
          const [, listingId, changeId, effective, observed, terms, pay, shares, state, currency,
            amount, posted, cash, receipt] = row.split('\t');
          const claim = { listingId, changeId, effectiveAt: Number(effective), observedAt: Number(observed),
            termsObservedAt: terms ? Number(terms) : null, payAt: pay ? Number(pay) : null, shares: BigInt(shares),
            state, currency: currency || null, amount: amount ? BigInt(amount) : null };
          if (type === 'C') report.delistingClaims.push(claim);
          else report.delistingPostings.push({ claim, postedAt: Number(posted), cashDelta: BigInt(cash),
            receiptId: receipt || null });
        } else if (type === 'X') {
          const [, listingId, changeId, effective, observed, position, entitled, successorListing,
            terms, deliver, ratio, shares, state, markObserved, mark, value] = row.split('\t');
          report.successorClaims.push({ listingId, changeId, effectiveAt: Number(effective),
            observedAt: Number(observed), positionAt: Number(position), entitledShares: BigInt(entitled),
            successorListing, termsObservedAt: Number(terms), deliverAt: deliver ? Number(deliver) : null,
            ratio, shares, state, markObservedAt: markObserved ? Number(markObserved) : null,
            mark: mark ? BigInt(mark) : null, value: value ? BigInt(value) : null });
        }
        else throw new Error('Invalid cross-sectional replay row.');
      }
      return report;
    },
    crossSectionSuccessorDeliveryJournal(membership, prices, liquidity, from, through, known, config, actions) {
      const { accountCurrency, dividends, delistings, successorShares = '', capitalReturns = '' } = actions;
      if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error('Use a three-letter uppercase paper account currency.');
      screenInput([from, through, known], crossSectionSettings(config), accountCurrency, '\n',
        membership, prices, liquidity, dividends, delistings, successorShares, capitalReturns);
      const lengths = [
        encoder.encode(membership).length, encoder.encode(prices).length, encoder.encode(liquidity).length,
        encoder.encode(dividends).length, encoder.encode(delistings).length,
      ] as const;
      const text = decoder.decode(output(capitalReturns
        ? api.mw_cross_section_with_distributions(...lengths, encoder.encode(successorShares).length, 2)
        : api.mw_cross_section_successor_delivery_journal(...lengths)));
      if (!text) return [];
      return text.slice(0, -1).split('\n').map(line => {
        const fields = line.split('\t');
        return { ...decodeSuccessorDelivery(fields), positionReceiptId: fields[15] };
      });
    },
    crossSectionWalk(membership, prices, liquidity, from, through, known, config, walk, actions) {
      const training = walk.trainingDecisions.trim();
      const test = walk.testDecisions.trim();
      const candidates = walk.candidates.split(',').map(candidate => candidate.trim());
      if (!/^\d+$/.test(training) || !/^\d+$/.test(test) ||
          candidates.length < 2 || candidates.length > 16 || candidates.some(candidate => !/^\d+:\d+$/.test(candidate))) {
        throw new Error('Use whole decision counts and 2–16 lookback:top-listings candidates.');
      }
      const currency = actions?.accountCurrency ?? '';
      if (actions && !/^[A-Z]{3}$/.test(currency)) throw new Error('Use a three-letter uppercase paper account currency.');
      const dividends = actions?.dividends ?? '';
      const delistings = actions?.delistings ?? '';
      const successors = actions?.successorShares ?? '';
      const capitalReturns = actions?.capitalReturns ?? '';
      screenInput([from, through, known], crossSectionSettings(config), currency, '\n',
        [training, test, ...candidates].join(','), '\n', membership, prices, liquidity, dividends,
        delistings, successors, capitalReturns);
      const membershipBytes = encoder.encode(membership).length;
      const priceBytes = encoder.encode(prices).length;
      const liquidityBytes = encoder.encode(liquidity).length;
      const dividendBytes = encoder.encode(dividends).length;
      const result = decoder.decode(output(capitalReturns
        ? api.mw_cross_section_with_distributions(membershipBytes, priceBytes, liquidityBytes,
          dividendBytes, encoder.encode(delistings).length, encoder.encode(successors).length, 1)
        : successors
        ? api.mw_cross_section_with_successors(membershipBytes, priceBytes, liquidityBytes,
          dividendBytes, encoder.encode(delistings).length, 1)
        : api.mw_cross_section_walk(membershipBytes, priceBytes, liquidityBytes, dividendBytes)));
      const folds: CrossSectionFold[] = [];
      for (const row of result.trimEnd().split('\n').filter(Boolean)) {
        const [tag, ...fields] = row.split('\t');
        if (tag === 'F') {
          const [trainingFrom, trainingThrough, testFrom, testThrough] = fields.map(Number);
          folds.push({ trainingFrom, trainingThrough, testFrom, testThrough, trainingScores: [], testScore: null });
          continue;
        }
        const fold = folds.at(-1);
        if (!fold || (tag !== 'T' && tag !== 'O')) throw new Error('Invalid cross-sectional walk-forward row.');
        const [lookback, top, equity, cash, turnover, fees, fills, decisions, ranked, missing] = fields;
        const score = { lookbackSeconds: Number(lookback), topListings: Number(top), equity: equity ? BigInt(equity) : null,
          cash: BigInt(cash), turnover: BigInt(turnover), fees: BigInt(fees), acceptedFills: Number(fills),
          decisions: Number(decisions), ranked: Number(ranked), missing: Number(missing) };
        if (tag === 'T') fold.trainingScores.push(score);
        else fold.testScore = score;
      }
      return folds;
    },
    portfolioScenarios(membership, prices, allocations, query) {
      const { from, through, known, intervalSeconds, startingValue, feeBasisPoints, seed, paths, horizon, blockSize = 1 } = query;
      if (allocations.some(entry => !validListingId(entry.listingId) || !Number.isInteger(entry.weightBasisPoints))) {
        throw new Error('Choose valid listing IDs and whole weights in basis points.');
      }
      if ([intervalSeconds, feeBasisPoints, paths, horizon, blockSize].some(value => !Number.isSafeInteger(value)) ||
          seed < 0n || seed > 0xffff_ffff_ffff_ffffn || /[\r\n]/.test(startingValue)) {
        throw new Error('Use valid scenario settings and an unsigned 64-bit seed.');
      }
      const weights = allocations.map(entry => entry.listingId + '=' + entry.weightBasisPoints).join('\t');
      const sampling = blockSize === 1 ? horizon : horizon + ':' + blockSize;
      screenInput([from, through, known], [intervalSeconds, startingValue, feeBasisPoints, seed, paths, sampling, weights, ''].join('\n'),
        membership, prices);
      const text = decoder.decode(output(api.mw_portfolio_scenarios(encoder.encode(membership).length)));
      const [header, ...lines] = text.trimEnd().split('\n');
      const [tag, expected, eligible, losses, block = '1', blocks = eligible] = header.split('\t');
      if (tag !== 'H') throw new Error('Invalid portfolio scenario summary from the calculation engine.');
      const report: JointScenarioReport = { expectedVectors: Number(expected), eligibleVectors: Number(eligible),
        blockSize: Number(block), eligibleBlocks: Number(blocks),
        lossPaths: Number(losses), coverage: [], endingValue: [0n, 0n, 0n], drawdownMillionths: [0n, 0n, 0n],
        fees: [0n, 0n, 0n], paths: [] };
      for (const line of lines) {
        const [kind, a, b, c] = line.split('\t');
        if (kind === 'A') {
          report.coverage.push({ listingId: a, weightBasisPoints: Number(b), knownReturns: Number(c) });
        } else if (kind === 'V') {
          report.endingValue = [BigInt(a), BigInt(b), BigInt(c)];
        } else if (kind === 'D') {
          report.drawdownMillionths = [BigInt(a), BigInt(b), BigInt(c)];
        } else if (kind === 'F') {
          report.fees = [BigInt(a), BigInt(b), BigInt(c)];
        } else if (kind === 'P') {
          report.paths.push({ endingValue: BigInt(a), drawdownMillionths: BigInt(b), fees: BigInt(c) });
        } else {
          throw new Error('Invalid portfolio scenario record from the calculation engine.');
        }
      }
      return report;
    },
    sectorHeatmap(membership, prices, sectors, baselineAt, effectiveAt, knownAt) {
      screenInput([baselineAt, effectiveAt, knownAt], membership, prices, sectors);
      const text = decoder.decode(output(api.mw_sector_heatmap(
        encoder.encode(membership).length, encoder.encode(prices).length,
      )));
      return decodeHeatmap(text);
    },
    compareSectorHeatmaps(membership, prices, sectors, baselineAt, before, after) {
      screenInput([baselineAt, before.effective, before.known, after.effective, after.known], membership, prices, sectors);
      const text = decoder.decode(output(api.mw_compare_sector_heatmaps(
        encoder.encode(membership).length, encoder.encode(prices).length,
      )));
      const [left, right] = text.split('\n\n');
      if (right === undefined) throw new Error('Incomplete sector comparison from the calculation engine.');
      return { before: decodeHeatmap(left), after: decodeHeatmap(right) };
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
      return financialQuery(filings, caps, issuer, at, known, false).valuation;
    },
    financialSnapshot(filings, caps, issuer, at, known) {
      const { valuation, quarters, trailing, quarterlyMultiples } = financialQuery(filings, caps, issuer, at, known, true);
      const [priceEarnings, priceSales, priceBook] = quarterlyMultiples;
      if (!trailing || quarterlyMultiples.length !== 3 || !priceBook)
        throw new Error('Incomplete quarterly coverage from the calculation engine.');
      return { ...valuation, quarters, trailing, quarterlyValuation: { priceEarnings, priceSales, priceBook } };
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
      checkOptionCutoffs(effective, known, maxAge);
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
          const analyticsFields = status === 'ok' ? 7 : 0;
          const exerciseStyle = values.length === analyticsFields ? 'european' : values.pop();
          if ((exerciseStyle !== 'european' && exerciseStyle !== 'american') || values.length !== analyticsFields)
            throw new Error('Invalid option exercise style from the calculation engine.');
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
          snapshot.options.push({ id, expiration: Number(expiration), strike: BigInt(strike), side, exerciseStyle,
            at: Number(at), observedAt: Number(observedAt),
            bid: bid === '' ? null : BigInt(bid), ask: ask === '' ? null : BigInt(ask), result });
        } else {
          throw new Error('Invalid option row from the calculation engine.');
        }
      }
      return snapshot;
    },
    americanOptionPrice(underlying, quotes, contract, effective, known, maxAge, volatility, steps) {
      if (!Number.isFinite(volatility) || volatility < 0 || volatility > 10)
        throw new Error('Use annual volatility from 0 to 10.');
      const bytes = americanOptionInput(underlying, quotes, contract, effective, known, maxAge, steps);
      const text = decoder.decode(output(api.mw_american_option_price(bytes, maxAge, volatility, steps)));
      const [status, value] = text.split('\t');
      if (status === 'value' && value && Number.isFinite(Number(value))) return Number(value);
      const issue = unavailableOptions.find(candidate => candidate === status);
      if (issue) return issue;
      throw new Error('Invalid American option price from the calculation engine.');
    },
    americanOptionImplied(underlying, quotes, contract, effective, known, maxAge, steps) {
      const bytes = americanOptionInput(underlying, quotes, contract, effective, known, maxAge, steps);
      const text = decoder.decode(output(api.mw_american_option_implied(bytes, maxAge, steps)));
      const [status, volatility, price] = text.split('\t');
      if (status === 'value' && volatility && price && Number.isFinite(Number(volatility)) && Number.isFinite(Number(price)))
        return { volatility: Number(volatility), price: Number(price) };
      const issue = unavailableOptions.find(candidate => candidate === status);
      if (issue) return issue;
      throw new Error('Invalid American implied volatility from the calculation engine.');
    },
    americanOptionCashPrice(underlying, quotes, cash, contract, effective, known, maxAge, volatility, steps) {
      if (!Number.isFinite(volatility) || volatility < 0 || volatility > 10)
        throw new Error('Use annual volatility from 0 to 10.');
      const bytes = americanOptionInput(underlying, quotes + cash, contract, effective, known, maxAge, steps);
      const payload = decoder.decode(output(api.mw_american_option_cash_price(
        bytes, encoder.encode(quotes).length, maxAge, volatility, steps,
      )));
      return parseCashOption(payload);
    },
    americanOptionCashImplied(underlying, quotes, cash, contract, effective, known, maxAge, steps) {
      const bytes = americanOptionInput(underlying, quotes + cash, contract, effective, known, maxAge, steps);
      const payload = decoder.decode(output(api.mw_american_option_cash_implied(
        bytes, encoder.encode(quotes).length, maxAge, steps,
      )));
      const result = parseCashOption(payload);
      if (typeof result === 'string') return result;
      if (result.volatility === undefined)
        throw new Error('Missing cash dividend implied volatility from the calculation engine.');
      return { ...result, volatility: result.volatility };
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
    paperDepthIndex(instrument, controls, depth) {
      const bytes = output(api.mw_paper_depth_index(putPaperDepthInput(instrument, controls, depth)));
      return Array.from({ length: bytes.byteLength / 8 }, (_, index) => Number(bytes.getBigInt64(index * 8, true)));
    },
    paperDepthReplay(instrument, controls, depth, cutoff, config) {
      if (cutoff.length !== 20 || /[\n\r]/.test(cutoff)) {
        throw new Error('Paper cutoff requires a YYYY-MM-DDTHH:MM:SSZ timestamp.');
      }
      const controlsBytes = putPaperDepthInput(instrument, controls, depth, [cutoff, paperSettings(config)]);
      const text = decoder.decode(output(api.mw_paper_depth_replay(controlsBytes)));
      const [status, received, ...ledger] = text.split('\n');
      const [sequence, event, observed] = received.split('\t');
      return { ledger: decodePaper(ledger.join('\n')), depthStatus: decodeDepthStatus(status),
        lastDepth: sequence ? { sequence: BigInt(sequence), eventAt: Number(event), observedAt: Number(observed) } : null };
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
    recordedBacktest(instrument, calendar, bars, trades, interval, query) {
      validateInterval(interval);
      const header = timedBacktestHeader(instrument, query);
      const files = putBacktestInput(calendar, bars, trades, [header]);
      const bytes = output(api.mw_recorded_backtest(files.calendarBytes, files.barBytes, interval));
      return decodeBacktest(decoder.decode(bytes).slice(0, -1).split('\n'));
    },
    formulaBacktest(instrument, calendar, bars, trades, interval, query) {
      validateInterval(interval);
      const sources = [query.entry, query.exit];
      if (sources.some(source => source.length > 2048)) throw new Error('Formula exceeds 2,048 source bytes.');
      const [entry, exit] = sources.map(source => encoder.encode(source));
      if (entry.length > 2048 || exit.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
      const header = timedBacktestHeader(instrument, query);
      const library = encodeFormulaFunctions(query.functions);
      const files = putBacktestInput(calendar, bars, trades, [header, entry, exit, ...library.chunks]);
      const bytes = output(library.bytes
        ? api.mw_formula_backtest_library(files.calendarBytes, files.barBytes, entry.length, exit.length, library.bytes, interval)
        : api.mw_formula_backtest(files.calendarBytes, files.barBytes, entry.length, exit.length, interval));
      return decodeFormulaBacktest(decoder.decode(bytes).slice(0, -1).split('\n'), api.mw_formula_version());
    },
    formulaWalk(instrument, calendar, bars, trades, interval, query) {
      validateInterval(interval);
      const { candidates, trainingBars, testBars } = query;
      if (![trainingBars, testBars].every(count => Number.isSafeInteger(count) && count >= 2 && count <= 5000)) {
        throw new Error('Formula training and test windows need 2–5,000 observed bars.');
      }
      if (candidates.length < 2 || candidates.length > 16 ||
          candidates.some(row => !/^[A-Za-z0-9._-]{1,40}$/.test(row.id))) {
        throw new Error('Supply 2–16 candidates with unique ASCII strategy IDs.');
      }
      const formulas: Uint8Array[] = [];
      for (const { id, entry, exit, functions } of candidates) {
        if (entry.length > 2048 || exit.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
        const enter = encoder.encode(entry);
        const leave = encoder.encode(exit);
        if (enter.length > 2048 || leave.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
        const library = encodeFormulaFunctions(functions);
        const sizes = library.bytes ? [id, enter.length, leave.length, library.bytes] : [id, enter.length, leave.length];
        formulas.push(encoder.encode(sizes.join('\t') + '\n'), enter, leave, ...library.chunks);
      }
      const header = timedBacktestHeader(instrument, query);
      const settings = encoder.encode(trainingBars + ',' + testBars + '\n');
      const candidateBytes = formulas.reduce((sum, bytes) => sum + bytes.length, 0);
      const files = putBacktestInput(calendar, bars, trades, [header, settings, ...formulas]);
      const bytes = output(api.mw_formula_walk(files.calendarBytes, files.barBytes, candidateBytes, interval));
      const text = decoder.decode(bytes);
      if (!text) return [];
      const version = api.mw_formula_version();
      return text.slice(2, -1).split('\nF\t').map(block => {
        const [dates, ...lines] = block.split('\n');
        const [trainingStart, trainingEnd, testStart, testEnd] = dates.split('\t').map(Number);
        const scores: FormulaWalkScore[] = [];
        let testScore: FormulaWalkScore | null = null;
        let body = 0;
        while (lines[body]?.startsWith('T\t') || lines[body]?.startsWith('O\t')) {
          const [tag, id, equity, drawdown, turnover, fees, fills, unavailable] = lines[body++].split('\t');
          const score = { id, equity: BigInt(equity), drawdown: BigInt(drawdown), turnover: BigInt(turnover),
            fees: BigInt(fees), fills: Number(fills), unavailableConditions: Number(unavailable) };
          if (tag === 'T') scores.push(score);
          else testScore = score;
        }
        if (!testScore) throw new Error('Missing formula walk-forward test score.');
        return { trainingStart, trainingEnd, testStart, testEnd, scores, testScore,
          report: decodeFormulaBacktest(lines.slice(body), version) };
      });
    },
    validateFormulaStrategy(languageVersion, entry, exit, config, functions) {
      if (!Number.isInteger(languageVersion) || languageVersion < 1 || languageVersion > 0xffffffff) {
        throw new Error('Unsupported formula language version.');
      }
      if (entry.length > 2048 || exit.length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
      const entryBytes = encoder.encode(entry).length;
      if (entryBytes > 2048 || encoder.encode(exit).length > 2048) throw new Error('Formula exceeds 2,048 source bytes.');
      const library = encodeFormulaFunctions(functions);
      if (!library.bytes) {
        textInput([...backtestSettings(config), entry + exit].join('\n'));
        output(api.mw_validate_formula_strategy(languageVersion, entryBytes));
      } else {
        const header = encoder.encode([...backtestSettings(config), ''].join('\n'));
        const formulas = encoder.encode(entry + exit);
        const dest = input(header.length + library.bytes + formulas.length);
        const payload = new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength);
        let offset = 0;
        for (const chunk of [header, ...library.chunks, formulas]) {
          payload.set(chunk, offset);
          offset += chunk.length;
        }
        output(api.mw_validate_formula_strategy_library(languageVersion, entryBytes, library.bytes));
      }
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
      return decodeDividendEvents(decoder.decode(output(api.mw_dividend_ledger(entitledShares))));
    },
    dividendPositionLedger(instrument, dividends, positions) {
      textInput(instrument + '\n' + dividends + positions);
      return decodeDividendEvents(decoder.decode(output(api.mw_dividend_position_ledger(encoder.encode(dividends).length))), true);
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
        putBar(dest, offset, bar, 'Split adjustment');
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
