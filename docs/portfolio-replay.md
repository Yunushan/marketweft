# Point-in-time portfolio replay

Open **Historical replay → Open universe replay** and load membership. In **Portfolio replay**, load a demo or provide holdings and close-price CSVs. Optional reports include delisting cash, successor shares, dividends, spin-offs and subscription rights. Use the universe effective and knowledge times for the portfolio query. A subscription rights report can be replayed with holdings alone. [Subscription rights](portfolio-rights.md)

| Input | Contract |
| --- | --- |
| Membership | Dated listing states with stable IDs, including delistings and reused tickers. |
| Holdings | Absolute whole shares by listing with an effective time, observation time and declared currency for its closes. |
| Closes | A close at the exact effective cutoff, from the latest quote revision observed by the knowledge cutoff. |
| Delisting terms | Consideration in the reported currency, a payment time when available, and observation times for revisions. |
| Delisting successor shares | An exchange ratio, stable successor listing, optional delivery time and observation time for a known delisting. |
| Dividends | Dated terms by stable listing ID, with observed revisions, ex and pay times, distribution currency and amount per share. |
| Spin-offs | Dated terms connecting a parent and child listing ID, with separate entitlement and distribution times and an exact share ratio. |
| Spin-off cash terms | A cash rate per child share, currency, payment date and observation time for the spin-off action ID. |
| Spin-off basis terms | Original total parent basis, currency, child allocation fraction and observation time for the spin-off action ID. |
| Subscription rights | Reported exercise windows, eligible and subscription listing IDs, exact ratios, fraction policy and quoted cash requirements. |

Holdings revisions share a listing and effective timestamp and have distinct observation times. A later observation may restate the quantity at that earlier effective time. The replay chooses the latest effective quantity visible at the query cutoffs. An explicit zero removes an ordinary holding from the view. A universe removal leaves an ordinary holding invested. At a known effective delisting, the ledger values the quantity held strictly before the delisting timestamp and preserves its listing ID. A new listing with the same ticker keeps a separate quantity and cash history.

Missing closes and missing delisting proceeds appear in the holdings table with unavailable amounts. The currency table adds valued shares, delisting receivables and settled delisting cash into a known subtotal for each currency. Source currencies remain separate. Delisting value can move among an unavailable claim, a receivable and cash as the latest terms become known or effective. Cash and claims can be restated by later terms or holding evidence. Rewind both cutoffs to reproduce the earlier view. The [delisting proceeds](delisting-proceeds.md) panel shows chronological cash postings for a single fixed holding.

With dividend reports loaded, the currency table adds independent dividend receivable and cash columns to the known subtotal. The entitlement table shows the latest report observed by the knowledge cutoff once the ex time is effective. Entitlement uses the latest quantity effective strictly before the ex time and visible by the knowledge cutoff. Missing pre-ex holdings or membership remain unavailable. An explicit zero rate, zero holding or known delisting effective by ex gives no payment. An entitlement established before delisting can still be receivable or paid. Payment is effective at the reported pay time. A late quantity or terms revision can restate the snapshot, including the distribution currency. Stable listing IDs separate dividends across ticker reuse.

The synthetic portfolio holds ALFA-001 and BETA-001. At the 14:10 UTC effective cutoff, BETA-001 has no visible close until knowledge reaches 14:12. The known USD share value then moves from 204 to 764. Once BETA-001 is delisted, its 70 USD receivable is distinct from 225 EUR of marked shares in BETA-002 at 14:45. At 14:50, the USD subtotal is 284, comprising 214 in shares and 70 in delisting cash. A later corrected quantity leaves 64 USD of settled proceeds at 14:58. Revised terms replace that payment with 72 EUR at 15:04.

## Equity concentration

Open **Equity concentration** in the portfolio results. Each quote currency shows the absolute value of its known marked shares and the number of holdings without a close. The table keeps each signed share value and ranks its absolute magnitude. Holdings with equal magnitudes are ordered by stable listing ID. The weight is the absolute share value divided by the currency’s known gross share value, rounded to six decimal places in percentage points. Missing marks have no rank or weight. When all known marks are zero, each weight and rank stays unavailable.

The concentration uses exact closes at the selected effective time, including revisions observed by the knowledge time. It includes holdings after a universe removal. After a known effective delisting, the existing cash and receivable tables carry the proceeds. The equity concentration groups marked shares by their original quote currencies. Holdings with unobserved listings appear under **Currency unavailable** until their listing evidence is visible.

