import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createResearchEngine, MARKET_CORE_WASM_URL, RESEARCH_SDK_VERSION } from '../dist/index.js'

const sample = new URL('../../../crates/core/tests/fixtures/synthetic-formula-bars.csv', import.meta.url)
const checkedInCore = new URL('../../../apps/terminal/public/marketweft_core.wasm', import.meta.url)
const [csv, wasm, expectedWasm] = await Promise.all([
  readFile(sample, 'utf8'), readFile(new URL(MARKET_CORE_WASM_URL)), readFile(checkedInCore),
])

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
