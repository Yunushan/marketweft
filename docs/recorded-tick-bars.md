# Recorded tick bars

Select an instrument in the research terminal and open **Recorded tick bars**. Upload a trade CSV for that instrument, enter a count from 1 through 100,000, and optionally enter a UTC observation cutoff. **Build tick bars** reads the file locally. The chart labels the last group as provisional when fewer trades are available than the target count.

Use the header `instrument,executed_at,observed_at,sequence,price,size`. IDs must match the selected instrument's canonical `VENUE:SYMBOL`. Times accept integer Unix seconds or ISO timestamps in UTC. Every observation must be at or after execution. Rows must be in capture order with nondecreasing observation times and strictly increasing positive sequence numbers, including within one second. A late execution enters at the time it was observed. Sequence gaps can represent filtered trades and are preserved in the exported boundaries.

A group opens at its first observed trade's price and closes at its last observed trade's price. Its extreme prices and sum of trade sizes come from those same rows. Prices are signed fixed-point values, and sizes must be positive. Both accept up to six fractional digits. The first observation time positions the bar. Its availability time is the last observation in the group. Equal-time groups have separate positions and capture sequences. The cutoff includes every trade observed at the requested second. A later cutoff can add to the provisional last group while keeping earlier complete bars intact.

The export includes the instrument ID, first and last observation times, exact first and last capture sequences, counts, and six-place OHLCV. Tick research is scoped to the open tool. The workspace backup retains its original imported histories.

For an offline example, select NASDAQ:NVDA and load `tick-trades.csv` from the browser ZIP. Use two trades per bar. At `2025-06-02T14:00:00Z` one complete bar is visible, with close −2 and volume 0.000003. At `2025-06-02T14:00:05Z` the late trade starts a provisional second bar.
