# Historical data and calculations

The financial core has no external crate dependencies. Native Rust and the browser run the same parsing and calculation code. The browser adapter lives in `apps/terminal/src/market-core.ts`.

## Import contract

One file contains one venue and instrument's history. Use the header `time,open,high,low,close,volume` in that order. The first field also accepts `date` or `timestamp`. Column names are case-insensitive. Use comma-separated plain fields, UTF-8, optional BOM and either LF or CRLF. Blank lines are ignored.

Supply strictly increasing Unix seconds or dates/times in `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ` format. Date-only rows represent midnight UTC. Supported years run from 0001 through 9999 in the proleptic Gregorian calendar. The adapter rejects malformed dates, leap seconds, duplicate observations, reversed timestamps and offset strings. Each high and low must enclose its open and close. Volume is nonnegative. A rejected row fails the complete import.

Prices and volumes use signed integer millionths. Enter plain decimals up to ±2,000,000,000 and at most six decimal places. These bounds allow a lossless round trip between a tick value and the chart-facing JavaScript number. Files are limited to 8 MiB and 100,000 rows. Each instrument key is `VENUE:SYMBOL` after trimming and ASCII uppercasing. Components accept up to 32 letters, digits, dots, hyphens, slashes or underscores. Users supply data they are entitled to store and analyze.

## Averages

Both indicators use close prices in input order. For a period of N observations, the first N−1 entries are missing. The SMA is the sum of the latest N closes divided by N. The EMA begins with the first full-window SMA. Each later value is (2 × close + (N−1) × prior EMA) / (N+1). Each output including the EMA's carried state rounds to the nearest millionth, with ties away from zero. Native and WASM acceptance requires exactly matching output ticks. Calculations use signed 128-bit intermediates. Trading sessions, corporate-action adjustments and missing market sessions are outside this ingestion contract.

## Rebuild and verify

```sh
rustup target add wasm32-unknown-unknown
cargo test --workspace --locked
node scripts/build-wasm.mjs
node --experimental-strip-types --test scripts/core-wasm.test.mjs
cargo bench --bench history --locked
node --experimental-strip-types scripts/bench-wasm.mjs
```

The native benchmark measures parsing and calculation over 100,000 bars. The WebAssembly benchmark includes JavaScript transfer and result materialization. Both report elapsed time for ten warm passes. The repository includes the compiled WASM asset for browser builds.

## Session replay

The native `parse_sessions` and `replay` functions build the deterministic session event plan used by the terminal. The Wasm ABI encodes each event in 32 little-endian bytes. Two signed 64-bit UTC timestamps are followed by a signed 32-bit source bar index (−1 for no bar), an unsigned 32-bit session index, a signed 32-bit opening offset in minutes and unsigned 32-bit flags. The low byte encodes open, bar, missing or close as 0–3. Bit 8 marks an early close. [Calendar and observation rules](../../docs/historical-replay.md).

## Point-in-time split snapshots

Use `parse_splits` with the instrument and action CSV. Call `SplitBook::adjust` with the already observed bar prefix and replay observation time. The function returns a separate bar vector and leaves its inputs intact. The Wasm bridge encodes split records as 32 bytes each, with 64-bit signed announcement, effective and observed UTC seconds, then 32-bit unsigned new and old share counts. To compute a snapshot, send the signed 64-bit cutoff followed by the split records and the standard 48-byte OHLCV rows. [Stock split schema, examples and rounding](../../docs/corporate-actions.md).

## Cash dividend ledger

Use `parse_dividends` for the instrument's reports, then `DividendBook::ledger` with the fixed entitled share count. Consume events through the inclusive replay cutoff. Each event exposes the visible report and per-currency deltas and cumulative balances in integer millionths. The Wasm bridge uses tab-separated event fields, followed by zero or more tab-separated movements with comma-separated currency, receivable delta, cash delta, receivable and cash. Decimal integer strings carry exact 128-bit amounts to the browser's BigInt. [Cash dividend contract](../../docs/cash-dividends.md).
