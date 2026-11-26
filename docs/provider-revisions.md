# Provider revision replay

Open **Provider revisions** for a point-in-time view of OHLCV reports from one provider and instrument. Enter independent UTC cutoffs for bar time and observation time. Rust selects the latest eligible observation for each eligible bar and the browser shows the observation alongside its values.

To load an authorized history, supply a UTF-8 CSV with the following header.

```csv
provider,venue,symbol,bar_at,observed_at,open,high,low,close,volume
synthetic-sample,DEMO,ALFA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,10.000001,10.500001,9.999999,10.000001,100.000001
synthetic-sample,DEMO,ALFA,2025-06-02T14:00:00Z,2025-06-02T14:04:00Z,10.000001,10.500001,9.999999,10.250001,100.000002
```

`bar_at` is the bar's effective UTC time. `observed_at` is the time when a version of that bar became known. Use whole UTC seconds in `YYYY-MM-DDTHH:MM:SSZ` form. The importer requires one provider and instrument per file. Revisions can arrive in any file order, and each bar and observation pair must be unique. Prices and volumes use the same six-place fixed-point validation as historical CSV imports.

The built-in demo shows these independent cutoff behaviors on June 2, 2025.

| Effective through UTC | Known through UTC | Observed result |
| --- | --- | --- |
| 14:02:00 | 14:03:59 | The 14:00 close is 10.000001. The 14:01 bar is still missing. |
| 14:02:00 | 14:04:00 | The 14:00 close is 10.250001 with an observation time of 14:04. |
| 14:02:00 | 14:05:00 | The late 14:01 close joins the history at 11.750001. |
| 14:01:00 | 14:05:00 | The effective cutoff excludes the 14:02 bar. |

Each application of the cutoffs reads the same observation history, so moving backward reproduces the earlier values. Uploaded observations stay in the current replay session.

## Withdraw and replace a bar

To record a withdrawal, use the CSV header with `action` immediately after `observed_at`. An `upsert` supplies all five OHLCV values. A `withdraw` leaves all five values empty and removes the bar at that observation cutoff.

```csv
provider,venue,symbol,bar_at,observed_at,action,open,high,low,close,volume
synthetic-sample,DEMO,ALFA,2025-06-02T14:00:00Z,2025-06-02T14:04:00Z,upsert,10.000001,10.500001,9.999999,10.250001,100.000002
synthetic-sample,DEMO,ALFA,2025-06-02T14:00:00Z,2025-06-02T14:06:00Z,withdraw,,,,,
synthetic-sample,DEMO,ALFA,2025-06-02T14:00:00Z,2025-06-02T14:07:00Z,upsert,10.000001,10.500001,9.999999,10.400001,100.000003
```

An `upsert` after the withdrawal restores that same bar with its replacement values. At a cutoff before 14:06 the earlier close is 10.250001. The 14:06 observation removes it. The 14:07 replacement brings it back with a close of 10.400001 and volume of 100.000003. A header without `action` represents historical upserts.

## Provider replay chart

The candlestick and volume chart plots the same observed bars as the table. Move the crosshair over a candle to read its effective UTC time, provider observation time and OHLCV. When the crosshair is outside the plot, the readout shows the last visible candle. Use the range controls or drag the chart to inspect earlier bars. The table gives the observation time and full fixed-point values for each bar.

Set the demo's effective cutoff to 14:00 UTC. The chart and table show the original close of 10.000001 before the 14:04 correction and 10.250001 afterward. Both are empty at the 14:06 withdrawal. At 14:07 the chart and table show the replacement close of 10.400001 and volume of 100.000003.
