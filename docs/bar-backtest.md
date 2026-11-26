# Session-aware SMA bar backtest

Open **Historical replay → Open bar backtest → Start backtest demo**. Step the observation cutoff or enter a UTC timestamp. Change fees, SMA windows, order life, target shares, participation or slippage under **Strategy and account settings**. The engine reruns the whole observation prefix with those settings.

The fixture uses 60-second bars on April 3, 2025. The bar ending at 14:05 crosses the SMA. The signal records a buy order and reserves cash, with no fill yet. The missing interval at 14:06 cannot supply a price or liquidity. At 14:07, 10% of the observed volume permits two shares at 14. The next observed bar supplies the other four shares. A later reversal sells the six shares in two fills. The default run ends with cash and equity of 957.8 and realized profit and loss of −42.2.

Under **Open backtest data**, supply an instrument, interval, session CSV and OHLCV bars with UTC interval starts. Up to 5,000 bars use positive closes and nonnegative volume. The session rules also apply to partial intervals and missing slots. [Session contract](historical-replay.md) · [Bar fixture](../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [Session fixture](../crates/core/tests/fixtures/synthetic-backtest-sessions.csv).

## Execution contract

1. Compare exact fast and slow SMA sums at observed closes once both sides of the comparison are warm. A crossing above targets a long position and a crossing below targets zero shares. Reversals cancel any opposite residual working order.
2. A working order can only use a later observed bar close. Each attempt is limited to the whole-share fraction of that bar's volume. The order expires after the configured number of later observed bars. Missing intervals advance the cutoff and leave the order unchanged.
3. Apply adverse slippage in basis points and round to six-place ticks. Limits use the signal close and the configured limit buffer. The paper account applies reservations, fees, risk limits, source IDs and rejection rules. [Paper ledger](paper-ledger.md).
4. Mark equity as known cash plus held shares at the last observed close. Drawdown is the greatest absolute decline from a prior marked peak, including the starting balance. The curve and event receipts contain only the selected prefix. This single-instrument model leaves cross-sectional membership, delisting returns, tick sequencing and portfolio allocation for later verified milestones. [Architecture decision](adr/0014-delayed-bar-execution.md).
