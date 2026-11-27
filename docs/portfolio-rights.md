# Point-in-time subscription rights

In **Portfolio replay**, select **Load subscription rights demo**, or supply a holdings CSV and a **Subscription rights CSV**. Closes are optional for rights-only replay. Use the active universe's effective and knowledge times to move through the reports. [Portfolio holdings format](portfolio-replay.md)

The basic subscription quantity follows the issuer's eligibility and exercise terms. A reported deadline and whole-share rounding policy can vary by offering. [Example eligibility and expiration terms](https://www.sec.gov/Archives/edgar/data/1713863/000121390025040200/ea0216930-11.htm) · [Example whole-share rounding terms](https://www.sec.gov/Archives/edgar/data/1719395/000119312522268804/d385353dex995.htm)

## Report format

```csv
universe,offering_id,listing_id,observed_at,status,subscription_listing,announced_at,entitlement_at,opens_at,expires_at,numerator,denominator,currency,subscription_price,fraction_policy
DEMO-BASKET,ALFA-RIGHTS,ALFA-001,2025-06-02T14:15:00Z,offer,ALFA-001,2025-06-02T14:12:00Z,2025-06-02T14:30:00Z,2025-06-02T14:40:00Z,2025-06-02T14:55:00Z,1,3,USD,19.25,down
```

- Use the same offering ID and eligible listing ID on each revision, with distinct observation times. Both listing IDs must belong to the supplied universe. The subscription shares may use the eligible listing's own ID.
- Use exact UTC timestamps. The announcement must precede or coincide with observation and entitlement. Entitlement can precede or coincide with opening, and the opening must precede expiry.
- The ratio gives subscription shares per eligible held share. Supply integers from 1 to 1,000,000, a positive price with up to six decimal places, and three uppercase currency letters. Use `down`, `up`, or `nearest` to obtain whole subscribable shares. `nearest` rounds ties up. The exact entitlement remains visible as a reduced fraction.
- A `cancel` row contains the universe, offering ID, eligible listing ID, observation time, and status. Leave all ten offer fields empty. Supply at most 1,000 reports in a 1 MiB file.

The latest report visible at the knowledge cutoff determines the terms. Once effective entitlement is reached, the replay uses the last known holding effective strictly before entitlement. Missing holdings and explicit zero holdings appear separately. The exercise window opens at its exact UTC time and expires at the exact expiry time. The quoted cost is the whole subscribable quantity multiplied by the reported price in the stated currency. The replay calculates entitlement and quoted cash requirements for basic subscriptions.

## Verify the offline sample

| Effective UTC | Known UTC | Result |
| --- | --- | --- |
| 14:30 | 14:14:59 | The first terms are still unobserved. |
| 14:30 | 14:35 | The 10-share holding yields 10/3 subscription shares. Opening is pending. |
| 14:40 | 14:49 | Three shares are subscribable for 57.75 USD. |
| 14:55 | 14:56:59 | The original terms have expired. |
| 15:00 | 14:57 | A revised deadline reopens the window in the replay. Five shares cost 100.625005 EUR. |
| 15:00 | 14:58 | The corrected eight-share holding yields four subscribable shares for 80.500004 EUR. |
| 15:00 | 15:03 | Cancellation is visible. |

All sample times are on June 2, 2025. **Download subscription rights** includes the sources, both cutoffs, terms, holding times, exact share numerator and denominator, and quoted cost. Rewind to effective 14:40 and known 14:49 to reproduce the original CSV. [Synthetic reports](../crates/core/tests/fixtures/synthetic-subscription-rights.csv) · [Synthetic holdings](../crates/core/tests/fixtures/synthetic-rights-holdings.csv)

## Exercise, allocation and settlement reports

In **Portfolio replay**, select **Load subscription exercise demo** or supply holdings, subscription rights and a **Subscription exercise reports CSV**. Each row reports the complete status of an exercise at an effective time. A different observation time at that same effective time reports a revision.

```csv
universe,offering_id,exercise_id,effective_at,observed_at,status,requested_at,requested_shares,allocated_shares,currency,unit_price,settled_shares,cash_paid
```

- Keep the offering ID stable for each exercise ID. Use an offering from the rights CSV and distinct effective and observation pairs for each exercise. Use exact UTC times with request at or before effectiveness and observation at or after effectiveness. A `requested` report has the request timestamp as its effective time.
- All stages include the request timestamp and a positive whole-share request quantity. For `requested` and `cancelled`, leave the last five fields empty. For `allocated` and `settled`, include the allocated quantity, currency and positive unit price. Allocated shares may range from zero to the requested quantity. A `settled` report also supplies settled shares up to the allocation and the nonnegative cash actually paid. Use amounts with up to six decimal places. Supply at most 2,000 reports in a 1 MiB file.
- The query selects the latest effective report at or before the effective cutoff that has an observation at or before the knowledge cutoff. At the same effective time it selects the latest visible revision. Each settlement carries the observed cash and signed variance, calculated as cash paid minus settled shares times the reported unit price.
- The request assessment uses the offer and holding known at the request timestamp. It indicates whether the request was inside the exercise window and within the basic capacity. Each assessment applies to the individual report. Allocation, settlement and cancellation are supplied by the source.

Issuers can distinguish requested and allocated shares, with separate handling of cash paid beyond the final allocation. [Issuer subscription procedures](https://www.sec.gov/Archives/edgar/data/1468327/000114036125036554/ny20055620x2_ex99-1.htm) · [Issuer allocation and overpayment terms](https://www.sec.gov/Archives/edgar/data/1625101/000114036118042445/s002354x2_ex99-1.htm)

| Effective UTC | Known UTC | Synthetic result on June 2, 2025 |
| --- | --- | --- |
| 14:42 | 14:44:59 | EX-A is still unobserved. |
| 14:54 | 14:45 | EX-A requests three shares against a basic capacity of three. |
| 14:54 | 14:56:59 | Two shares are allocated at 19.25 USD each. |
| 14:54 | 14:57 | Reported settlement delivers two shares for 38.50 USD. |
| 15:00 | 14:59 | A revision reports 39.000001 USD paid, or 0.500001 USD above the reported share cost. EX-B's 14:55 request falls exactly at the expiry then known. |
| 15:00 | 15:02 | EX-A's cancellation is visible. |
| 14:54 | 14:57 | Rewind to reproduce the original settlement CSV. |

**Download subscription exercises** exports the three source filenames, both cutoffs, the reported stage and quantities, request assessment, and settlement amounts. [Synthetic exercise reports](../crates/core/tests/fixtures/synthetic-rights-exercises.csv)
