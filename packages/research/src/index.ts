import { instantiateMarketCore } from './core.js'
import type { Bar, FormulaFunction, FormulaResult, MarketCore } from './core.js'

export type {
  AmericanCashImpliedPrice, AmericanCashPrice, AmericanImplied, Bar, DepthLevel, DepthStamp, DepthStatus, DepthSweep,
  Filing, FinancialIssuer, FinancialSnapshot,
  FormulaFunction, FormulaResult, MacroRecord, MacroRelease, MonthlyClose, MonthlyReturn, OptionAnalytics, OptionCashDividendReport, OptionReport, OptionSnapshot, OptionSource,
  JointScenarioPath, JointScenarioQuery, JointScenarioReport, ScenarioAllocation,
  OptionUnavailable, OptionUnderlying, PaperConfig, PaperDepthSnapshot, PaperSnapshot, QuarterlyValuation,
  ScreenComparisonLeg, ScreenComparisonRow, ScreenCutoff,
  ScalarPluginPoint, ScreenPrice, ScreenRow, TradeClassification, TradeClassificationQuery, TradeSideBasis, TrailingFourQuarters,
} from './core.js'

export const RESEARCH_SDK_VERSION = 1
export const MARKET_CORE_WASM_URL = new URL('./marketweft_core.wasm', import.meta.url).href

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
  portfolioScenarios: MarketCore['portfolioScenarios']
  recordedDepthSweep: MarketCore['recordedDepthSweep']
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
    portfolioScenarios: core.portfolioScenarios,
    recordedDepthSweep: core.recordedDepthSweep,
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
