import { instantiateMarketCore } from './core.js'
import type { Bar, EquityConcentration, EquityTargetDrift, FormulaFunction, FormulaResult, ListingDownsideRiskPoint, ListingRiskQuery, MarketCore, PortfolioAllocationQuery, PortfolioAllocationReport } from './core.js'

export type {
  AmericanCashImpliedPrice, AmericanCashPrice, AmericanImplied, Bar, CandlePatternHit, CloseOrderStatistics, DepthLevel, DepthStamp, DepthStatus, DepthSweep,
  DividendEvent, DividendMovement,
  CrossSectionActions, CrossSectionConfig, CrossSectionDividendPosting, CrossSectionReport,
  EquityConcentration, EquityTargetDrift, Filing, FinancialIssuer, FinancialSnapshot,
  FormulaFunction, FormulaResult, MacroRecord, MacroRelease, MonthlyClose, MonthlyReturn, NotionalBar, OptionAnalytics, OptionCashDividendReport, OptionReport, OptionSnapshot, OptionSource,
  JointScenarioPath, JointScenarioQuery, JointScenarioReport, PortfolioAllocationQuery, PortfolioAllocationReport, PortfolioVarianceQuery, ScenarioAllocation,
  ListingDownsideRiskPoint, ListingRiskQuery, OhlcVolatility,
  FxAmount, FxCurrencyValue, FxTranslation,
  PortfolioSnapshot,
  OptionUnavailable, OptionUnderlying, PaperConfig, PaperDepthSnapshot, PaperSnapshot, QuarterlyValuation,
  ScreenComparisonLeg, ScreenComparisonRow, ScreenCutoff,
  ScalarPluginPoint, ScreenPrice, ScreenRow, TradeClassification, TradeClassificationQuery, TradeSideBasis, TrailingFourQuarters,
  RecordedTradePrint,
  SessionRelativeVolumePoint,
  TimeUnderwaterPoint,
} from './core.js'

export const RESEARCH_SDK_VERSION = 1
export const MARKET_CORE_WASM_URL = new URL('./marketweft_core.wasm', import.meta.url).href

export interface EquityConcentrationSnapshot {
  effectiveAt: number
  knownAt: number
  groups: EquityConcentration[]
}

export interface EquityTargetSnapshot {
  effectiveAt: number
  knownAt: number
  rows: EquityTargetDrift[]
}

export interface PortfolioAllocationSnapshot extends PortfolioAllocationReport {
  fromAt: number
  throughAt: number
  knownAt: number
  intervalSeconds: number
  maximumWeightBasisPoints?: number
}

export interface ListingDownsideRiskSnapshot {
  leftListingId: string
  rightListingId: string
  fromAt: number
  throughAt: number
  knownAt: number
  intervalSeconds: number
  windowPeriods: number
  volatilityPeriods: number
  rows: ListingDownsideRiskPoint[]
}

export interface MarketResearch {
  readonly version: typeof RESEARCH_SDK_VERSION
  parseBars(csv: string): Bar[]
  evaluateFormula(source: string, bars: readonly Bar[], functions?: readonly FormulaFunction[]): FormulaResult
  evaluateScalarPlugin: MarketCore['evaluateScalarPlugin']
  evaluateScalarPluginSeries: MarketCore['evaluateScalarPluginSeries']
  monthlyReturns: MarketCore['monthlyReturns']
  macroIndex: MarketCore['macroIndex']
  macroAsOf: MarketCore['macroAsOf']
  universeScreen: MarketCore['universeScreen']
  compareUniverseRanks: MarketCore['compareUniverseRanks']
  listingDownsideRiskAsOf(membership: string, closes: string, leftListingId: string, rightListingId: string,
    query: ListingRiskQuery): ListingDownsideRiskSnapshot
  portfolioAllocationAsOf(membership: string, closes: string, listingIds: readonly string[],
    query: PortfolioAllocationQuery): PortfolioAllocationSnapshot
  portfolioScenarios: MarketCore['portfolioScenarios']
  portfolioFxAsOf: MarketCore['portfolioFxAsOf']
  portfolioAsOf: MarketCore['portfolioAsOf']
  crossSectionReplay: MarketCore['crossSectionReplay']
  equityConcentrationAsOf(membership: string, holdings: string, closes: string,
    effectiveAt: string, knownAt: string): EquityConcentrationSnapshot
  equityTargetDriftAsOf(membership: string, holdings: string, closes: string, terms: string, targets: string,
    effectiveAt: string, knownAt: string): EquityTargetSnapshot
  recordedDepthSweep: MarketCore['recordedDepthSweep']
  recordedNotionalBars: MarketCore['recordedNotionalBars']
  recordedTradePrints: MarketCore['recordedTradePrints']
  rollingCloseStandardDeviation: MarketCore['rollingCloseStandardDeviation']
  rollingCloseOrderStatistics: MarketCore['rollingCloseOrderStatistics']
  rollingOhlcVolatility: MarketCore['rollingOhlcVolatility']
  easeOfMovement: MarketCore['easeOfMovement']
  negativeVolumeIndex: MarketCore['negativeVolumeIndex']
  leastSquaresMovingAverage: MarketCore['leastSquaresMovingAverage']
  replayCandlePatterns: MarketCore['replayCandlePatterns']
  sessionRelativeVolume: MarketCore['sessionRelativeVolume']
  observedTimeUnderwater: MarketCore['observedTimeUnderwater']
  dividendLedger: MarketCore['dividendLedger']
  dividendPositionLedger: MarketCore['dividendPositionLedger']
  classifyRecordedTrades: MarketCore['classifyRecordedTrades']
  paperDepthIndex: MarketCore['paperDepthIndex']
  paperDepthReplay: MarketCore['paperDepthReplay']
  financialIndex: MarketCore['financialIndex']
  financialSnapshot: MarketCore['financialSnapshot']
  optionIndex: MarketCore['optionIndex']
  optionSnapshot: MarketCore['optionSnapshot']
  americanOptionPrice: MarketCore['americanOptionPrice']
  americanOptionImplied: MarketCore['americanOptionImplied']
  americanOptionCashPrice: MarketCore['americanOptionCashPrice']
  americanOptionCashImplied: MarketCore['americanOptionCashImplied']
}

