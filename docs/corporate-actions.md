# Point-in-time stock splits

Open **Historical replay → Start split demo** and choose **Split-adjusted** under **Price basis**. The generated example has 24 ten-minute candles across two synthetic sessions. Use **Next event** to inspect the history and **Previous event** to reconstruct an earlier view. Switch to **Raw** at the same cursor to compare prices and volumes. [Raw OHLCV](../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [Session calendar](../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [Corporate action](../crates/core/tests/fixtures/synthetic-split-actions.csv).

| Replay observation in UTC | What the replay can show |
| --- | --- |
| June 2, 2025 at 14:10 | The first candle closes at 101.00 in both views. The split report is still outside the observation window. |
| June 2 at 14:20 | The announced 2-for-1 split becomes visible. Its effect is scheduled for June 3. The visible price and volume basis stays the same until then. |
| June 3 at 14:00 | The last pre-split close is 106.50 raw and 53.25 adjusted. Its volume is 810.000001 raw and 1,620.000002 adjusted. There are still 12 observed candles. |
| June 3 at 14:10 | The first post-split candle has a 53.00 close in both views. Its start equals the split’s effective time, so it already uses the new share basis. |

## Bring an authorized dataset

1. Import one instrument’s **raw** OHLCV and verify that its rows use interval-start UTC stamps. Keep the original source and its usage terms.
2. Open **Historical replay**, select that instrument and upload its session calendar. Enter the same whole-second bar interval used to construct the candles.
3. Upload **Corporate actions CSV (optional)** and confirm the OHLCV contains raw prices and volume. Each action must have the selected canonical `VENUE:SYMBOL` identity. Choose **Start replay**.

To import the bundled fixtures, use venue `DEMO`, symbol `SPLIT` and a 600-second interval. The portable ZIP includes the three files as `split-ohlcv.csv`, `split-sessions.csv` and `split-actions.csv`.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

| Field | Meaning |
| --- | --- |
| `announced_at` | Public announcement time, expressed as a UTC timestamp ending in Z. |
| `effective_at` | First point on the new share basis. Use an exact UTC time and a calendar grid that places the split between bars, including before the session open. |
| `observed_at` | Simulated time that this source record was available to the observer. It can follow the effective time, such as for a delayed delivery or a later correction. |
| `new_shares`, `old_shares` | Unequal integers from 1 to 1,000,000. A 2-for-1 uses `2,1`; a 1-for-5 reverse split uses `1,5`. |

Supply UTC timestamps as `YYYY-MM-DDTHH:MM:SSZ`, an announcement at or before both other times, and up to 1,000 UTF-8 action rows in 1 MiB. A file covers one instrument. The six-column format groups ratio revisions by effective time and rejects duplicate observation times within that group. Use the eight-column format to move, cancel, or independently track actions with the same effective time.

## Split revisions and cancellations

Open **Start split revisions demo** to use the extended fixture with the same raw bars and calendar. This format retains a stable `action_id` for all revisions to one split. IDs use 1–40 ASCII letters, digits, dots, underscores or hyphens. Use `split` with both share counts, or `cancel` with both share counts empty. Use the effective time of the withdrawn action on a cancellation row. Each ID may have one row per observation time. Distinct IDs can share an observation time or effective time.

```csv
instrument,action_id,announced_at,effective_at,observed_at,action,new_shares,old_shares
DEMO:SPLIT,SPLIT-A,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,split,2,1
DEMO:SPLIT,SPLIT-A,2025-06-02T14:15:00Z,2025-06-03T14:20:00Z,2025-06-03T14:10:00Z,split,2,1
DEMO:SPLIT,SPLIT-A,2025-06-02T14:15:00Z,2025-06-03T14:20:00Z,2025-06-03T14:30:00Z,cancel,,
```

An observed revision replaces the previous terms for its ID. When the new effective time is still ahead, the old adjustment is withdrawn immediately and the new one starts at the revised time. A cancellation removes that ID's adjustment when observed. Other effective IDs keep their ratios. Rewinding restores the vintage at the earlier observation time. A planned effect disappears from the event list if a revision supersedes it before it occurs.

In the generated fixture, SPLIT-A adjusts the last pre-open close to 53.25 at 14:00 UTC on June 3. When its revision moves the effect to 14:20 at the 14:10 observation, the same close returns to 106.50. At 14:20, SPLIT-A and SPLIT-B compound to three-for-one. Canceling SPLIT-A at 14:30 preserves SPLIT-B's three-for-two factor. The 14:10 candle closes at 17.833333 with both factors and 35.666667 after the cancellation. The raw close stays 53.50. [Full revision fixture](../crates/core/tests/fixtures/synthetic-split-revisions.csv).

## Numerical and observation contract

At replay time `T`, choose the latest row observed by `T` for each action ID, or each effective time in the six-column format. A chosen ratio is eligible when its effective time is at or before `T`. If the report arrives later, it affects adjusted history starting at its recorded observation time. When a split and a session or bar event share the same timestamp, the action event comes first. The number of revealed bars advances only on market bar events.

For each revealed candle, apply every eligible split whose effective time is strictly after the candle’s start. Multiply quantity by the product of new shares divided by old shares. Multiply open, high, low and close by the reciprocal. Compose reduced rational factors, round final results to signed millionths with ties away from zero, then recompute SMA and EMA from the adjusted closes. An overflowing factor or out-of-range result blocks the adjusted chart and keeps the raw view available. The source CSV and existing workspace backup schema stay immutable during replay. [Reference split methodology](https://www.crsp.org/wp-content/uploads/guides/CRSP_Market_Indexes_Methodology_Guide-December_2025.pdf).

The chosen action file, playhead and price basis are specific to the open replay. Keep the exact OHLCV, calendar, action CSV, interval and application revision together to reproduce a run. A separate cash dividend input powers the dividend ledger. Spin-offs and total-return replay remain roadmap items. [Cash dividends](cash-dividends.md) · [Historical replay contract](historical-replay.md) · [Observation model decision](adr/0004-corporate-action-observation.md).
