# Seeded scenario replay

Open **Historical replay → Open bar backtest** and load the demo or a local session calendar and bar report. The seeded scenarios panel uses the account and execution policy from the latest successful bar backtest. Set the UTC observation cutoff, an unsigned 64-bit seed, the number of paths and the number of moves per path. The same input data, settings, and seed reproduce the same ordered paths and risk summary.

The replay clock determines which closes and volumes are observable by the cutoff. Missing intervals contribute no bar. The sample contains each adjacent observed-close ratio paired with the volume of the later bar. A ratio can span a gap, market close or other interval without observed bars. Each draw samples a pair with replacement from this empirical history using a fixed SplitMix64 stream. The observed sequence supplies a time grid and anchor close from the last horizon plus one bars. Each synthetic path changes that anchor price by the sampled ratios in draw order. It rounds each close to the nearest six-place tick, resolving a positive half tick upward. The sampled volume supplies execution liquidity for its corresponding synthetic close.

The observed baseline replays the same time grid with the original moves and volumes. Each synthetic path and the baseline start with the configured cash, an empty position and no outstanding orders. They use the same SMA settings, risk limits, fees, participation cap, slippage and order expiry. The existing paper ledger enforces that signals and fills use separate observation times.

The report compares ending marked equity, peak-to-trough equity drawdown, and maximum market value of held shares. Scenario percentiles use nearest rank with the sorted sample and integer rank rounded up. The loss count records endings strictly below starting cash. The API includes the exact statistics of each path in draw order alongside the seed, cutoff, eligible observation range and sample size.

Supply one to 10,000 paths, one to 1,000 moves per path, and enough observed bars for the anchor plus the entire horizon. The baseline and paths together can evaluate at most two million bars. A synthetic price outside the core's positive six-place range rejects the run. The browser preserves the prior result when a later run fails validation.

These scenarios measure the strategy's sensitivity to independently resampled historical moves over the supplied time grid. Correlations between instruments, clustered moves and prospective market forecasts remain outside this single-series model.

[Bar and calendar CSVs](bar-backtest.md) · [Walk-forward validation](walk-forward.md)
