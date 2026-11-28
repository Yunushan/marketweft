# Rolling listing risk

Open **Historical replay → Open universe replay → Start listing risk demo**. With your own reports, load a membership CSV and a matching close-price CSV using the [universe screen contract](universe-screen.md).

Choose an effective end and a knowledge cutoff in Universe replay. Expand **Relative returns**, pick two listing IDs, and set the exact **Comparison baseline (UTC)** to the start of the risk grid. Choose **Compare returns** and expand **Rolling risk**.

- **Price interval (seconds)** sets the grid spacing. The effective end must land on a grid point measured from the baseline.
- **Returns per risk window** sets the number of consecutive grid intervals in each trailing window.
- **Periods for volatility scaling** sets the multiplier under the square root. Use 1 for per-interval volatility, or supply the number of intervals in the period you intend to report.

Choose **Calculate risk**. The table shows all possible intervals per window, returns for each listing and returns available for both. **Download rolling risk** includes every window, both input source labels, the cutoffs, grid settings, sample counts and statistics. Volatility is displayed as a percentage and written to CSV as a fractional return.

## Downside deviation

Enable **Show downside deviation** to see the number of losses and the downside deviation for each listing. Each available negative return contributes its square, and each available flat or positive return contributes zero. Divide the sum by the number of available returns, take the square root and multiply by the square root of the chosen scaling periods.

An unavailable return contributes neither a square nor an interval to the denominator. One available interval is enough to compute downside deviation. A window with only flat or positive returns shows zero. A window with no available returns is blank. With the option enabled, the CSV appends both loss counts and both fractional deviations.

At the demo’s 14:06 UTC knowledge cutoff the first window has one available return for B, a 10% loss, so B’s downside deviation is 10%. At 14:07 UTC three returns are available, including two losses and one flat interval. B’s downside deviation becomes 8.164966%. A’s first window has zero downside deviation at both cutoffs.

## Returns and comparability

Each return uses the two adjacent exact closes in its interval. Both closes must be known by the shared observation cutoff, and the listing must be an effective member at each endpoint based on those reports. A missing close leaves both adjacent returns unavailable for that listing. Later close or membership reports can change the result at a later cutoff.

Volatility uses the sample standard deviation of the available returns for each listing, multiplied by the square root of the selected scale. Pearson correlation uses only intervals with returns for both listings. Two samples are required for either statistic. A constant series has zero volatility. Correlation is unavailable when either paired series has zero variance. The rolling calculation merges centered statistics to avoid subtracting raw squared returns.

Supply comparable price series on a consistent currency and adjustment basis. This study uses price returns. [Relative returns](relative-returns.md) · [Portfolio replay](portfolio-replay.md).

## Verify the demo

Use A and B, a baseline of 2025-06-02T14:00:00Z, an effective end of 14:06 UTC, a 60-second grid and three returns per window. At knowledge 14:06 UTC the window ending at 14:03 has one paired return out of three, so its correlation is blank. At 14:07 UTC a late B close supplies two adjacent returns. The window then has three pairs, per-interval volatility of approximately 5.773503% for both listings and a correlation of −1. At 14:08 UTC the listing A removal is observed, leaving one pair in the last window. Rewinding knowledge restores the earlier CSV.

The app runs the study offline after its cache is ready. [Correlated portfolio scenarios](portfolio-scenarios.md) use the same aligned close inputs to resample whole return vectors. [Synthetic membership fixture](../crates/core/tests/fixtures/synthetic-listing-risk-membership.csv) · [Synthetic price fixture](../crates/core/tests/fixtures/synthetic-listing-risk-prices.csv).

## Downside risk SDKs

Use either SDK with the same membership and close reports as the terminal. Set a grid start, grid end and independent knowledge cutoff in whole-second UTC. Give two distinct listing IDs, the interval length, the number of intervals in each window and the volatility scale. The result echoes the applied settings as UTC seconds and lists windows in chronological order. Volatility and downside deviation are fractional returns. A missing metric is `None` in Python and `null` in TypeScript.

```python
snapshot = engine.listing_downside_risk_as_of(
    membership_csv, closes_csv, "A", "B",
    from_at="2025-06-02T14:00:00Z", through_at="2025-06-02T14:06:00Z",
    known_at="2025-06-02T14:07:00Z", interval_seconds=60, window_periods=3,
)
assert snapshot.rows[0].right_loss_returns == 2
```

```ts
const snapshot = engine.listingDownsideRiskAsOf(membershipCsv, closesCsv, 'A', 'B', {
  from: '2025-06-02T14:00:00Z', through: '2025-06-02T14:06:00Z',
  known: '2025-06-02T14:07:00Z', intervalSeconds: 60, windowPeriods: 3, volatilityPeriods: 1,
})
```

The native `marketweft-research listing-downside-risk` command accepts UTF-8 input on standard input. Separate the protocol name `marketweft-listing-downside-risk`, version `1` and membership CSV byte length with tabs on the first line. Follow with a line each for the start, end and knowledge UTC cutoffs. Put the two listing IDs on one tab-separated line, then interval seconds, window intervals and scale periods on one tab-separated line. Append the membership CSV and immediately append the close CSV. The membership and price reports allow at most 1 MiB and 2 MiB respectively.

The native output begins with the protocol name, version and window count. The next line starts with `H` and echoes the cutoff seconds, listing IDs and grid settings in request order. Each `R` row gives the window start and end, expected returns, available left and right returns, paired returns, left and right loss counts, left and right volatility, correlation, and left and right downside deviation. Unavailable metrics use empty fields.
