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

## Research SDKs

The TypeScript SDK supplies `macroAsOf(csv, publishedThrough, knownAt)`. The Python SDK supplies `macro_as_of(csv, published_through=..., known_at=...)`. Both read the same CSV as the browser and apply the two inclusive UTC cutoffs. TypeScript also exposes `macroIndex(csv)` for the first observed report time.

```python
from pathlib import Path
from marketweft_research import ResearchEngine

engine = ResearchEngine("./marketweft-research")
reports = Path("macro-calendar.csv").read_text(encoding="utf-8")
snapshots = engine.macro_as_of(
    reports,
    published_through="2025-04-03T14:50:00Z",
    known_at="2025-04-03T14:52:00Z",
)
for release in snapshots:
    for report in release.actual_history:
        print(release.release_id, report.record_id, report.value, report.supersedes)
```

Each result carries the release and series IDs, reference date at midnight UTC, unit, visible schedule and forecast, and the full visible actual revision chain. Record fields preserve the publication and observation times and the superseded record ID. Times are Unix seconds. Values are signed integer millionths in the declared unit, represented by `bigint` in TypeScript and `int` in Python. Unavailable evidence uses `null` or `None`. The synthetic inflation result keeps forecast `CPI-F2` and yields actual values `2700000`, `2600000` and `2800000` as the observation cutoff advances. [TypeScript SDK](../packages/research/README.md) · [Python SDK](../packages/python-research/README.md)

Local MCP clients can request these records with the read-only `macro_calendar_as_of` tool. It returns exact decimal-string values and a continuation offset for long histories. [Economic releases over MCP](local-mcp-research.md#economic-releases)

### Native calendar protocol

Run `marketweft-research macro-calendar` with a UTF-8 request on standard input. The first line contains `marketweft-macro-calendar`, protocol `1`, the publication cutoff and the knowledge cutoff, separated by tabs and followed by LF. Append up to 1 MiB of calendar CSV. Use `YYYY-MM-DDTHH:MM:SSZ` for both cutoffs.

The response header contains `marketweft-macro-calendar`, protocol `1` and the number of matched releases. Each tab-separated `H` row contains a release ID, series ID, reference date in Unix seconds and unit. The following evidence rows use `S` for schedule, `F` for forecast, `A` for actual and `R` for revision. They contain the record ID, publication time, observation time, optional scheduled time, optional value in signed millionths and optional predecessor ID. Missing fields are empty. With no visible releases the response contains the header and a count of zero.
