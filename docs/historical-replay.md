# Session-aware historical replay

## Run the verified example

Open **Historical replay → Start demo** in the terminal. Use **Next event** for single steps, **Play** and **Pause** for continuous playback, and **Previous event** or **Reset** to rewind. The chart begins empty. The visible candles, last close, volume and moving averages are derived from the revealed prefix. Leaving replay returns to the live workspace view of the saved local history. [Schedule CSV](../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [Synthetic OHLCV CSV](../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv).

The schedule encodes NYSE core cash equity sessions from October 31 through November 28, 2025. The OHLCV prices and volumes are project-generated. The calendar uses only the public facts needed for this fixture and records Eastern offset at each open. [NYSE core hours](https://www.nyse.com/trade/hours-calendars) · [NYSE Group holiday and early-close announcement](https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx) · [NIST daylight saving rules](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst).

| Boundary | UTC evidence |
| --- | --- |
| Friday, October 31 | 13:30 open and 20:00 close at UTC−04:00 |
| Monday, November 3 | 14:30 open and 21:00 close at UTC−05:00 |
| Missing 30-minute candle on November 3 | Interval starts at 15:00. Its absence becomes observable at 15:30. |
| Thanksgiving, November 27 | Closed day. No session or missing-bar events. |
| Friday, November 28 | 14:30 open and 18:00 early close at UTC−05:00. Seven 30-minute candles. |

The fixture produces 294 ordered events, consisting of 40 session boundaries, 253 observed candles and one missing interval. Native and Wasm tests compare SMA(20) and EMA(9) after each event with the corresponding fixed-point batch prefix.

## Replay an imported series

1. Import an authorized OHLCV CSV in the workspace. Label each row with its interval **start** in UTC. Convert end-stamped bars upstream before import so the saved source stays immutable.
2. Open **Historical replay**, select the imported instrument and choose a calendar CSV for the dataset's intended coverage. Supply a positive whole number of seconds for the bar interval.
3. Start replay and confirm that the opening UTC time and offset match the intended venue session. In replay, **Event time** identifies the interval or boundary. **Observed at** determines when that event may affect the chart.

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

| Field | Contract |
| --- | --- |
| `date` | Opening date at the supplied offset in `YYYY-MM-DD` form. Multiple nonoverlapping segments can share a date. Omit unscheduled days and breaks. |
| `open_utc`, `close_utc` | Exact UTC second in `YYYY-MM-DDTHH:MM:SSZ` form. Supply chronological, nonoverlapping sessions from one venue, each up to 24 hours. The interval is open-inclusive and close-exclusive. |
| `utc_offset_minutes` | Signed integer offset in minutes at the opening, from −720 to 840. The value is checked against the trading date. Actual UTC boundaries determine the event clock. |
| `kind` | `regular` or `early`. Every row carries its own close, including an early close. |
| Bar interval | An integer from 1 to 86,400 seconds. The grid is anchored to each opening. If the final interval is shorter, observation occurs at the session close. |

The calendar accepts UTF-8, a maximum of 1 MiB, up to 10,000 segments and a replay of up to 200,000 events for 100,000 bars. Give the calendar full coverage of the imported bar times. MarketWeft rejects off-grid rows and bars outside the supplied sessions, including bars stamped at a close. A calendar can cover sessions before or after the first or last bar. Missing events then represent expected but absent rows across the covered slots.

## Observation model

An opening is visible immediately. The event time of a candle is its slot start. The earliest observation time of a complete candle or a missing slot is its slot end. This is a historical availability convention. A recorded provider arrival time, venue timestamp correction or as-of revision feed requires separate input. The engine reveals the last interval before closing a session. If the next segment opens at that exact second, its open follows the preceding close. Each event exposes only the prices available at its position.

Exchange closure and data gaps are different events. A gap within a covered session changes the replay clock while preserving the previous prices and bar count. The moving averages count observed closes across sessions and gaps. They retain their six-place fixed-point rounding and warm-up rules. Chart spacing is by observed bar index, so inspect the event clock for wall-time gaps.

Replay reads the history in memory and leaves the IndexedDB workspace and portable backup schema intact. The app keeps the replay cursor and calendar selection for the current view. Keep the exact calendar, source CSV, bar interval and app revision together for a repeatable analysis. The caller supplies the exchange schedule, time-zone resolution, and relevant data rights. Add a separate corporate actions CSV for point-in-time stock splits. Provider latency for candles, intrabar observations and order simulation remain roadmap items. [Point-in-time corporate actions](corporate-actions.md) · [Backlog](../ROADMAP.md).
