# Correlated portfolio scenarios

Open **Historical replay → Open universe replay**, then load membership and price reports. **Start listing risk demo** supplies a synthetic pair. Set effective and known times in Universe replay, then expand **Correlated portfolio scenarios** in Universe screen.

Choose 2 to 16 distinct listing IDs and assign each a positive weight in basis points. The weights must total 10,000. Set the scenario baseline, equal UTC interval, starting value, rebalance fee, seed, path count and moves per path. Choose **Run portfolio scenarios**. The table shows available adjacent returns for each listing and the number of complete return vectors. The percentile table and **Download scenario paths** report ending value, drawdown and turnover fees.

## What each path samples

Historical returns use two adjacent closes on the selected UTC grid. For each listing, both closes must be known by the observation cutoff and both endpoints must be effective membership points. An interval contributes a return vector only when every selected listing has its own pair. This keeps sampled cross-asset moves together and excludes intervals without complete coverage.

The simulator draws whole vectors with replacement using the supplied unsigned 64-bit seed. It preserves returns across listings in a sampled interval. Each interval is drawn independently of its neighbors. Each path starts at the selected value and long-only target weights. A sampled interval marks each allocation using its exact price ratio. The simulator then rebalances to the configured weights.

## Fixed-point value and fees

Supply comparable prices on a consistent currency and adjustment basis. The simulation applies price returns to one common starting value. It models fractional value allocations with six decimal places. Dividing a value by target weights uses residual millionths in descending fractional remainder, with lower listing IDs breaking ties.

The one-way turnover is the sum of increases required to reach target weights at the marked value. The fee equals turnover multiplied by the selected rate in basis points, rounded to the nearest millionth. The simulator subtracts that fee, allocates the net value at target weights, and measures drawdown from the preceding peak including starting value. Starting allocations have no fee.

The replay is an analytical model of return vectors and rebalancing costs. Its inputs are uploaded histories and the simulated portfolio values.

## Verify the synthetic pair

Choose A and B with weights of 5,000 basis points each, a baseline at 2025-06-02T14:00:00Z and a 60-second interval. With the effective end at 14:06 UTC, the knowledge cutoff at 14:06 gives four complete return vectors. The late B close increases that count to six at knowledge 14:07. When the A removal is observed at 14:08, four remain. A zero-fee 100-unit portfolio stays at 100 in every path because the paired moves offset.

For a fee check, set both cutoffs to 14:01 UTC, choose one move per path and set a fee of 100 basis points. Each path ends at 99.95, with fees of 0.05 and a drawdown of 0.05%. Repeating the same configuration reproduces the exported CSV.

The simulator works offline once the terminal cache is ready. [Listing risk demo fixtures](listing-risk.md).