export async function createResearchEngine(wasm: ArrayBuffer | Uint8Array): Promise<MarketResearch> {
  const input = ArrayBuffer.isView(wasm) ? Uint8Array.from(wasm).buffer : wasm
  const core = await instantiateMarketCore(input)
  return {
    version: RESEARCH_SDK_VERSION,
    parseBars: core.parseCsv,
    evaluateFormula: core.evaluateFormula,
    evaluateScalarPlugin: core.evaluateScalarPlugin,
    evaluateScalarPluginSeries: core.evaluateScalarPluginSeries,
    monthlyReturns: core.monthlyReturns,
    macroIndex: core.macroIndex,
    macroAsOf: core.macroAsOf,
    universeScreen: core.universeScreen,
    compareUniverseRanks: core.compareUniverseRanks,
    listingDownsideRiskAsOf(membership, closes, leftListingId, rightListingId, query) {
      const rows = core.listingDownsideRisk(membership, closes, leftListingId, rightListingId, query)
      return {
        leftListingId, rightListingId, rows,
        fromAt: Date.parse(query.from) / 1000, throughAt: Date.parse(query.through) / 1000,
        knownAt: Date.parse(query.known) / 1000, intervalSeconds: query.intervalSeconds,
        windowPeriods: query.windowPeriods, volatilityPeriods: query.volatilityPeriods,
      }
    },
    portfolioAllocationAsOf(membership, closes, listingIds, query) {
      const report = core.portfolioAllocation(membership, closes, listingIds, query)
      return { ...report, fromAt: Date.parse(query.from) / 1000, throughAt: Date.parse(query.through) / 1000,
        knownAt: Date.parse(query.known) / 1000, intervalSeconds: query.intervalSeconds,
        ...(query.maximumWeightBasisPoints === undefined ? {} : { maximumWeightBasisPoints: query.maximumWeightBasisPoints }) }
    },
    portfolioScenarios: core.portfolioScenarios,
    portfolioFxAsOf: core.portfolioFxAsOf,
    portfolioAsOf: core.portfolioAsOf,
    crossSectionReplay: core.crossSectionReplay,
    equityConcentrationAsOf(membership, holdings, closes, effectiveAt, knownAt) {
      const report = core.portfolioAsOf(membership, holdings, closes, '', effectiveAt, knownAt)
      return { effectiveAt: report.effectiveAt, knownAt: report.knownAt, groups: report.equityConcentration }
    },
    equityTargetDriftAsOf(membership, holdings, closes, terms, targets, effectiveAt, knownAt) {
      if (new TextEncoder().encode(terms).length > 1024 * 1024) throw new Error('Equity target delisting terms exceed 1 MiB.')
      const rows = core.equityTargetDriftAsOf(membership, holdings, closes, terms, targets, effectiveAt, knownAt)
      return { effectiveAt: Date.parse(effectiveAt) / 1000, knownAt: Date.parse(knownAt) / 1000, rows }
    },
    recordedDepthSweep: core.recordedDepthSweep,
    recordedNotionalBars: core.recordedNotionalBars,
    recordedTradePrints: core.recordedTradePrints,
    rollingCloseStandardDeviation: core.rollingCloseStandardDeviation,
    rollingCloseOrderStatistics: core.rollingCloseOrderStatistics,
    rollingOhlcVolatility: core.rollingOhlcVolatility,
    easeOfMovement: core.easeOfMovement,
    negativeVolumeIndex: core.negativeVolumeIndex,
    leastSquaresMovingAverage: core.leastSquaresMovingAverage,
    replayCandlePatterns: core.replayCandlePatterns,
    sessionRelativeVolume: core.sessionRelativeVolume,
    observedTimeUnderwater: core.observedTimeUnderwater,
    dividendLedger: core.dividendLedger,
    dividendPositionLedger: core.dividendPositionLedger,
    classifyRecordedTrades: core.classifyRecordedTrades,
    paperDepthIndex: core.paperDepthIndex,
    paperDepthReplay: core.paperDepthReplay,
    financialIndex: core.financialIndex,
    financialSnapshot: core.financialSnapshot,
    optionIndex: core.optionIndex,
    optionSnapshot: core.optionSnapshot,
    americanOptionPrice: core.americanOptionPrice,
    americanOptionImplied: core.americanOptionImplied,
    americanOptionCashPrice: core.americanOptionCashPrice,
    americanOptionCashImplied: core.americanOptionCashImplied,
  }
}
