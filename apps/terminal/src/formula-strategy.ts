import type { BacktestConfig, FormulaFunction, MarketCore, PaperConfig } from './market-core'
import { parseFormulaFunctionDefinitions } from './formula-library.ts'

type Execution = 'bars' | 'trades'
type FormatExecution = Omit<BacktestConfig, 'paper' | 'fastWindow' | 'slowWindow'> & { source: Execution }

type StrategyPackage = {
  format: 'marketweft.formula-strategy'
  packageVersion: 1 | 2
  languageVersion: number
  formulas: { entry: string; exit: string }
  execution: FormatExecution
  account: PaperConfig
  functions?: readonly FormulaFunction[]
}

export type FormulaStrategy = {
  languageVersion: number
  entry: string
  exit: string
  source: Execution
  config: BacktestConfig
  functions?: readonly FormulaFunction[]
}

const MAX_V1_BYTES = 32 * 1024
export const MAX_STRATEGY_PACKAGE_BYTES = 64 * 1024
const packageFields = ['format', 'packageVersion', 'languageVersion', 'formulas', 'execution', 'account']
const executionFields = ['targetShares', 'participation', 'slippage', 'limitBuffer', 'maxWait'] as const
const accountFields = ['startingCash', 'positionLimit', 'exposureLimit', 'feePerShare', 'feePerOrder'] as const

function checkFields(input: unknown, label: string, names: readonly string[]): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== names.length || names.some(name => !Object.hasOwn(input, name))) {
    throw new Error('Invalid ' + label + ' fields.')
  }
}

function numericFields<Key extends string>(input: Record<string, unknown>, names: readonly Key[]): Record<Key, string> {
  const settings = {} as Record<Key, string>
  for (const name of names) {
    const value = input[name]
    if (typeof value !== 'string' || !value.trim() || /[,\r\n]/.test(value)) {
      throw new Error('Invalid numeric strategy setting ' + name + '.')
    }
    settings[name] = value
  }
  return settings
}

export function serializeFormulaStrategy(strategy: FormulaStrategy) {
  const { languageVersion, entry, exit, source, config, functions } = strategy
  const version = functions?.length ? 2 : 1
  const { targetShares, participation, slippage, limitBuffer, maxWait } = config
  const { startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder } = config.paper
  const value: StrategyPackage = {
    format: 'marketweft.formula-strategy',
    packageVersion: version,
    languageVersion,
    formulas: { entry, exit },
    execution: { source, targetShares, participation, slippage, limitBuffer, maxWait },
    account: { startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder },
    ...(version === 2 ? { functions } : {}),
  }
  const text = JSON.stringify(value, null, 2) + '\n'
  checkPackageSize(text, version === 1 ? MAX_V1_BYTES : MAX_STRATEGY_PACKAGE_BYTES)
  return text
}

function checkPackageSize(text: string, limit: number) {
  if (text.length > limit || new TextEncoder().encode(text).byteLength > limit) {
    throw new Error('Formula strategy package exceeds ' + limit / 1024 + ' KiB.')
  }
}

export function parseFormulaStrategy(text: string, core: Pick<MarketCore, 'validateFormulaStrategy'>): FormulaStrategy {
  checkPackageSize(text, MAX_STRATEGY_PACKAGE_BYTES)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Invalid formula strategy JSON.') }
  const version2 = !!value && typeof value === 'object' && 'packageVersion' in value &&
    value.packageVersion === 2 && Object.hasOwn(value, 'functions')
  checkFields(value, 'formula strategy package', version2 ? [...packageFields, 'functions'] : packageFields)
  if (value.format !== 'marketweft.formula-strategy' || value.packageVersion !== (version2 ? 2 : 1)) {
    throw new Error('Unsupported formula strategy package version.')
  }
  if (!version2) checkPackageSize(text, MAX_V1_BYTES)
  const { languageVersion, formulas, execution, account } = value
  if (typeof languageVersion !== 'number') throw new Error('Invalid formula language version.')
  checkFields(formulas, 'formula', ['entry', 'exit'])
  const { entry, exit } = formulas
  if (typeof entry !== 'string' || typeof exit !== 'string') throw new Error('Supply entry and exit formula text.')
  checkFields(execution, 'execution', ['source', ...executionFields])
  const { source } = execution
  if (source !== 'bars' && source !== 'trades') throw new Error('Invalid strategy execution source.')
  checkFields(account, 'paper account', accountFields)
  const config = {
    fastWindow: '1', slowWindow: '2',
    ...numericFields(execution, executionFields),
    paper: numericFields(account, accountFields),
  }
  const functions = version2 ? parseFormulaFunctionDefinitions(value.functions) : undefined
  core.validateFormulaStrategy(languageVersion, entry, exit, config, functions)
  return { languageVersion, entry, exit, source, config, ...(functions ? { functions } : {}) }
}
