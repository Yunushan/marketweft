# Candlestick pattern replay

Open **Historical replay → Start candlestick pattern demo** or start a replay from a local OHLCV history and its session calendar. Step to an observation, expand **Candlestick patterns**, and choose **Scan observed candles**. Each result includes the pattern, when the candle opened, and the UTC time its price became known. The scanner reports the total and displays up to the 25 most recent matches at that replay step.

Patterns use the raw OHLCV prefix even when the chart displays split-adjusted candles. The scanner checks the automated-use permission and expiry on imported histories with a structured grant.

| Pattern | Rule |
| --- | --- |
| Doji | The high exceeds the low and the body is at most 10% of that range, including equality. |
| Bullish engulfing | A rising real body covers the previous falling real body and extends strictly beyond at least one of its ends. |
| Bearish engulfing | A falling real body covers the previous rising real body and extends strictly beyond at least one of its ends. |
| Piercing | After a falling candle, the next candle opens below the prior low and closes strictly above the prior body's midpoint and below its open. |
| Dark Cloud Cover | After a rising candle, the next candle opens above the prior high and closes strictly below the prior body's midpoint and above its open. |

A real body is the interval between open and close. Two-candle rules use consecutive observed intervals in the same session. A missing interval or session boundary resets the comparison. The final partial interval becomes known at the calendar's early close. The rules use integer price ticks.

The demo discloses a bullish engulfing candle at 14:02 UTC and a bearish one at 14:03 UTC on January 12, 2026. There is no match across the missing interval. A doji appears at 14:06 UTC, and the last doji appears at the next day's 14:02:30 UTC early close. Rewind and scan again to reproduce the earlier result. [Synthetic bars](../crates/core/tests/fixtures/synthetic-candle-patterns.csv) · [Synthetic calendar](../crates/core/tests/fixtures/synthetic-candle-pattern-sessions.csv).

[Save and inspect pattern alerts](replay-alerts.md#candlestick-pattern-alerts).

## Piercing and Dark Cloud Cover

These rules classify two observed candles by their price gap and body penetration. The prior low or high must be crossed at the next open. The close must lie strictly inside the indicated half of the prior body. The midpoint comparison doubles the close in integer ticks so a half-tick boundary remains exact. The scanner uses this two-candle geometry with no separate trend or body-length filter. [Piercing](https://www.tradingview.com/support/solutions/43000592558-bullish-piercing-anticipating-a-trend-reversal-at-market-lows/) · [Dark Cloud Cover](https://www.tradingview.com/support/solutions/43000592563-bearish-dark-cloud-cover-how-to-read-a-failed-push-higher-in-an-uptrend/)

The portable archive includes `piercing-dark-cloud.csv` and `candle-pattern-sessions.csv`. Import the prices, select the session calendar with a 60-second interval, and start replay. The example shows Piercing at 14:02 UTC and Dark Cloud Cover at 14:03 UTC on January 12, 2026. A close equal to the midpoint and an open equal to the prior low leave the count unchanged. The January 13 Dark Cloud Cover appears at 14:02:30 UTC when the early session closes. Rewinding one event withholds it again. [Synthetic prices](../crates/core/tests/fixtures/synthetic-piercing-dark-cloud.csv) · [Synthetic calendar](../crates/core/tests/fixtures/synthetic-candle-pattern-sessions.csv)
