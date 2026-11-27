# Point-in-time portfolio replay

Open **Historical replay → Open universe replay** and load membership. In **Portfolio replay**, load a demo or provide holdings and close-price CSVs. Delisting terms, dividends, spin-offs and spin-off cash terms are optional. Use the universe effective and knowledge times for the portfolio query.

| Input | Contract |
| --- | --- |
| Membership | Dated listing states with stable IDs, including delistings and reused tickers. |
| Holdings | Absolute whole shares by listing with an effective time, observation time and declared currency for its closes. |
| Closes | A close at the exact effective cutoff, from the latest quote revision observed by the knowledge cutoff. |
| Delisting terms | Consideration in the reported currency, a payment time when available, and observation times for revisions. |
| Dividends | Dated terms by stable listing ID, with observed revisions, ex and pay times, distribution currency and amount per share. |
| Spin-offs | Dated terms connecting a parent and child listing ID, with separate entitlement and distribution times and an exact share ratio. |
| Spin-off cash terms | A cash rate per child share, currency, payment date and observation time for the spin-off action ID. |

Holdings revisions share a listing and effective timestamp and have distinct observation times. A later observation may restate the quantity at that earlier effective time. The replay chooses the latest effective quantity visible at the query cutoffs. An explicit zero removes an ordinary holding from the view. A universe removal leaves an ordinary holding invested. At a known effective delisting, the ledger values the quantity held strictly before the delisting timestamp and preserves its listing ID. A new listing with the same ticker keeps a separate quantity and cash history.

Missing closes and missing delisting proceeds appear in the holdings table with unavailable amounts. The currency table adds valued shares, delisting receivables and settled delisting cash into a known subtotal for each currency. Source currencies remain separate. Delisting value can move among an unavailable claim, a receivable and cash as the latest terms become known or effective. Cash and claims can be restated by later terms or holding evidence. Rewind both cutoffs to reproduce the earlier view. The [delisting proceeds](delisting-proceeds.md) panel shows chronological cash postings for a single fixed holding.

With dividend reports loaded, the currency table adds independent dividend receivable and cash columns to the known subtotal. The entitlement table shows the latest report observed by the knowledge cutoff once the ex time is effective. Entitlement uses the latest quantity effective strictly before the ex time and visible by the knowledge cutoff. Missing pre-ex holdings or membership remain unavailable. An explicit zero rate, zero holding or known delisting effective by ex gives no payment. An entitlement established before delisting can still be receivable or paid. Payment is effective at the reported pay time. A late quantity or terms revision can restate the snapshot, including the distribution currency. Stable listing IDs separate dividends across ticker reuse.

The synthetic portfolio holds ALFA-001 and BETA-001. At the 14:10 UTC effective cutoff, BETA-001 has no visible close until knowledge reaches 14:12. The known USD share value then moves from 204 to 764. Once BETA-001 is delisted, its 70 USD receivable is distinct from 225 EUR of marked shares in BETA-002 at 14:45. At 14:50, the USD subtotal is 284, comprising 214 in shares and 70 in delisting cash. A later corrected quantity leaves 64 USD of settled proceeds at 14:58. Revised terms replace that payment with 72 EUR at 15:04.

## Holdings CSV

```csv
universe,listing_id,effective_at,observed_at,shares,quote_currency
DEMO-BASKET,BETA-001,2025-06-02T14:06:00Z,2025-06-02T14:06:00Z,10,USD
```

Supply exact UTC timestamps, 0–1,000,000 whole shares, and a consistent three-letter uppercase quote currency per listing. Holdings observations must be on or after effect. Supply at most 10,000 reports across 1,000 listings in 2 MiB. Include observed holding changes from trades and stock splits in the quantity history. The view applies the supplied valuation evidence, keeps the source reports intact, and operates independently of the paper account.

