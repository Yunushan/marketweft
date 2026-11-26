import type { BacktestConfig, MarketCore, PaperConfig } from './market-core'

type Execution = 'bars' | 'trades'
type FormatExecution = Omit<BacktestConfig, 'paper' | 'fastWindow' | 'slowWindow'> & { source: Execution }

type StrategyPackage = {
  format: 'marketweft.formula-strategy'
  packageVersion: 1
  languageVersion: number
  formulas: { entry: string; exit: string }
  execution: FormatExecution
  account: PaperConfig
}

export type FormulaStrategy = {
  languageVersion: number
  entry: string
  exit: string
  source: Execution
  config: BacktestConfig
}

export const MAX_STRATEGY_PACKAGE_BYTES = 32 * 1024
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
  const { languageVersion, entry, exit, source, config } = strategy
  const { targetShares, participation, slippage, limitBuffer, maxWait } = config
  const { startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder } = config.paper
  const value: StrategyPackage = {
    format: 'marketweft.formula-strategy',
    packageVersion: 1,
    languageVersion,
    formulas: { entry, exit },
    execution: { source, targetShares, participation, slippage, limitBuffer, maxWait },
    account: { startingCash, positionLimit, exposureLimit, feePerShare, feePerOrder },
  }
  const text = JSON.stringify(value, null, 2) + '\n'
  checkPackageSize(text)
  return text
}

function checkPackageSize(text: string) {
  if (text.length > MAX_STRATEGY_PACKAGE_BYTES ||
      new TextEncoder().encode(text).byteLength > MAX_STRATEGY_PACKAGE_BYTES) {
    throw new Error('Formula strategy package exceeds 32 KiB.')
  }
}

export function parseFormulaStrategy(text: string, core: Pick<MarketCore, 'validateFormulaStrategy'>): FormulaStrategy {
  checkPackageSize(text)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Invalid formula strategy JSON.') }
  checkFields(value, 'formula strategy package', ['format', 'packageVersion', 'languageVersion', 'formulas', 'execution', 'account'])
  if (value.format !== 'marketweft.formula-strategy' || value.packageVersion !== 1) {
    throw new Error('Unsupported formula strategy package version.')
  }
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
  core.validateFormulaStrategy(languageVersion, entry, exit, config)
  return { languageVersion, entry, exit, source, config }
}
