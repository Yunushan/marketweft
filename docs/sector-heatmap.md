# Point-in-time sector heatmap

Open **Historical replay → Open universe replay → Start universe demo → Load demo prices**. In **Sector heatmap**, choose **Load demo sectors**. For custom data, load membership and price reports first, then upload **Sector and weight CSV**. All three input files are included in the portable build.

The heatmap uses the screening baseline and the same effective and known cutoffs. Each tile shows the listing, price return and reported weight. Tile width follows weight within a group with a minimum width for legibility. Color shows the direction and magnitude of the displayed return. Color intensity saturates at a 10% move, and striped tiles denote a missing return. Open a tile to see its screen rank, attribution and classification report times. [Screen inputs and ranking](universe-screen.md).

## Reports

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Use the universe and listing IDs from the membership file, exact UTC timestamps and a nonnegative fractional weight from 0 to 1 with up to six decimal places. A blank weight means missing. Zero is a reported weight. Sector labels contain up to 40 ASCII letters, digits, spaces or `._-/&`. Blank or absent sectors appear in **Unclassified**. Reports may arrive before or after their effective times. Rows can be unordered. The import limit is 10,000 rows and 1 MiB of UTF-8. [Synthetic sector reports](../crates/core/tests/fixtures/synthetic-universe-sectors.csv).

For each listing, select the latest effective report at or before the target that has at least one visible revision. At that effective time take the latest revision observed by the known cutoff, inclusive. Later observations can correct or clear either field. Each row is a full replacement of both fields. Duplicate listing, effective and observation keys fail validation. Weights remain as supplied, so the displayed sum can differ from 100% when data are incomplete or membership changes.

## Weight coverage and attribution

- The heatmap preserves every member returned by the screen, including unranked members. Removed and delisted listings therefore contribute no tiles or weight.
- Known weight sums the reported weights of members. Covered weight sums weights for members with both a weight and a ranked return. The heatmap also counts missing weights.
- Sector weighted return is the sum of weight × return divided by that sector's covered weight. Contribution divides the same observed numerator by known weight across the universe. Missing inputs provide no contribution, and their known weights stay in the coverage denominator.
- Both measures show a dash when their denominator is zero. Observed contribution is partial when coverage is incomplete. Contributions aggregate from the same unrounded numerators. Displayed rows can differ from a displayed total by rounding. The engine rounds each price ratio to 12 decimal places before weighting, then displays returns and contributions to four decimal percentage places with midpoint rounding away from zero.

## Verified demo cutoffs

| Effective UTC | Known UTC | Sector and weight evidence |
| --- | --- | --- |
| 14:10 | 14:10 | ALFA in Technology and BETA in Financials. BETA's close is late. Covered weight is 60% of 100% known and observed contribution is 1.2%. |
| 14:10 | 14:12 | Full weight coverage and 6% observed contribution. Financials returns 12% and contributes 4.8 percentage points. |
| 14:10 | 14:16 | BETA moves to Technology after the sector revision. Its price revision makes the group's weighted return 1.6%. |
| 14:20 | 14:25 | Only BETA remains after ALFA's removal becomes known. Its 40% known weight is fully covered. |
| 14:35 | 14:35 | The heatmap is empty after BETA-001 is delisted. |
| 14:45 | 14:45 | BETA-002 appears in Unclassified with missing weight and return. |
| 14:50 | 14:50 | ALFA has moved to Industrials. The now-classified new BETA remains missing its weight. |

Times are UTC on June 2, 2025. Rewind to restore earlier classifications, prices and coverage. [Architecture decision](adr/0008-sector-attribution.md).
