# Recorded tick bars

Select an instrument in the research terminal and open **Recorded tick bars**. Upload a trade CSV for that instrument, enter a count from 1 through 100,000, and optionally enter a UTC observation cutoff. **Build tick bars** reads the file locally. The chart labels the last group as provisional when fewer trades are available than the target count.

Use the header `instrument,executed_at,observed_at,sequence,price,size`. IDs must match the selected instrument's canonical `VENUE:SYMBOL`. Times accept integer Unix seconds or ISO timestamps in UTC. Every observation must be at or after execution. Rows must be in capture order with nondecreasing observation times and strictly increasing positive sequence numbers, including within one second. A late execution enters at the time it was observed. Sequence gaps can represent filtered trades and are preserved in the exported boundaries.

A group opens at its first observed trade's price and closes at its last observed trade's price. Its extreme prices and sum of trade sizes come from those same rows. Prices are signed fixed-point values, and sizes must be positive. Both accept up to six fractional digits. The first observation time positions the bar. Its availability time is the last observation in the group. Equal-time groups have separate positions and capture sequences. The cutoff includes every trade observed at the requested second. A later cutoff can add to the provisional last group while keeping earlier complete bars intact.

The export includes the instrument ID, first and last observation times, exact first and last capture sequences, counts, and six-place OHLCV. Tick research is scoped to the open tool. The workspace backup retains its original imported histories.

For an offline example, select NASDAQ:NVDA and load `tick-trades.csv` from the browser ZIP. Use two trades per bar. At `2025-06-02T14:00:00Z` one complete bar is visible, with close −2 and volume 0.000003. At `2025-06-02T14:00:05Z` the late trade starts a provisional second bar.

## Recorded notional bar SDKs

The TypeScript method `recordedNotionalBars(instrument, tradesCsv, targetNotionalTicks, knownAt)` and Python method `ResearchEngine.recorded_notional_bars(instrument, trades_csv, target_notional_ticks, known_at=...)` use the terminal's whole-trade aggregation. The target uses whole millionths in the instrument's quote units. Pass an inclusive UTC observation cutoff or omit it to use every recorded trade. The returned capture sequences and gross notional in trillionths remain exact integers. [Recorded notional chart](chart-workspace.md#recorded-notional-bars) · [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md)

Run `marketweft-research notional-bars` and send the UTF-8 request on standard input. The first line has the tab-separated protocol name `marketweft-notional-bars` and version `1`. On the next three lines place the canonical instrument, target in integer millionths, and the UTC cutoff as `YYYY-MM-DDTHH:MM:SSZ` or an empty line. Append the complete trade CSV, limited to 8 MiB.

The first response row has the protocol name, version and bar count. The `T` row echoes the instrument, target and optional cutoff in UTC Unix seconds. Each bar row has twelve tab-separated fields in this order.

1. First-observed and availability times in UTC Unix seconds.
2. First and last capture sequence, observed trade count and completion flag as `0` or `1`.
3. Gross notional in trillionths of the quote unit.
4. Open, high, low, close and traded volume in millionths.

The sample trade tape returns `2000003000001` trillionths with a provisional flag at `2025-06-02T14:00:01Z`. At `2025-06-02T14:00:02Z`, the completed first bar has `5000003000001` trillionths and capture sequences `9007199254740993` to `9007199254740995`. [Synthetic notional trade tape](../crates/core/tests/fixtures/synthetic-notional-trades.csv)

## Recorded time and sales

Open **Recorded time and sales** for the primary instrument or **Comparison time and sales** for the comparison instrument. Choose a local trade CSV and optionally enter an exact **Known through (UTC)** timestamp. MarketWeft includes captures observed by that second and plots them in capture sequence order. The table gives execution time, observation time, exact sequence, signed price, size and reported aggressor.

The plot’s horizontal positions follow capture order. Larger dots indicate larger prints within the current page. Click a dot or choose its sequence in the table to highlight it. Each page shows up to 50 prints. The CSV includes every print in the current cutoff, in the same capture order. You can reopen that CSV with the same instrument.

The input accepts the six-column trade format and the optional seventh `aggressor` column. Values are `buy`, `sell` and `unknown`. An absent aggressor is shown as unknown. [Synthetic time-and-sales fixture](../crates/core/tests/fixtures/synthetic-recorded-prints.csv)

In the fixture, two trades are observable at 14:00:00 UTC on June 2, 2025. A trade executed at 13:59:57 UTC becomes visible at 14:00:02 UTC after both earlier captures. The final trade has capture sequence `18446744073709551615`. Rewind to 14:00:00 UTC to reproduce the earlier CSV.
