import type { FormulaFunction, MarketCore } from './market-core'

export const MAX_FORMULA_LIBRARY_BYTES = 48 * 1024

type FormulaLibrary = {
  format: 'marketweft.formula-library'
  libraryVersion: 1
  languageVersion: number
  functions: FormulaFunction[]
}

function record(value: unknown, fields: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
}

export function parseFormulaLibrary(text: string, core: Pick<MarketCore, 'evaluateFormula'>): FormulaLibrary {
  if (text.length > MAX_FORMULA_LIBRARY_BYTES || new TextEncoder().encode(text).length > MAX_FORMULA_LIBRARY_BYTES) {
    throw new Error('Formula function library exceeds 48 KiB.')
  }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Invalid formula function library JSON.') }
  if (!record(value, ['format', 'libraryVersion', 'languageVersion', 'functions']) ||
      value.format !== 'marketweft.formula-library' || value.libraryVersion !== 1) {
    throw new Error('Unsupported formula function library format or version.')
  }
  const { functions, languageVersion } = value
  if (typeof languageVersion !== 'number' || languageVersion !== core.evaluateFormula('0', []).version) {
    throw new Error('Unsupported formula language version.')
  }
  if (!Array.isArray(functions) || functions.length < 1 || functions.length > 16) {
    throw new Error('Supply 1–16 custom formula functions.')
  }
  const parsed = functions.map((definition): FormulaFunction => {
    if (!record(definition, ['name', 'parameters', 'body']) || typeof definition.name !== 'string' ||
        !Array.isArray(definition.parameters) || !definition.parameters.every(name => typeof name === 'string') ||
        typeof definition.body !== 'string') {
      throw new Error('Supply a name, parameter list and body for every formula function.')
    }
    return { name: definition.name, parameters: definition.parameters, body: definition.body }
  })
  core.evaluateFormula('0', [], parsed)
  return { format: 'marketweft.formula-library', libraryVersion: 1, languageVersion, functions: parsed }
}