In **Load portfolio demo**, keep the effective time at 14:10 UTC on 2025-06-02. At the 14:10 knowledge cutoff, the known USD gross is 204 and BETA-001 has no rank. At 14:12, BETA-001 has 73.298429% of 764 USD. At 14:16, its revised mark gives it 71.22708% of 709 USD. Returning knowledge to 14:10 restores the missing mark. At both 14:45 cutoffs, BETA-002 has 100% of the 225 EUR in marked equity.

### Compare two equity cutoffs

Open **Equity concentration** and select **Pin equity baseline**. Set a different effective time, knowledge time, or both and run the as-of query. The comparison lines up positions by stable listing ID and quote currency. It shows the signed mark, exact weight and rank at each cutoff, with a weight change in percentage points and a rank improvement when both sides have ranks. A positive improvement means the listing moved closer to rank one.

**Mark unavailable** means the holding is in the comparison group and has no observed mark. **Outside equity** means the holding is absent from that currency’s equity group at that cutoff. Zero marks and zero changes appear as zero. A missing weight or rank leaves its change unavailable.

Pin the demo at effective 14:10 and known 14:12 UTC, then change knowledge to 14:16. BETA-001’s USD weight falls by 2.071349 percentage points and its rank stays at 1. At effective and known 14:45, the old USD listing is outside equity and BETA-002 appears in EUR. Rewind to the pinned cutoffs to see zero changes. Choose **Replace equity baseline** to pin the current result or **Clear equity baseline** to remove the comparison. Opening a new set of reports clears the baseline.

#### Export an equity comparison

Choose **Download equity comparison** to save every row with both effective and knowledge times in UTC. The CSV uses signed integer millionths of a currency unit for marks and integer millionths of a percentage point for weights and weight changes. Ranks and rank improvement use whole numbers. Each cutoff has its own `marked`, `mark-unavailable` or `outside-equity` state. Blank numeric cells mean the value was unavailable, and a recorded zero is written as `0`.

The corrected demo row records a weight change of `-2071349` and rank improvement of `0`. Repeating the download after rewinding to the same cutoffs produces the same bytes. The CSV downloads locally and works offline.

### Equity concentration SDKs

The TypeScript SDK exposes `equityConcentrationAsOf(membershipCsv, holdingsCsv, pricesCsv, effectiveAt, knownAt)`. Python exposes `ResearchEngine.equity_concentration_as_of` with the same three CSV contents and the `effective_at` and `known_at` keyword cutoffs. Both return the applied cutoffs in whole Unix seconds and the same ranked groups shown by the terminal. Marks and weights are integer millionths. TypeScript uses `bigint` for both, and Python uses integers. Missing values are `null` in TypeScript and `None` in Python. [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md)

Run `marketweft-research equity-concentration` with a version 1 UTF-8 request on stdin. The first line is `marketweft-equity-concentration`, version `1`, membership CSV byte length and holdings CSV byte length, separated with tabs. The next two lines contain effective and known UTC cutoffs. Append the membership, holdings and close CSV contents in order. The first response line repeats the protocol and version, followed by the group count. The `H` row echoes both Unix cutoffs, `G` rows carry the currency and known gross, and each group's `E` rows contain the listing ID, signed mark, rank and weight. Empty fields represent unavailable values.

