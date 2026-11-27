import { instantiateMarketCore } from './core.js'
import type { Bar, FormulaFunction, FormulaResult, MarketCore } from './core.js'

export type {
  AmericanCashImpliedPrice, AmericanCashPrice, AmericanImplied, Bar, Filing, FinancialIssuer, FinancialSnapshot,
  FormulaFunction, FormulaResult, OptionAnalytics, OptionCashDividendReport, OptionReport, OptionSnapshot, OptionSource,
  OptionUnavailable, OptionUnderlying, QuarterlyValuation, ScreenPrice, ScreenRow, TrailingFourQuarters,
} from './core.js'

export const RESEARCH_SDK_VERSION = 1
export const MARKET_CORE_WASM_URL = new URL('./marketweft_core.wasm', import.meta.url).href

export interface MarketResearch {
  readonly version: typeof RESEARCH_SDK_VERSION
  parseBars(csv: string): Bar[]
  evaluateFormula(source: string, bars: readonly Bar[], functions?: readonly FormulaFunction[]): FormulaResult
  universeScreen: MarketCore['universeScreen']
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
    universeScreen: core.universeScreen,
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
