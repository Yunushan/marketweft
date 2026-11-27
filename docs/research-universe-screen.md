# Universe screening through the research interfaces

The Python SDK, TypeScript SDK and local MCP server use the terminal’s point-in-time ranking engine. Supply the same membership and price CSV contents and the same three UTC times to reproduce a terminal snapshot. The source files remain under the caller’s control. [Universe screen and fixture](universe-screen.md).

| Field | Meaning |
| --- | --- |
| Baseline | Exact time of the starting close |
| Effective | Target close time and effective membership time |
| Known | Inclusive cutoff for membership reports and close revisions |

Supplying a later known cutoff can reveal a close, correction or removal while leaving the effective time fixed. Both endpoints use exact price times. An unavailable endpoint leaves the listing unranked and the missing close empty.

## Python and TypeScript

Use the native research executable with the Python SDK and provide the CSV strings.

```python
result = engine.screen_universe(
    membership_csv, prices_csv,
    baseline_at="2025-06-02T14:00:00Z",
    effective_at="2025-06-02T14:10:00Z",
    known_at="2025-06-02T14:12:00Z",
)
print([(row.listing_id, row.rank, row.return_units) for row in result.rows])
```

The TypeScript SDK uses the bundled Wasm and exposes the equivalent calculation.

```ts
const rows = research.universeScreen(
  membershipCsv, pricesCsv,
  '2025-06-02T14:00:00Z', '2025-06-02T14:10:00Z', '2025-06-02T14:12:00Z',
)
```

With the bundled fixtures, BETA-001 ranks first with a return of 120,000 units, followed by ALFA-001 with 20,000. Each unit represents 0.0001 percentage points. Python exposes integers and TypeScript exposes `bigint` for exact returns, including values beyond the JavaScript safe-integer range.

## MCP

Call `screen_universe_as_of` with `membership_csv`, `prices_csv`, `baseline_at`, `effective_at` and `known_at`. Each MCP row includes the selected membership change and its effective and observation times, the two close observations, rank and return. Close ticks and return units are decimal strings. Unavailable closes, returns or ranks are `null`.

Set `limit` to page up to 1,000 rows. For subsequent pages, pass the returned `next_offset` as `offset` with the same data and cutoffs. Ranks are computed before pagination. Input limits are 1 MiB for membership and 2 MiB for prices. [MCP configuration](local-mcp-research.md).

## Native process protocol

The Python client invokes `marketweft-research screen`. It sends a UTF-8 header with six tab-separated fields and a trailing newline. The fields are `marketweft-screen`, protocol `1`, membership byte size, baseline UTC, effective UTC and known UTC. The membership CSV bytes follow the header, then the prices CSV bytes.

The response header contains the identifier, protocol and universe ID. Each following line contains the listing ID, instrument, membership change ID, membership effective and observed UTC seconds, optional rank and return units, and each endpoint’s optional close ticks and observed UTC seconds. Fields use tabs and missing numbers use empty fields. On failure, the executable exits with a diagnostic on standard error.

## Compare rank snapshots

Use one baseline close time and supply independent effective and known UTC times for each snapshot. Each comparison row joins the listings that were active in either snapshot, ordered by stable listing ID. An effective membership change becomes visible only when its report is known. Returns use the exact closes available under that side’s known cutoff. A missing close stays empty. Rank movement is the before rank minus the after rank and is available when both ranks exist. [Offline comparison](universe-screen.md#compare-ranks-at-two-cutoffs).

The TypeScript SDK returns an array with each listing’s before and after evidence. Prices and returns use exact `bigint` values.

```ts
const rows = research.compareUniverseRanks(
  membershipCsv, pricesCsv, '2025-06-02T14:00:00Z',
  { effective: '2025-06-02T14:10:00Z', known: '2025-06-02T14:12:00Z' },
  { effective: '2025-06-02T14:10:00Z', known: '2025-06-02T14:18:00Z' },
)
```

The Python SDK returns the universe ID and rows. Price ticks and return units use exact integers.

```python
report = engine.compare_universe_ranks(
    membership_csv, prices_csv,
    baseline_at="2025-06-02T14:00:00Z",
    before_effective_at="2025-06-02T14:10:00Z",
    before_known_at="2025-06-02T14:12:00Z",
    after_effective_at="2025-06-02T14:10:00Z",
    after_known_at="2025-06-02T14:18:00Z",
)
```

Call read-only MCP `compare_universe_ranks_as_of` with the same named fields as the Python method. The result includes all five applied times, the universe ID, total rows and the requested page. Close ticks and return units are decimal strings. Missing values are JSON `null`. The default page has up to 200 rows and `limit` accepts 1–1,000. To continue, keep the same CSV contents and times and pass `next_offset` as `offset`. Offsets run from 0 to 5,000. Membership remains bounded to 1 MiB and prices to 2 MiB.

### Native rank comparison protocol

The Python SDK invokes `marketweft-research rank-compare`. Send eight tab-separated header fields followed by a newline and the membership and prices CSV bytes. The fields are `marketweft-rank-comparison`, `1`, membership byte size, baseline UTC, before effective UTC, before known UTC, after effective UTC and after known UTC.

The response header contains the identifier, protocol and universe ID. Each of the following lines contains 13 tab-separated fields. The listing ID and instrument come first, then five fields for the before snapshot and five for the after snapshot, followed by rank movement. Each snapshot contains its membership evidence, rank, return units, baseline close and target close. Membership evidence is a comma-separated action code, change ID, effective UTC seconds and observed UTC seconds. Action codes are 0 for member, 1 for removed and 2 for delisted. Each close contains its integer ticks and observed UTC seconds separated by a comma. Empty fields represent unavailable values.
