# Correlated portfolio scenarios

Open **Historical replay → Open universe replay**, then load membership and price reports. **Start listing risk demo** supplies a synthetic pair. Set effective and known times in Universe replay, then expand **Correlated portfolio scenarios** in Universe screen.

Choose 2 to 16 distinct listing IDs and assign each a positive weight in basis points. The weights must total 10,000. Set the scenario baseline, equal UTC interval, starting value, rebalance fee, seed, path count, moves per path and moves per sampled block. Choose **Run portfolio scenarios**. The table shows available adjacent returns for each listing and the number of complete return vectors. The percentile table and **Download scenario paths** report ending value, drawdown and turnover fees.

## What each path samples

Historical returns use two adjacent closes on the selected UTC grid. For each listing, both closes must be known by the observation cutoff and both endpoints must be effective membership points. An interval contributes a return vector only when every selected listing has its own pair. This keeps sampled cross-asset moves together and excludes intervals without complete coverage.

The simulator uses the supplied unsigned 64-bit seed. With **Moves per sampled block** set to 1, each draw picks a complete return vector independently. This is the default. A larger setting samples an overlapping block of that many consecutive grid intervals. Each interval in a block must have a complete visible return vector. Blocks can overlap in the source history, and a gap or a membership change that makes a return unavailable breaks a block. The simulator draws blocks uniformly with replacement, preserves the order of moves within each block and stops at the specified path length. Choose a block size from one to the number of moves per path. The results and CSV include the block size and eligible block count for block samples. [Moving-block bootstrap](https://doi.org/10.1214/aos/1176347265).

Each path starts at the selected value and long-only target weights. A sampled interval marks each allocation using its exact price ratio. The simulator then rebalances to the configured weights.

## Fixed-point value and fees

Supply comparable prices on a consistent currency and adjustment basis. The simulation applies price returns to one common starting value. It models fractional value allocations with six decimal places. Dividing a value by target weights uses residual millionths in descending fractional remainder, with lower listing IDs breaking ties.

The one-way turnover is the sum of increases required to reach target weights at the marked value. The fee equals turnover multiplied by the selected rate in basis points, rounded to the nearest millionth. The simulator subtracts that fee, allocates the net value at target weights, and measures drawdown from the preceding peak including starting value. Starting allocations have no fee.

The replay is an analytical model of return vectors and rebalancing costs. Its inputs are uploaded histories and the simulated portfolio values.

## Verify the synthetic pair

Choose A and B with weights of 5,000 basis points each, a baseline at 2025-06-02T14:00:00Z and a 60-second interval. With the effective end at 14:06 UTC, the knowledge cutoff at 14:06 gives four complete return vectors. The late B close increases that count to six at knowledge 14:07. When the A removal is observed at 14:08, four remain. A zero-fee 100-unit portfolio stays at 100 in every path because the paired moves offset.

With two moves per block, the same cutoffs give 2, 5 and 3 eligible blocks. At 14:06 the missing B close leaves four eligible vectors but no block of four consecutive vectors. Rewinding the knowledge cutoff restores the earlier eligible blocks and seeded paths.

For a fee check, set both cutoffs to 14:01 UTC, choose one move per path and set a fee of 100 basis points. Each path ends at 99.95, with fees of 0.05 and a drawdown of 0.05%. Repeating the same configuration reproduces the exported CSV.

The simulator works offline once the terminal cache is ready. [Listing risk demo fixtures](listing-risk.md).

## Research SDKs

The TypeScript SDK exposes `research.portfolioScenarios` through the bundled Wasm. Pass both CSV strings, a list of weights by stable listing ID and the scenario settings.

```ts
const report = research.portfolioScenarios(membership, prices, [
  { listingId: 'A', weightBasisPoints: 5000 },
  { listingId: 'B', weightBasisPoints: 5000 },
], {
  from: '2025-06-02T14:00:00Z',
  through: '2025-06-02T14:06:00Z',
  known: '2025-06-02T14:06:00Z',
  intervalSeconds: 60,
  startingValue: '100',
  feeBasisPoints: 100,
  seed: 9007199254740993n,
  paths: 5,
  horizon: 4,
  blockSize: 3,
})
```

Use the synthetic pair from the listing risk guide to reproduce one eligible block and five paths ending at 99.95 with a 0.05% drawdown and 0.05 in fees each. The corresponding integer values are `99950000n`, `500n`, and `50000n`. Ending value and fees use millionths of portfolio currency. Drawdown uses millionths of the portfolio's peak value. Percentile arrays contain the 5th, 50th and 95th percentiles.

The Python SDK exposes `ResearchEngine.portfolio_scenarios` and returns frozen result records with exact Python integers. Use `ScenarioAllocation("A", 5000)` and `ScenarioAllocation("B", 5000)` as the allocations. The equivalent keyword arguments are `from_at`, `through_at`, `known_at`, `interval_seconds`, `starting_value`, `fee_basis_points`, `seed`, `paths`, `horizon`, and `block_size`. Omitting the block size in either SDK uses one move per sample. [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md).

The local MCP tool and scoped REST, WebSocket and gRPC routes return the same simulation and page exact decimal-string results. [Portfolio scenarios over MCP](local-mcp-research.md#portfolio-scenarios) · [Portfolio scenario service](local-rest-research.md#portfolio-scenarios).

### Native portfolio scenarios protocol

Run `marketweft-research portfolio-scenarios` and send the UTF-8 request through standard input. The initial line is the tab-separated protocol name `marketweft-portfolio-scenarios`, version `1`, and membership CSV byte length. Send the following fields on separate lines in this order.

1. The baseline, effective end and knowledge cutoff, each on its own line as an exact UTC timestamp.
2. The interval in seconds, starting value as a decimal, rebalance fee in basis points, unsigned seed, and path count.
3. The horizon as a whole number, or `horizon:block_size` for a longer block.
4. The allocations as tab-separated `listing_id=weight_basis_points` pairs.
5. The membership CSV bytes followed immediately by the price CSV bytes.

The first response line contains the same name and version followed by the path count. Tab-separated `H` fields give expected vectors, eligible vectors and loss paths, followed by block size and eligible blocks for sizes greater than one. `A` rows contain sorted listing IDs, weights and known return counts. `V`, `D` and `F` report value, drawdown and fee percentiles. `P` rows give the exact ending value, drawdown and fees for each seeded path. The command reports malformed requests on standard error with a nonzero exit status.
