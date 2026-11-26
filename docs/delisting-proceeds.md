# Point-in-time delisting proceeds

Open **Historical replay → Open universe replay** and load the universe demo or a local membership report. In **Delisting proceeds**, load the demo terms or import a terms CSV. Select a stable listing ID and the number of shares held at delisting. The panel uses the effective and known cutoffs from the universe replay query.

Each terms row joins to a delisting by listing ID and change ID. Reusing a ticker on the same venue with a new listing ID keeps the holdings and proceeds for each listing separate. A routine removal from the universe keeps the position in shares. A delisting replaces the simulated ordinary shares with a claim once the membership change is effective and known. Before those conditions, the ordinary position remains visible if the listing has been observed.

The latest terms observed by the knowledge cutoff determine the claim value. Empty proceeds mean the amount is unavailable. Explicit zero means known zero consideration. A known amount with a future or unscheduled pay time is a receivable. The cash ledger runs chronologically through the earlier of the two cutoffs. It credits proceeds at the first time when the pay and observation conditions are met. A revised amount posts the difference at its observation time. A revised currency reverses the old posting and records the new currency when its own payment becomes eligible. If a known membership cancellation restores the old share status, the ledger reverses the previously recognized cash claim.

The return uses proceeds per share and the reported positive reference close. The reference close must occur by the effective delisting and be available by the terms observation. A reference in a different currency leaves the return unavailable. The ledger holds nominal values in each reported currency. This single-position replay uses the selected share quantity at delisting. Portfolio execution, corporate successor securities and foreign exchange remain on the [roadmap](../ROADMAP.md).

## Terms report

Use UTC timestamps and fixed-point amounts with up to six fractional places. Empty fields for `pay_at`, `currency` and `proceeds_per_share` mean missing proceeds. A blank `pay_at` with currency and proceeds means payment has yet to be scheduled. Leave the reference time, price and currency blank together when a last close is unavailable. The two CSVs must link by the stable IDs. A duplicate vintage with the same observation time is rejected.

```csv
listing_id,change_id,observed_at,pay_at,currency,proceeds_per_share,reference_at,reference_close,reference_currency
BETA-001,BETA-DELIST,2025-06-02T14:37:00Z,2025-06-02T14:50:00Z,USD,7,2025-06-02T14:28:00Z,10,USD
```

The demo holds ten shares of BETA-001. The 14:30 UTC delisting is observed at 14:35, when proceeds are unavailable. Terms observed at 14:37 give a 70 USD receivable and a −30% return on the reference close. The ledger posts 70 USD at 14:50, adjusts to 80 USD at 14:55, reverses it at 15:01, and records 90 EUR at 15:04. An explicit zero correction at 15:05 reverses that cash. BETA-002 remains an independent holding throughout this later period.

[Membership replay contract](universe-membership.md) · [Membership fixture](../crates/core/tests/fixtures/synthetic-universe.csv) · [Terms fixture](../crates/core/tests/fixtures/synthetic-delisting-terms.csv)
