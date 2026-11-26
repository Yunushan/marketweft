# Point-in-time economic release calendar

Open **Historical replay → Open economic calendar → Start calendar demo**. Compare **Before release**, **Actual observed**, and **Revised actual**. Use the independent **Published through (UTC)** and **Known time (UTC)** fields for a precise cutoff. Open **Release evidence** to see the records behind the view.

| Published through UTC | Known through UTC | Synthetic inflation release |
| --- | --- | --- |
| 14:08 | 14:08 | Initial 14:10 schedule and 2.4 percent forecast. |
| 14:09 | 14:09 | The updated schedule moves the release to 14:30. |
| 14:29:59 | 14:29:59 | Latest known forecast is 2.5 percent. Actual is unavailable. |
| 14:30 | 14:31:59 | The 14:30 release has been published and its actual is still unobserved. |
| 14:30 | 14:32 | The actual becomes visible at 2.7 percent. |
| 14:40 | 14:45 | The first revision reports 2.6 percent and links to the original. |
| 14:50 | 14:52 | The second revision reports 2.8 percent and links to the first revision. |

The example uses April 3, 2025 UTC. With both clocks advanced, the 2.5 percent forecast stays as the last estimate observed strictly before initial publication. Moving either clock back restores the relevant earlier state. A separate payrolls release illustrates a scheduled release with no forecast or actual. [Synthetic calendar CSV](../crates/core/tests/fixtures/synthetic-macro-calendar.csv).

## CSV input

Load a UTF-8 **Macro calendar CSV** with the same record format as the bundled `macro-calendar.csv` fixture.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

- A release ID identifies a series, reference date and unit. Supply a calendar date for the reference period, stable ASCII IDs for the release and each record, and signed numeric values with up to six places. Use provider units consistently within a release. Files can be unordered and contain up to 10,000 reports and 1 MiB.
- Supply exact UTC publication and observation timestamps. Observation cannot precede publication. A `schedule` row supplies only `scheduled_at`, at or after publication. The latest visible schedule is the one shown.
- A `forecast` or `actual` row supplies only `value`. A `revision` supplies `value` and the immediately preceding official record ID in `supersedes`. Use one initial actual and a single chain of successively published revisions. Duplicate record IDs, branches and missing predecessors fail validation.
- Each record must satisfy both cutoffs to be visible. The displayed actual is the latest visible member of the continuous official chain. Revisions that arrive out of order wait for their predecessors. Once the original actual is visible, eligible forecasts must also have been observed strictly before its publication.

Official release calendars document schedules, while vintage sources distinguish original from revised period values. An upstream date alone cannot supply exact publication and local observation times. MarketWeft consumes those explicit times from authorized local reports. [BLS release calendar](https://www.bls.gov/schedule/news_release/) · [FRED vintage dates](https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html).
