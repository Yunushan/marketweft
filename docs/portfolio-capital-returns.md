# Point-in-time returns of capital

In **Portfolio replay**, select **Load capital return demo** or supply dated holdings and a **Portfolio capital returns CSV**. Add a **Capital return basis CSV** when you have a reported basis for the entitled holding. Closes are optional for this replay. [Portfolio holdings format](portfolio-replay.md)

## Distribution reports

~~~csv
universe,listing_id,action_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
~~~

Use a listing ID from the active universe and keep the action ID stable across revisions to that listing. Use exact UTC times. The announcement must be at or before the ex-date and observation. Payment must occur at or after the ex-date. Use a three-letter uppercase currency and a nonnegative amount per share with up to six decimal places. A zero amount reports no distribution. The file accepts up to 1,000 reports and 1 MiB.

The query uses the latest action report visible at the knowledge cutoff. On reaching its ex-date, MarketWeft uses the last known holding effective strictly before ex-date. A delayed holdings correction can revise the entitlement. The cash amount is a receivable before the effective cutoff reaches payment, then it is paid.

## Basis reports

~~~csv
universe,listing_id,action_id,observed_at,currency,basis_before
~~~

Supply the total basis before payment for the shares entitled to this action. Use an action ID and listing ID from the distribution reports. Supply an exact observation time, three-letter uppercase currency and a nonnegative amount with up to six decimal places. Revisions to the same listing, action and currency need distinct observation times. The file accepts up to 2,000 reports and 1 MiB.

For each paid distribution, MarketWeft uses the latest known basis in the matching currency. It reduces basis by the smaller of the distribution and reported basis, then reports the remaining basis and any cash above it. A missing basis leaves the cash replay available. Each row uses the supplied basis for that distribution. The calculation describes the source data and the effect on reported basis. [IRS background on nondividend distributions](https://www.irs.gov/publications/p550)

## Verify the offline sample

| Effective UTC | Known UTC | Result |
| --- | --- | --- |
| 14:17:59 | 14:49 | The ex-date has not been reached. |
| 14:49:59 | 14:49 | Ten shares yield a 25 USD receivable. |
| 14:50 | 14:49 | 25 USD is paid, reducing the reported 30 USD basis to 5 USD. |
| 14:50 | 14:55 | The corrected basis is 10 USD. The payment leaves zero basis and 15 USD above basis. |
| 14:59:59 | 14:58 | The revised action moves payment to 15:00 in EUR. Eight shares yield a 24.000008 EUR receivable. |
| 15:00 | 15:01:59 | 24.000008 EUR is paid. The matching basis is unavailable. |
| 15:00 | 15:02 | The 8.125001 EUR basis reduces to zero, leaving 15.875007 EUR above basis. |
| 15:00 | 15:04 | The latest report sets the distribution amount to zero. |

All sample times are on June 2, 2025. **Download capital returns** exports the original source filenames, both cutoffs, terms, entitlement, cash amount and basis evidence. Rewind to effective 14:50 and known 14:49 to reproduce the first paid result. [Synthetic returns](../crates/core/tests/fixtures/synthetic-capital-returns.csv) · [Synthetic basis](../crates/core/tests/fixtures/synthetic-capital-return-basis.csv) · [Synthetic holdings](../crates/core/tests/fixtures/synthetic-rights-holdings.csv)
