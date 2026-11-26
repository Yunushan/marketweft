# Rolling listing risk

Open **Historical replay → Open universe replay → Start listing risk demo**. With your own reports, load a membership CSV and a matching close-price CSV using the [universe screen contract](universe-screen.md).

Choose an effective end and a knowledge cutoff in Universe replay. Expand **Relative returns**, pick two listing IDs, and set the exact **Comparison baseline (UTC)** to the start of the risk grid. Choose **Compare returns** and expand **Rolling risk**.

- **Price interval (seconds)** sets the grid spacing. The effective end must land on a grid point measured from the baseline.
- **Returns per risk window** sets the number of consecutive grid intervals in each trailing window.
- **Periods for volatility scaling** sets the multiplier under the square root. Use 1 for per-interval volatility, or supply the number of intervals in the period you intend to report.

Choose **Calculate risk**. The table shows all possible intervals per window, returns for each listing and returns available for both. **Download rolling risk** includes every window, both input source labels, the cutoffs, grid settings, sample counts and statistics. Volatility is displayed as a percentage and written to CSV as a fractional return.

## Returns and comparability

Each return uses the two adjacent exact closes in its interval. Both closes must be known by the shared observation cutoff, and the listing must be an effective member at each endpoint based on those reports. A missing close leaves both adjacent returns unavailable for that listing. Later close or membership reports can change the result at a later cutoff.

Volatility uses the sample standard deviation of the available returns for each listing, multiplied by the square root of the selected scale. Pearson correlation uses only intervals with returns for both listings. Two samples are required for either statistic. A constant series has zero volatility. Correlation is unavailable when either paired series has zero variance. The rolling calculation merges centered statistics to avoid subtracting raw squared returns.

Supply comparable price series on a consistent currency and adjustment basis. This study uses price returns. [Relative returns](relative-returns.md) · [Portfolio replay](portfolio-replay.md).

## Verify the demo

Use A and B, a baseline of 2025-06-02T14:00:00Z, an effective end of 14:06 UTC, a 60-second grid and three returns per window. At knowledge 14:06 UTC the window ending at 14:03 has one paired return out of three, so its correlation is blank. At 14:07 UTC a late B close supplies two adjacent returns. The window then has three pairs, per-interval volatility of approximately 5.773503% for both listings and a correlation of −1. At 14:08 UTC the listing A removal is observed, leaving one pair in the last window. Rewinding knowledge restores the earlier CSV.

The app runs the study offline after its cache is ready. [Correlated portfolio scenarios](portfolio-scenarios.md) use the same aligned close inputs to resample whole return vectors. [Synthetic membership fixture](../crates/core/tests/fixtures/synthetic-listing-risk-membership.csv) · [Synthetic price fixture](../crates/core/tests/fixtures/synthetic-listing-risk-prices.csv).