[Holdings fixture](../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [Close fixture](../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [Membership fixture](../crates/core/tests/fixtures/synthetic-universe.csv) · [Delisting fixture](../crates/core/tests/fixtures/synthetic-delisting-terms.csv)

## Portfolio dividends CSV

```csv
universe,listing_id,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO-BASKET,ALFA-001,ALFA-INCOME,2025-06-02T14:01:00Z,2025-06-02T14:10:00Z,2025-06-02T14:45:00Z,2025-06-02T14:03:00Z,USD,1.25
```

Use exact UTC timestamps and at most 1,000 reports in 1 MiB. Revisions share a universe, listing ID and dividend ID and have distinct observation times. Currency is the three-letter uppercase distribution currency. Rates are fixed-point with up to six fractional places. The view reports gross entitlements.

Choose **Load dividend income demo**. At 14:37 UTC the portfolio has 7.50 USD of dividend receivables and a separate 70 USD delisting receivable. At 14:55 the dividend cash totals are 5 USD and 8 EUR. Keeping the effective cutoff fixed and advancing knowledge to 14:58 restates the USD amount to 4. [Dividend fixture](../crates/core/tests/fixtures/synthetic-portfolio-dividends.csv)

## Portfolio spin-off CSV

```csv
universe,action_id,parent_listing,child_listing,announced_at,entitlement_at,distribution_at,observed_at,numerator,denominator
DEMO-BASKET,BETA-UNIT,BETA-001,ALFA-001,2025-06-02T14:16:00Z,2025-06-02T14:20:00Z,2025-06-02T14:40:00Z,2025-06-02T14:17:00Z,1,3
```

Supply at most 1,000 reports in 1 MiB. Use distinct parent and child listing IDs from the supplied universe and a stable action ID for all revisions. Use exact UTC timestamps. Announcement is on or before entitlement and observation. Distribution is on or after entitlement. Each revision has a distinct observation time. The numerator is an integer from 0 to 1,000,000, and the denominator is an integer from 1 to 1,000,000. A zero numerator cancels the action.

At each query the newest report visible by the knowledge cutoff controls the action. The entitlement time must be effective. The parent quantity comes from the latest holding effective strictly before entitlement and known by the knowledge cutoff. A known delisting at entitlement or an explicit zero parent holding gives zero. Absent membership or pre-entitlement holdings appear as **Entitlement unavailable**. Positive child units are **Shares receivable** until the distribution time and **Shares distributed** at and after it.

The table displays child shares as reduced fractions and shows the holding observation used for entitlement. The supplied holdings history remains authoritative for portfolio valuation. Record actual settlement quantities and subsequent trades in the holdings CSV. Cost-basis allocation remains roadmap work.

Choose **Load spin-off demo**. At effective 14:40 UTC with knowledge 14:49:59, BETA-UNIT shows 10/3 ALFA-001 shares distributed. Advancing knowledge to 14:50 restates that result to 20/3 shares receivable with a distribution time of 14:55. At effective 14:55 and known 14:58, corrected parent holdings yield 16/3 shares distributed. The cancellation becomes visible at known 15:02. BETA-001 and BETA-002 retain their own listing identities even though both use the BETA ticker. [Spin-off fixture](../crates/core/tests/fixtures/synthetic-portfolio-spin-offs.csv)

## Spin-off cash-in-lieu CSV

```csv
universe,action_id,pay_at,observed_at,currency,amount_per_child_share
DEMO-BASKET,BETA-UNIT,2025-06-02T14:48:00Z,2025-06-02T14:24:00Z,USD,3
```

Load cash terms alongside the corresponding spin-off reports. Use exact UTC timestamps, three uppercase currency letters and a nonnegative rate with up to six decimal places. Each revision keeps the action ID and has a distinct observation time. A zero rate cancels payment for the fractional shares. Supply at most 1,000 reports in 1 MiB.

The cash amount is the fractional remainder of the gross child entitlement multiplied by the latest rate known at the query cutoff. The engine rounds the amount once to the nearest millionth of the reported currency, with ties rounded up. A positive fractional claim becomes paid once both the distribution time and the pay date are effective. Missing terms and missing holdings each have their own state.

In the spin-off demo, the original 10/3 shares yield 1 USD of cash at 14:48 UTC. A subsequent rate and distribution revision makes 4 EUR receivable at 14:52. At effective 14:55 and known 14:58, the holding correction yields 2 EUR paid. Rewinding the knowledge cutoff recovers the original rate and amount. [Cash terms fixture](../crates/core/tests/fixtures/synthetic-spin-off-cash-terms.csv)
