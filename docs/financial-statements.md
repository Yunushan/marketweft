# Point-in-time financial statements and valuation

Open **Historical replay → Open financial statements → Start financial demo**. The demo holds the valuation time at 14:00 UTC on April 3, 2025 and advances the independent knowledge clock. Change either clock or select a different issuer to run another query.

| Known as of UTC | Selected filing and valuation |
| --- | --- |
| 14:00 | ALFA-FY24 is available. The market-cap report for 14:00 has yet to arrive. |
| 14:01 | Original filing and USD 12 billion capitalization give 10× P/E, 2× P/S and 4× P/B. |
| 14:19:59 | The restatement has been published and the original filing remains the one known to this dataset. |
| 14:20 | The restatement becomes known. P/E is 15× and P/S is 1.5×. Common equity is absent from the revised statement, so P/B is unavailable. |
| 14:25 | The old preliminary filing arrives. The later published restatement stays selected. |
| 14:35 | Revised USD 16 billion capitalization gives 20× P/E and 2× P/S. |

Use **Original filing** to return to the earlier view. The annual statement displays source, fiscal period, currency, publication time and observation time. The capitalization panel shows its own source and observation time.

## Local input

Upload **Financial filings CSV**. Supply **Capitalization CSV** to calculate valuation multiples. These inputs use a stable issuer ID and an immutable source filing or observation ID. The portable build includes synthetic filings and capitalization. [Annual filing fixture](../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [Capitalization fixture](../crates/core/tests/fixtures/synthetic-financial-market-caps.csv).

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

- Use source-level publication and observation times, chronological fiscal dates, exact UTC timestamps and the source currency's three uppercase letters. Monetary values are in currency units with up to six decimals and an absolute limit of 10²¹. Blank fields are missing, and zero stays distinct. Market capitalization must be positive.
- Each filing row is a full vintage for one issuer and fiscal period. A restatement can explicitly leave a prior value absent. A filing ID has one publication time and can cover more than one fiscal period. Each issuer, period kind and fiscal end require a consistent start and distinct publication and observation pairs. Each file allows up to 10,000 data rows and 1 MiB.
- A provider adapter must retain original filed values, filing identity and when its vintages became available. The application reads local files supplied by the user. A public source such as EDGAR exposes submission history and XBRL facts separately. [SEC EDGAR data APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) · [SEC filing identifiers](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data).

## Selection and multiples

1. Consider fiscal periods that had ended before the valuation time. Choose the most recent eligible fiscal end with an observed vintage. Within that period, pick the newest publication known at the cutoff, using the latest observed copy of that publication. Publication follows the fiscal end date and observation can equal publication.
2. Choose capitalization at the exact valuation time from the latest report observed by the same known cutoff. When the knowledge cutoff exceeds valuation time, the query reconstructs a historical valuation with the later information that is explicitly requested.
3. Divide common-equity market value by common net income for P/E, by reported revenue for P/S, or by common book equity for P/B. The caller supplies comparable issuer-level amounts and one currency for both reports. The app reports a reason whenever the filing, exact capitalization, matching currency, or positive denominator is unavailable. It displays exact fixed-point multiples rounded to six decimal places. [Definitions of valuation multiples](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/definitions.html).

## Quarterly filings and trailing twelve months

Use the original header for annual-only files. For a quarterly or mixed file, insert `period_kind` after `filing_id` and mark each row `annual` or `quarter`. Supply standalone quarter amounts for revenue, net income and operating cash flow. Cumulative year-to-date values require conversion before import. Annual and quarterly vintages can share a fiscal end.

The **Quarterly financial results** panel shows up to four eligible quarters in fiscal order with their source, publication time, observation time and exact values. The trailing totals require four contiguous fiscal quarters in one currency. A gap, overlap or mixed currency leaves the totals unavailable. A missing value in any quarter leaves that metric unavailable. Common equity is a balance at a date and appears on the individual filing row.

At 14:04:59 UTC in the demo, three quarters are known. The late second quarter arrives at 14:05:00 UTC, so trailing revenue becomes USD 6,000,000,000.00001. At 14:22:00 UTC a fourth-quarter restatement raises revenue to USD 8,000,000,000.00001 and leaves trailing net income unavailable. Choose **Four quarters known** to rewind. [Quarterly and annual fixture](../crates/core/tests/fixtures/synthetic-financial-periods.csv).

## Choose a valuation basis

In **Valuation results**, choose **Annual filing** or **Trailing twelve months**. Both bases use the same exact capitalization observation and applied UTC cutoffs. The annual basis uses fields from the selected annual filing. The trailing basis uses the four-quarter net income and revenue for P/E and P/S, and common equity from the latest eligible quarter for P/B. The latest quarterly filing ID appears beneath the multiples.

Before the fourth required quarter arrives, trailing P/E and P/S show the coverage reason. Quarterly P/B can appear as soon as the latest quarter and matching capitalization are available. At 14:05 UTC in the demo, trailing P/E, P/S and P/B are 10×, 2× and 4×. At 14:22 UTC the revised quarter leaves P/E and P/B unavailable and changes P/S to 1.5×. Rewind to restore all three original values. [Architecture decision](adr/0009-financial-vintages.md).

The native CLI and Python SDK expose the same snapshot using the same Rust calculations and exact integer units. [Native financial snapshots](../packages/python-research/README.md#financial-snapshots).
