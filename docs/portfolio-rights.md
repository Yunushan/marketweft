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
