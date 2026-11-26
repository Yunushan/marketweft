# Point-in-time portfolio replay

Open **Historical replay → Open universe replay** and load membership. In **Portfolio replay**, load the demo or provide holdings and close-price CSVs with an optional delisting terms report. Use the universe effective and knowledge times for the portfolio query.

| Input | Contract |
| --- | --- |
| Membership | Dated listing states with stable IDs, including delistings and reused tickers. |
| Holdings | Absolute whole shares by listing with an effective time, observation time and declared currency for its closes. |
| Closes | A close at the exact effective cutoff, from the latest quote revision observed by the knowledge cutoff. |
| Delisting terms | Consideration in the reported currency, a payment time when available, and observation times for revisions. |

Holdings revisions share a listing and effective timestamp and have distinct observation times. A later observation may restate the quantity at that earlier effective time. The replay chooses the latest effective quantity visible at the query cutoffs. An explicit zero removes an ordinary holding from the view. A universe removal leaves an ordinary holding invested. At a known effective delisting, the ledger values the quantity held strictly before the delisting timestamp and preserves its listing ID. A new listing with the same ticker keeps a separate quantity and cash history.

Missing closes and missing delisting proceeds appear in the holdings table with unavailable amounts. The currency table adds valued shares, delisting receivables and settled delisting cash into a known subtotal for each currency. Source currencies remain separate. Delisting value can move among an unavailable claim, a receivable and cash as the latest terms become known or effective. Cash and claims can be restated by later terms or holding evidence. Rewind both cutoffs to reproduce the earlier view. The [delisting proceeds](delisting-proceeds.md) panel shows chronological cash postings for a single fixed holding.

The synthetic portfolio holds ALFA-001 and BETA-001. At the 14:10 UTC effective cutoff, BETA-001 has no visible close until knowledge reaches 14:12. The known USD share value then moves from 204 to 764. Once BETA-001 is delisted, its 70 USD receivable is distinct from 225 EUR of marked shares in BETA-002 at 14:45. At 14:50, the USD subtotal is 284, comprising 214 in shares and 70 in delisting cash. A later corrected quantity leaves 64 USD of settled proceeds at 14:58. Revised terms replace that payment with 72 EUR at 15:04.

## Holdings CSV

```csv
universe,listing_id,effective_at,observed_at,shares,quote_currency
DEMO-BASKET,BETA-001,2025-06-02T14:06:00Z,2025-06-02T14:06:00Z,10,USD
```

Supply exact UTC timestamps, 0–1,000,000 whole shares, and a consistent three-letter uppercase quote currency per listing. Holdings observations must be on or after effect. Supply at most 10,000 reports across 1,000 listings in 2 MiB. Include observed holding changes from trades and stock splits in the quantity history. The view applies the supplied valuation evidence, keeps the source reports intact, and operates independently of the paper account.

[Holdings fixture](../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [Close fixture](../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [Membership fixture](../crates/core/tests/fixtures/synthetic-universe.csv) · [Delisting fixture](../crates/core/tests/fixtures/synthetic-delisting-terms.csv)
