# Recorded footprint and cumulative volume delta

Select an instrument in the chart workspace and open **Recorded footprint**. Choose **Footprint trades CSV** and load that instrument's trades. The synthetic NVDA chart also offers **Load footprint demo**, using the packaged footprint-trades.csv.

Set the interval in whole seconds and the price increment to a positive decimal with at most six fractional digits. The **Execution from (UTC)** and **Execution through (UTC)** fields select an inclusive execution window. **Footprint known time (UTC)** limits the calculation to trades observed by that time. Choose **Query footprint** to apply the inputs. Step through populated buckets to inspect price bins and the corresponding exact cumulative delta. **Download footprint** includes every populated bin in the window. Expand **Price profiles** to aggregate that same window into volume and time-price opportunities. [Price profiles](price-profiles.md).

## Trade input

Use this exact header.

    instrument,executed_at,observed_at,sequence,price,size,aggressor

Use the selected instrument's canonical ID and UTC execution and observation times. The file also accepts Unix seconds. Observation times must be nondecreasing, and positive unsigned 64-bit capture sequences must increase strictly. The observation time must be at or after execution. Prices can be signed and each trade size must be positive. Both allow six fractional digits.

Set the aggressor to buy, sell or unknown using source evidence. Unknown volume contributes to total size and stays visible in the table and CSV. Only buy and sell volume contributes to signed delta.

## Aggregation and evidence

Time buckets start at UTC epoch multiples of the interval. Price bins start at multiples of the price increment. Each bin includes its lower boundary and excludes its upper boundary, including for negative prices. Only populated buckets and bins appear. The query window can include part of a bucket, whose listed start and end still describe the full interval.

Bucket delta equals eligible buy size minus eligible sell size. The cumulative delta begins at zero for the selected execution window and adds each bucket's delta in execution-time order. The chart plots that cumulative series at bucket boundaries. Exact per-bin totals, last observation, first and last capture sequence, and cutoffs remain available in the table or CSV. Sums use wide fixed-point integers.

Late trades join the bucket of their execution once observed. Advancing only the knowledge cutoff can recalculate an older bucket and later cumulative totals. Rewinding both inputs to a previously used query reproduces that query's CSV.

## Synthetic example

Use a 60-second interval, a price increment of 0.5, an execution start of 1969-12-31T23:59:59Z, and an execution end of 1970-01-01T00:01:00Z. At knowledge 1970-01-01T00:01:00Z, the cumulative delta ends at −1. The first trade at a negative price belongs to the bin from −0.5 to 0. Advance knowledge by one second to include two late trades. The middle bucket reports 3 units of unknown volume, and the window's cumulative delta ends at 8.900001.

The terminal reads the capture locally after its offline cache is ready. [Synthetic trade fixture](../crates/core/tests/fixtures/synthetic-footprint.csv).

## Classify trade sides from recorded quotes

Expand **Classify trade sides from recorded quotes** inside Recorded footprint. Load trade and [depth reports](recorded-depth.md) for the same instrument. The classification accepts the seven-field trade input above and the six-field form ending in `size`. Choose the execution window, independent knowledge time, and maximum quote age in seconds.

Source-reported buy and sell labels take precedence. For an unknown trade, the calculation reconstructs the latest book observed strictly before its execution. Both best quotes must have an event time within the maximum age. The calculation compares the exact transaction price with the bid–ask midpoint. Above the midpoint is inferred as buy, below as sell, and a midpoint tie stays unknown. Locked quotes, missing or stale best quotes, sequence gaps, and crossed books leave the side unknown. The audit gives the reason and the original event and observation times for each available quote.

Choose **Download classification audit** to retain the evidence and cutoffs. **Plot classified trades** sends the visible capture prefix to the footprint. Load new cutoffs in the classification and plot again to include later-observed rows.

The NVDA demo includes a trade executed at 14:00:04 UTC and observed at 14:00:08 UTC. Rewind knowledge to 14:00:07 UTC and plot the seven observed trades for a cumulative delta of −4.500001. Advance knowledge to 14:00:13 UTC and plot again. The late trade uses the quote observed at 14:00:03 UTC, adding 5 buy units. The footprint reports cumulative delta of 0.499999 and unknown volume of 7.75. [Synthetic trades](../crates/core/tests/fixtures/synthetic-trade-classification.csv)
