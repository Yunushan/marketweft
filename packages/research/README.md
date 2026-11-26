# MarketWeft Research SDK

The TypeScript SDK evaluates versioned time-series formulas against user-supplied OHLCV. It uses the same checked-in Rust WebAssembly module as the terminal.

Download `marketweft-research-0.4.0.tgz` from the `research-sdk-attempt-N` artifact of a successful MarketWeft verification run. Install the archive in your project, then load the bundled engine and read your own CSV in Node.js 22.12 or later. [GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

```sh
npm install --offline ./marketweft-research-0.4.0.tgz
```

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

For point-in-time universe screening, call `universeScreen` with the membership CSV, prices CSV and exact baseline, effective and known UTC times. The ordered rows contain their selected close observations and exact `bigint` return units. [Universe screening](../../docs/research-universe-screen.md).

For financial filings, call `financialIndex(filings, caps)` to list issuers and suggested valuation times. Call `financialSnapshot(filings, caps, issuer, valuationAt, knownAt)` with the original CSV strings and exact UTC cutoff strings. The result includes the annual valuation, the selected quarterly vintages and the trailing flow values in `bigint` millionths or `null`. [Financial filings](../../docs/financial-statements.md#quarterly-filings-and-trailing-twelve-months).

The snapshot's `quarterlyValuation` includes trailing P/E, trailing P/S and latest-quarter P/B. A flow multiple is `null` when trailing coverage is unavailable. Consult `trailing.kind` for the coverage reason. Each other value includes either a fixed-point multiple or its calculation status. [Valuation basis](../../docs/financial-statements.md#choose-a-valuation-basis).
