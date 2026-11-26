# MarketWeft Research SDK

The TypeScript SDK evaluates versioned time-series formulas against user-supplied OHLCV. It uses the same checked-in Rust WebAssembly module as the terminal.

In Node.js 22.12 or later, load the bundled engine and read your own CSV.

```js
import { readFile } from 'node:fs/promises'
import { createResearchEngine, MARKET_CORE_WASM_URL } from '@marketweft/research'

const wasm = await readFile(new URL(MARKET_CORE_WASM_URL))
const research = await createResearchEngine(wasm)
const bars = research.parseBars(await readFile('./history.csv', 'utf8'))
const result = research.evaluateFormula('close - sma(close, 3)', bars)
```

The CSV header is `time,open,high,low,close,volume`. Bars use UTC seconds and exact integer millionths. Formula results carry the grammar version and return `bigint` millionths or `null` in input order. Supply an observed prefix to reproduce the result at an earlier cutoff. A formula can also take an ordered array of custom definitions with `name`, `parameters` and `body`.

Browser hosts can supply the same engine bytes in an `ArrayBuffer` from their own asset loader.
