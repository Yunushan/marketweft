# Point-in-time universe screen

Open **Historical replay → Open universe replay → Start universe demo**, then choose **Load demo prices** in **Universe screen**. The screen shares the replay's effective and known times. Set **Baseline time (UTC)** and select **Set baseline** to change the first price time. The baseline defaults to the first membership replay cutoff.

The example starts at 14:00 UTC on June 2, 2025. Use **Next cutoff** for the synchronized membership timeline. To inspect a price report or revision between membership checkpoints, use **Run as-of query** with the times in this table.

| Effective UTC | Known UTC | Ranked and unranked members |
| --- | --- | --- |
| 14:05 | 14:05 | ALFA-001 leads at +1%. BETA's available close is outside the effective membership. |
| 14:10 | 14:10 | ALFA-001 leads at +2%. BETA-001 joins and is unranked because its target close is late. |
| 14:10 | 14:12 | BETA-001 leads at +12%, followed by ALFA-001 at +2%. |
| 14:10 | 14:16 | The corrected BETA-001 close reduces its return to +1%, behind ALFA-001's +2%. |
| 14:20 | 14:24:59 | BETA-001 leads at +8%, followed by ALFA-001 at +4%. |
| 14:20 | 14:25 | Only BETA-001 remains, ranked first at +8%. ALFA's late removal report is now visible. |
| 14:35 | 14:35 | No members remain after BETA-001's delisting is known. |
| 14:45 | 14:45 | BETA-002 is a member and has a target close. It is unranked because its own baseline is missing. |

Restore an earlier known time to reconstruct the corresponding rank, prices and missing values.

## Price input

Load a [membership CSV](universe-membership.md) first, then choose **Universe prices CSV → Load prices**. Use the same universe ID and stable listing IDs in both files. The portable build includes `universe-membership.csv` and `universe-prices.csv`. [Generated price fixture](../crates/core/tests/fixtures/synthetic-universe-prices.csv).

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

- Supply UTF-8 with exact `YYYY-MM-DDTHH:MM:SSZ` times, a positive close up to 2,000,000,000 and at most six decimal places. Reports may be unordered. The limit is 20,000 rows and 2 MiB. A header-only file represents no prices.
- `price_at` identifies the close. `observed_at` is when that value was available and must be at or after `price_at`. Revise a close by adding a row for the same listing and price time with a later observation time. Duplicate listing, price and observation keys are errors.
- Use the same currency and price basis for both endpoints of a listing. Feed any point-in-time adjustments as input revisions. The screen calculates price return and has no dividend cash flows, FX conversion or delisting proceeds.

## Ranking contract

1. Select memberships effective at the target from revisions known at the inclusive observation cutoff. A new member can rank using its own pre-membership baseline if that close was known. A removed or delisted listing stays outside the screen.
2. Require a close at each exact endpoint. At each time, select the latest report observed by the knowledge cutoff. The baseline can equal the target. An absent endpoint leaves the listing visible with that endpoint marked **Missing**, no rank and no return. There is no stale-price carry-forward.
3. Rank descending by `(target / baseline − 1) × 100`. Compare the exact ratios with integer cross-products. Exact ties share rank and leave a gap before the next rank. Listing ID orders ties and unranked rows. Display percentages round to four decimal places with halfway values away from zero. The screen shows each selected close and when it became known.

Screening is local and available offline after the app installs its asset cache. Membership reports and close prices stay in the current replay view. [Architecture decision](adr/0007-point-in-time-screen.md).
