# Point-in-time relative returns

Open **Historical replay → Open universe replay → Start universe demo**. In **Universe screen**, choose **Load demo prices**. The same workflow accepts a local membership CSV and a close-price CSV in the [screen format](universe-screen.md).

1. Set the universe replay's **Effective time (UTC)** and **Known time (UTC)** and run the as-of query.
2. Expand **Relative returns** below the rankings. Choose two distinct listing IDs and set an exact **Comparison baseline (UTC)**.
3. Choose **Compare returns**. Advancing or rewinding the universe cutoffs updates the comparison for the same IDs and baseline.
4. Choose **Download relative returns** to save every point, including points outside the table's current page.

## How values are calculated

The baseline and end of the window always have rows. Interior rows are the union of exact close timestamps eligible for either listing. A listing must be an effective member at the point, based on the latest membership revisions known by the shared cutoff. A delisted ID stays delisted even when a later listing uses the same ticker.

Each leg uses the latest observation of its exact close known by the cutoff. The return is `100 × (close / baseline close − 1)` for that leg. A missing baseline leaves the leg's returns blank throughout the window. A missing, removed or delisted close leaves a gap at that point. The chart plots only available returns. The table and CSV preserve both listings' status, exact closes, observation timestamps and returns. The spread equals the left return minus the right return in percentage points. The core calculates the spread from the underlying fixed-point prices and rounds the result once to four decimal places.

Supply closes on a consistent currency and adjustment basis for each listing. This is price-return research. For dividend cash and delisting proceeds, use [Portfolio replay](portfolio-replay.md).

## Reproduce a revision and removal

With the bundled demo files, choose **ALFA-001** on the left and **BETA-001** on the right. Use a baseline of `2025-06-02T14:10:00Z` and an effective end of `2025-06-02T14:20:00Z`. At knowledge `14:20:00Z`, the end shows returns of 1.9608% and 6.9307%, with a spread of −4.9699 percentage points. Advance knowledge to `14:25:00Z` to see ALFA's removal and a blank spread. Rewind knowledge to reproduce the earlier result.

The CSV records both listing IDs, the baseline, end and observation cutoff, source labels, every aligned UTC timestamp, each available close and its observation time, and the displayed return and spread units. The comparison and CSV export work offline once the terminal cache is ready. Use [Rolling risk](listing-risk.md) to inspect sample coverage, price-return volatility and correlation for the same pair.
