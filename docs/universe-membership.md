# Point-in-time universe membership and delistings

Open **Historical replay → Open universe replay → Start universe demo**. **Next cutoff** and **Previous cutoff** move the effective and known times together. **Run as-of query** accepts independent UTC cutoffs so you can reconstruct a past universe as it was known then or from a later information set. The result shows members and excluded listings, with the effective time, report observation time and change ID behind each state.

| Replay cutoff on June 2, 2025 (UTC) | Members | What the source reports establish |
| --- | --- | --- |
| 14:00 | ALFA-001 | Initial membership. |
| 14:05 | ALFA-001 | BETA-001's addition is known and scheduled for 14:10. |
| 14:10 | ALFA-001, BETA-001 | The addition becomes effective. |
| 14:25 | BETA-001 | ALFA-001's removal, effective at 14:20, first becomes known. |
| 14:35 | None | BETA-001's delisting, effective at 14:30, first becomes known. |
| 14:45 | BETA-002 | The same ticker now identifies a separate active listing. BETA-001 remains recorded as delisted. |
| 14:50 | ALFA-001, BETA-002 | The ordinary removal can be followed by readdition for the same listing. |
| 15:05 | ALFA-001, BETA-002 | A future removal of ALFA was rescheduled and then cancelled. Neither superseded scheduled time appears as a live replay cutoff. |

The complete fixture has 11 cutoffs. Set **Effective time** to 14:20 and compare **Known time** at 14:24:59 and 14:25. ALFA-001 is a member in the first result and removed in the second. Set effective time to 14:30 and compare known time at 14:34:59 and 14:35 to observe the same distinction for the delisting. Rewind to restore the exact earlier constituent set. [Synthetic input](../crates/core/tests/fixtures/synthetic-universe.csv).

## Import an authorized history

Choose **Universe membership CSV** and **Load universe**. The browser ZIP contains `universe-membership.csv` for testing this path. Data is local to the open view. Include the historical baseline and the membership changes or revisions available for the dates under study. Each file describes one named universe. Files accept up to 5,000 reports within 1 MiB.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

- Use 1–40 ASCII letters, digits, periods, underscores or hyphens for universe, change and listing IDs. A listing ID identifies one lifetime of a listing. Its canonical `VENUE:SYMBOL` label stays consistent across the file. A new listing may reuse that label with a distinct ID.
- Use exact UTC timestamps in `YYYY-MM-DDTHH:MM:SSZ` format. The source resolves each effective time and reports when it was observed or made available to the scenario. Observation may precede or follow effect.
- Use `add`, `remove`, `delist` or `cancel`. A removal affects membership of the selected universe. A delisting excludes that source listing for the rest of its modeled lifetime. A cancellation supersedes the corresponding change. Revisions share the original change and listing IDs and must have distinct observation times.

An index constituent removal and an exchange delisting are distinct data events. Real sources can use different announcements, sessions and effective rules. This engine consumes the timestamps supplied in the CSV. [Example index methodology from S&P DJI](https://www.spglobal.com/spdji/en/methodology/article/dow-jones-bic-50-index-methodology/) · [SEC Form 25](https://www.sec.gov/files/form25.pdf).

## Query semantics

1. Select the latest report for each change ID whose observation time is at or before the known cutoff. Discard cancelled reports and reports whose effective time is after the effective cutoff. Select the revision before applying the effective cutoff so a future reschedule suppresses its earlier version.
2. Apply the remaining reports in effective-time order. At the same effective second, delisting takes precedence over removal, and removal over addition. Among equally timed reports of the same kind, change IDs determine a reproducible order. The earliest remaining delisting for a listing is terminal.
3. Return members and recorded exclusions keyed by listing ID, with the report behind each state. No row appears before its first known and effective change. Before the first valid addition, the member set is empty.

In replay, reports contribute their observation times. A known scheduled change also contributes its effective time while that report is current. The active chart, dividend ledger and workspace persistence keep their own inputs. Universe replay classifies membership and listing status. Index construction, delisting return or liquidation prices, and historical symbol changes within a listing require additional inputs.