The same concentration results are available in the read-only MCP server and through screen-scoped REST, WebSocket and gRPC. Each returns paged rows with ranks, missing marks and known gross values. [MCP tool](local-mcp-research.md#equity-concentration) · [Research service](local-rest-research.md#equity-concentration)

## Equity allocation targets

Open **Equity allocation targets** after loading portfolio holdings and closes. Load the demo or supply a UTF-8 CSV with the following header.

```csv
universe,listing_id,quote_currency,effective_at,observed_at,target_weight_pct
```

Each report applies to a stable listing ID from the supplied universe and a three-letter uppercase quote currency. Supply whole UTC seconds for both times. A report may be observed before it takes effect. At each replay cutoff, the latest effective state that has an observed report is used. A newer observation for that same effective time revises it.

A target weight is 0–100 with up to six decimal places. A blank target weight withdraws the target for that listing and currency. An explicit zero remains a reported target. The current targets in each currency must sum to at most 100%. The view accepts up to 10,000 reports in a file of at most 2 MiB.

The table subtracts the target from the actual share of known gross equity in the same currency. This difference uses percentage points. An unavailable actual weight or target leaves the difference blank. **Outside equity**, **Weight unavailable**, **No target**, and **Withdrawn** identify different evidence. A holding with an unknown close can affect the denominator once the close is observed.

In the demo with effective time 14:10 UTC on 2025-06-02, BETA-001’s 60% target arrives at 14:11 and its first close at 14:12. That close produces a drift of 13.298429 percentage points. At known 14:16 the 70% target and revised close reduce drift to 1.22708 points. Rewind the knowledge time to restore the original figures. At effective and known 14:45 the withdrawn USD target stays visible alongside the distinct EUR BETA-002 target and its zero drift. [Synthetic equity targets](../crates/core/tests/fixtures/synthetic-equity-targets.csv)

### Compare equity targets

Choose **Pin target baseline** in **Equity allocation targets**, then run another query with different effective or known times. The terminal compares the stable listing and quote currency across both cutoffs. Each side shows the actual weight, target and drift. The change is the current drift minus the baseline drift when both are available. Choose **Replace target baseline** to pin the current query or **Clear target baseline** to remove the comparison. Loading new target or portfolio reports clears the baseline.

With effective 14:10 UTC on June 2, 2025, pin the result known at 14:12 and advance knowledge to 14:16. BETA-001’s drift falls by exactly 12.071349 percentage points. At 14:45 the old USD row keeps its withdrawal and the EUR successor appears on the current side with zero drift.

Choose **Download target comparison** to save every row, including rows on later pages, with both query cutoffs and each target's effective and observed UTC times. The CSV uses signed integer millionths of a percentage point. Each side records its equity and target states. Blank numeric fields represent unavailable values. A known zero is `0`. Rewind to repeat the same export bytes offline.

### Equity target research SDKs

TypeScript exposes `equityTargetDriftAsOf(membershipCsv, holdingsCsv, pricesCsv, termsCsv, targetsCsv, effectiveAt, knownAt)`. Python exposes `ResearchEngine.equity_target_drift_as_of` with the same five reports and keyword arguments `effective_at` and `known_at`. The delisting terms may be empty. Both methods return the applied cutoffs in Unix seconds and the same rows as the browser. Weights and drift are integer millionths of a percentage point. The nested target report retains both source times and a withdrawn target has an empty weight. [Research service](local-rest-research.md#equity-target-drift) · [Local MCP tool](local-mcp-research.md#equity-target-drift) · [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md)

Run `marketweft-research equity-target-drift` with a UTF-8 request on standard input. The first line has six tab-separated fields, starting with `marketweft-equity-target-drift` and version `1`, followed by the byte lengths of the membership, holdings, closes and delisting terms CSVs. The next two lines contain the effective and known UTC timestamps. Append those four CSV contents and then the target CSV. The byte limits are 1, 2, 2, 1 and 2 MiB respectively.

The response echoes the protocol and version with the row count. The `H` row contains both applied Unix seconds. Each following row has the quote currency, listing ID, equity presence flag, actual weight, target effective and observed Unix seconds, target weight and drift. Empty fields encode unavailable evidence. A presence flag of `1` means the holding is in equity at that cutoff.

## Portfolio currency translation

Choose **Load portfolio FX demo**, or add **Portfolio FX rates CSV** when opening your holdings and close reports. Open **Portfolio currency translation** and apply a three-letter reporting currency. The table converts the known currency subtotals shown directly above it. Those subtotals include valued shares, delisting cash and receivables, and dividend subtotals when dividend reports are present. The converted subtotal includes currencies with available conversions. The source table carries the original amounts and the positions table identifies missing valuations.

```csv
base_currency,quote_currency,rate_at,observed_at,quote_per_base
EUR,USD,2025-06-02T14:40:00Z,2025-06-02T14:46:00Z,1.2
```

Supply up to 10,000 reports in 1 MiB with distinct three-letter uppercase currencies and positive rates with at most six decimal places. The rate expresses quote currency units per base currency unit. Observation must occur at or after rate time. Reports with the same pair and rate time are revisions, ordered by their distinct observation times. [ECB exchange-rate conventions](https://data.ecb.europa.eu/methodology/exchange-rates).

The replay uses the latest rate effective by the portfolio cutoff and observed by the knowledge cutoff. When both quote directions are supplied at the same rate time, the later observation wins, and an exact tie selects the direct orientation. The table records the original quote orientation, rate time, observation time and whether it used the reciprocal. A same-currency amount carries through at identity. A currency without a visible pair shows **FX unavailable**. The engine rounds each conversion once to the nearest millionth, with ties away from zero, and sums those amounts.

Set **Effective time** to 14:45 UTC in the demo. The original 225 EUR and 70 USD stay visible at each knowledge cutoff. At 14:45, only 70 USD can be expressed in the default reporting currency. At 14:46, the 1.2 rate gives 340 USD, and at 14:49 the revised 1.3 rate gives 362.5 USD. A later report for an older rate time leaves the subtotal at 362.5 USD. Choosing EUR gives 278.846154 EUR using the same rate as a reciprocal. Rewind knowledge to 14:45 to reproduce the missing FX evidence. [Synthetic FX fixture](../crates/core/tests/fixtures/synthetic-portfolio-fx.csv).

### Portfolio FX research SDKs

The TypeScript SDK accepts the FX report contents, reporting currency, both UTC cutoffs and the known source subtotals as integer millionths.

```ts
const report = research.portfolioFxAsOf(
  rates, 'USD', '2025-06-02T14:45:00Z', '2025-06-02T14:49:00Z',
  [{ currency: 'EUR', subtotal: 225000000n }, { currency: 'USD', subtotal: 70000000n }],
)
```

The Python SDK exposes the same calculation through `ResearchEngine.portfolio_fx_as_of`. Use `FxAmount` records for source subtotals and the keywords `reporting_currency`, `effective_at` and `known_at`. Python returns integer values and TypeScript uses `bigint`. Both preserve the full signed 128-bit range. Each row keeps its original subtotal and the exact supporting quote when available. An identity conversion has a converted value without quote evidence. An unavailable conversion has neither. [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md).

The read-only MCP tool and scoped REST, WebSocket and gRPC routes use the same FX calculation. They page currency rows and preserve exact signed 128-bit amounts as decimal text. [Portfolio FX via MCP](local-mcp-research.md#portfolio-currency-conversion) · [Portfolio FX service](local-rest-research.md#portfolio-currency-conversion).

#### Native FX protocol

Run `marketweft-research portfolio-fx` with a UTF-8 request on standard input. Start with `marketweft-portfolio-fx` and version `1` separated by a tab. The next lines contain the effective timestamp, observed cutoff, reporting currency and tab-separated source entries in `currency=integer_millionths` form. Use an empty source line for an empty portfolio. Append the FX CSV after those lines.

The response begins with the protocol, version and source row count. An `H` line contains the reporting currency and converted known subtotal. Each `R` line has a currency, original subtotal and converted subtotal. When a quote was used, the row also contains its base, quote, rate time, observed time, rate in millionths and orientation flag. Timestamps in responses are whole UTC seconds. The orientation flag is `0` for direct and `1` for reciprocal. Empty numeric fields mark an unavailable converted amount or subtotal.

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

The table displays child shares as reduced fractions and shows the holding observation used for entitlement. The supplied holdings history remains authoritative for portfolio valuation. Record actual settlement quantities and subsequent trades in the holdings CSV. Supply basis terms to replay the reported allocation of the original position basis.

Choose **Load spin-off demo**. At effective 14:40 UTC with knowledge 14:49:59, BETA-UNIT shows 10/3 ALFA-001 shares distributed. Advancing knowledge to 14:50 restates that result to 20/3 shares receivable with a distribution time of 14:55. At effective 14:55 and known 14:58, corrected parent holdings yield 16/3 shares distributed. The cancellation becomes visible at known 15:02. BETA-001 and BETA-002 retain their own listing identities even though both use the BETA ticker. [Spin-off fixture](../crates/core/tests/fixtures/synthetic-portfolio-spin-offs.csv)

## Spin-off cash-in-lieu CSV

```csv
universe,action_id,pay_at,observed_at,currency,amount_per_child_share
DEMO-BASKET,BETA-UNIT,2025-06-02T14:48:00Z,2025-06-02T14:24:00Z,USD,3
```

Load cash terms alongside the corresponding spin-off reports. Use exact UTC timestamps, three uppercase currency letters and a nonnegative rate with up to six decimal places. Each revision keeps the action ID and has a distinct observation time. A zero rate cancels payment for the fractional shares. Supply at most 1,000 reports in 1 MiB.

The cash amount is the fractional remainder of the gross child entitlement multiplied by the latest rate known at the query cutoff. The engine rounds the amount once to the nearest millionth of the reported currency, with ties rounded up. A positive fractional claim becomes paid once both the distribution time and the pay date are effective. Missing terms and missing holdings each have their own state.

In the spin-off demo, the original 10/3 shares yield 1 USD of cash at 14:48 UTC. A subsequent rate and distribution revision makes 4 EUR receivable at 14:52. At effective 14:55 and known 14:58, the holding correction yields 2 EUR paid. Rewinding the knowledge cutoff recovers the original rate and amount. [Cash terms fixture](../crates/core/tests/fixtures/synthetic-spin-off-cash-terms.csv)

## Spin-off basis terms CSV

```csv
universe,action_id,observed_at,currency,original_parent_basis,child_basis_fraction
DEMO-BASKET,BETA-UNIT,2025-06-02T14:28:00Z,USD,1000.000004,0.25
```

Load this CSV with the corresponding spin-off reports. Enter the original total basis of the parent holding used for entitlement, a nonnegative decimal up to 2,000,000,000 in the reported currency. Enter the fraction assigned to the gross child entitlement from 0 through 1. Both decimals can have up to six places. Each revision keeps the same action ID and specifies a distinct UTC observation time. Use three uppercase currency letters. Supply at most 1,000 reports in 1 MiB.

The latest observed terms apply to the latest known distribution once it becomes effective. The engine rounds the child basis once to the nearest millionth, with ties rounded up, and takes its exact difference from the original to get the retained parent basis. Missing holdings, unavailable terms, pending distributions and canceled distributions have explicit states. The child basis covers the gross child entitlement. Lot-level allocation and gain or loss on fractional settlement remain roadmap work.

In **Load spin-off demo**, the BETA-UNIT distribution at effective 14:40 UTC and known 14:49:59 allocates 250.000001 USD to ALFA-001 and leaves 750.000003 USD with BETA-001. At effective and known 14:52, the later terms are visible in EUR and the revised distribution is still pending. At effective 14:55 and known 14:58 the allocation is 300.000001 EUR to the child and 900.000001 EUR to the parent. The 15:02 cancellation removes both allocations. [Basis fixture](../crates/core/tests/fixtures/synthetic-spin-off-basis-terms.csv)

## Delisting successor shares CSV

```csv
universe,listing_id,change_id,successor_listing,observed_at,deliver_at,numerator,denominator
DEMO-BASKET,BETA-001,BETA-DELIST,BETA-002,2025-06-02T14:37:00Z,2025-06-02T14:49:00Z,1,3
```

Use the universe, original listing and change IDs of a reported delisting and a distinct successor listing ID from the same universe. Each revision has a distinct UTC observation time. The numerator may be 0 through 1,000,000 and the denominator must be 1 through 1,000,000. A zero numerator clears the stock consideration. Leave the delivery time blank for an unscheduled claim. Supply at most 5,000 reports in 1 MiB.

The claim appears once the delisting is both effective and known. Its entitlement uses the last holding effective strictly before delisting and visible at the knowledge cutoff. The latest terms visible at that cutoff determine the successor listing, exact reduced share quantity and delivery time. An effective delivery marks the shares as delivered. A cancellation of the delisting removes the claim. The table keeps missing holdings, unavailable terms and zero consideration distinct.

Select **Load successor shares demo**. At effective 14:30 UTC and known 14:34:59 the delisting is unavailable. At known 14:35 the claim appears with unavailable terms. The original terms produce 10/3 BETA-002 shares, delivered at 14:49. At effective and known 15:00, revised terms and an eight-share holding produce six delivered ALFA-001 shares. Moving knowledge to 15:02 clears the stock consideration. The supplied holdings CSV remains the source for ordinary portfolio positions, and cash consideration remains in the delisting cash columns. [Successor share fixture](../crates/core/tests/fixtures/synthetic-successor-shares.csv)

## Successor delivery ledger

Expand **Successor delivery ledger** under the claim table. A posting appears when the delisting and scheduled delivery are effective and the necessary reports are known. The effective cutoff caps economic events. The knowledge cutoff caps posting timestamps, which lets a later correction change an earlier delivered balance. A scheduled delivery beyond the knowledge cutoff can appear in the claim table first.

Each row gives the signed change and delivered balance for its delisting and successor listing, as exact fractions. A revised quantity in the same claim posts the exact net change. A successor change reverses the old balance before crediting the new listing. A cancellation, zero rate or revised delivery schedule can also reverse a posting. A reversal cites the reports behind the delivered balance it removes. Pending and unscheduled entitlements are visible in the claim table.

Load the successor shares demo, set the effective cutoff to 15:00 UTC, then advance knowledge through these times on June 2, 2025.

| Known UTC | Posting | Delivered balance |
| --- | --- | --- |
| 14:48:59 | Waiting for the first delivery | 0 |
| 14:49 | BETA-002 receives 10/3 shares | 10/3 BETA-002 |
| 14:56 | Revised terms reverse 10/3 BETA-002 shares | 0 BETA-002 |
| 15:00 | A later schedule and corrected holding produce six ALFA-001 shares | 6 ALFA-001 |
| 15:02 | Zero terms reverse six ALFA-001 shares | 0 ALFA-001 |

**Download successor delivery ledger** exports all postings with both cutoffs, the delisting, holding, terms and delivery timestamps, and integer numerators and denominators. Rewinding knowledge to 14:49 reproduces the first export. For large inputs, use an earlier knowledge cutoff or supply fewer reports if the ledger exceeds two million membership and holding evaluations.
