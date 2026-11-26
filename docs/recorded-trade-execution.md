# Recorded trade execution

Open **Historical replay → Open bar backtest**. Start the demo or load the instrument's bar history and exchange calendar. Run the bar backtest after changing its strategy or account settings. Expand **Recorded trade execution** and load recorded trade prints. The demo also offers **Use sample execution trades**.

The expected fields are:

```csv
instrument,executed_at,observed_at,sequence,price,size
```

Trade exports that include an `aggressor` column also work. The simulator uses the price and available size from each recorded trade. Use the same instrument as the bars and supply strictly increasing capture sequences with nondecreasing observation times. The CSV supports up to 100,000 trades and 8 MiB. Price and size preserve six fractional places.

## Timing and fills

Bars supply the SMA signals and closing marks. The effective cutoff bounds scheduled bar closes and actual trade execution times. The known cutoff bounds bar observations and print arrivals separately. A print may arrive after the effective cutoff and fill a working order if it came from an eligible execution within the effective interval.

A print can fill an order only when its execution time is strictly later than order submission and within the calendar's open-inclusive, close-exclusive session. The engine consumes arrivals in capture order. Before a bar decision it processes earlier arrivals, expires orders that have exceeded their observed-bar lifetime, and then processes same-time arrivals. The bar decision happens after those arrivals.

Each eligible print offers its recorded size multiplied by the participation rate and rounded down to whole shares. The order's remaining quantity, price limit and the configured adverse slippage apply. The paper ledger books accepted and rejected attempts with exact sequence IDs and charges the per-order fee on the first fill. Intervening executions are marked with the latest observed bar close, and a same-second group produces one valuation mark.

**Download recorded trade backtest** exports the source labels, settings, both cutoffs, receipt and order IDs, execution and observation times, cash movements, and valuation marks.

## Verify the synthetic tape

Set the effective cutoff to 2025-04-03T14:11:00Z and keep the default strategy and account settings.

| Known UTC | Shares held | Cash | Evidence |
| --- | ---: | ---: | --- |
| 14:05:29 | 0 | 1,000 | The same-time print and the late pre-signal print cannot fill the buy. |
| 14:05:30 | 2 | 969.8 | The observed size of 29.9 permits two shares at 10% participation. |
| 14:07:10 | 5 | 924.5 | The late print executed at 14:05:21 adds three shares. |
| 14:11:00 | 3 | 934.1 | The session-close print is outside the executable interval. |
| 14:11:10 | 0 | 957.8 | A late print executed at 14:10:10 sells the final three shares. |

With knowledge at 14:05:30, changing the effective cutoff to 14:05:19 withholds the first fill. Rewinding to an earlier pair of cutoffs reproduces its export. The packaged browser can run the workflow offline after its initial cache is ready.
