# Replayable alerts and local inbox

Open **Historical replay → Open replay alerts → Start alert demo**. Use **First crossing**, **Correction observed**, and **Full alert replay**, or set independent effective and known times. Expand **Show evidence** for the rule revision, observation IDs, and exact comparator used on both sides of the crossing.

Select **Save to alert inbox** to deliver the preview to local IndexedDB. Saving the full fixture creates eight alerts. Replaying and saving it again creates zero. Reloading the app or opening a second tab on the same origin preserves the records. **Refresh inbox** reads new records saved by other tabs. Files and alerts stay on the current browser origin. The workspace catalog and its backups remain separate. [IndexedDB transaction scheduling](https://www.w3.org/TR/IndexedDB/#transaction-scheduling).

## Input

Load local **Alert rules CSV** and **Alert observations CSV**. Use stable, case-sensitive ASCII IDs of 1–40 letters, digits, dots, underscores or hyphens. Both UTF-8 files support 10,000 nonblank rows and 1 MiB. Supply exact UTC timestamps. Numeric value and threshold fields accept signed six-place decimals within ±2,000,000,000. [Rule fixture](../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [Observation fixture](../crates/core/tests/fixtures/synthetic-alert-observations.csv).

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
MEAN,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,sma,either,3
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
O2C,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:03:00Z,3
```

- Keep a rule's series fixed and use a new revision ID for changed evidence. Revisions can set a fixed `threshold`, a simple moving average `sma`, or `off` with blank direction and operand. SMA windows hold 2–1,000 observations. Directions are `above`, `below` or `either`. Identical rows can repeat. Conflicting IDs and ambiguous same-time records fail validation.
- An observation must be known at or after measurement. The query selects observations within both cutoffs, then replays them in observation order. A later observation of the latest measurement can correct that value. A stale report for an earlier measurement cannot change the current rolling state.
- For each observation, choose the latest effective rule revision whose own observation time is known by that event. Compare the immediately prior value and current value under that revision. Moving averages include the current sample on each side and require a full window in both states. Exact integer comparisons keep averages independent of rounding.
- Crossings require a move strictly above or below the comparator. A touch can rearm that direction, and rule edits alone do not emit alerts. A batch is bounded at two million evaluations and 20,000 notifications.

## Audit and local delivery

An alert key combines rule, revision and triggering observation IDs. The saved record retains both input measurements and source times, the selected rule and exact comparator fractions. A single transaction inserts a batch. Identical existing evidence is ignored. Conflicting existing evidence aborts the entire batch. Transient interruptions retry at most twice. This applies to the local inbox, and outbound delivery remains separately tracked.

At 14:02 UTC the fixture first crosses the threshold. At 14:03 the correction crosses below both the level and the three-sample SMA. A later old observation leaves the rolling state unchanged. At 14:07 a revised threshold emits a last alert, and the rule's disable revision becomes known at 14:08. The final replay contains eight distinct IDs. [Architecture decision](adr/0012-alert-evidence.md).

## Candlestick pattern alerts

In [candlestick pattern replay](candlestick-patterns.md), select **Scan observed candles**, choose a **Pattern alert rule**, and select **Save pattern alerts**. The rule saves every matching candle in that observed prefix. The available rules are Doji, Bullish engulfing and Bearish engulfing. Saving a shorter prefix after rewinding leaves existing inbox entries intact.

The inbox shows these records alongside threshold and moving-average crossings. **Show evidence** includes the rule revision, the triggering bar's raw OHLCV values, its opening time and when it became known. Engulfing records include the previous raw candle and its observation time. The replay context digest hashes the instrument key, interval and calendar. The record ID combines that digest, rule revision, pattern and triggering bar time. Replaying an identical record adds no duplicate. Conflicting evidence under the same ID cancels the batch.

Structured source grants must allow both automated use and storage when saving raw evidence. The inbox remains local to IndexedDB on the current browser origin.

Operators can use the standalone service's [signed webhook delivery command](local-webhook-delivery.md) to deliver an explicitly supplied event file.

## Export a webhook event

In **Replay alerts → Alert inbox**, open a saved candlestick alert's **Show evidence** section and choose **Download webhook event**. The JSON contains the stable alert ID, the first UTC observation time, the rule revision, and the exact raw candle evidence. The file can be passed directly to the [signed webhook delivery command](local-webhook-delivery.md).

Imported data must have explicit redistribution permission in both the grant recorded with the alert and the current matching catalog history. A later restriction or expiry blocks download. A replacement history with the same instrument ID cannot authorize the earlier alert. Older records without recorded provenance remain readable. The built-in synthetic demo records can be exported.
