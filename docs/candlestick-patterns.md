# Candlestick pattern replay

Open **Historical replay → Start candlestick pattern demo** or start a replay from a local OHLCV history and its session calendar. Step to an observation, expand **Candlestick patterns**, and choose **Scan observed candles**. Each result includes the pattern, when the candle opened, and the UTC time its price became known. The scanner reports the total and displays up to the 25 most recent matches at that replay step.

Patterns use the raw OHLCV prefix even when the chart displays split-adjusted candles. The scanner checks the automated-use permission and expiry on imported histories with a structured grant.

| Pattern | Rule |
| --- | --- |
| Doji | The high exceeds the low and the body is at most 10% of that range, including equality. |
| Bullish engulfing | A rising real body covers the previous falling real body and extends strictly beyond at least one of its ends. |
| Bearish engulfing | A falling real body covers the previous rising real body and extends strictly beyond at least one of its ends. |

A real body is the interval between open and close. Engulfing uses consecutive observed intervals in the same session. A missing interval or session boundary resets that comparison. The final partial interval becomes known at the calendar's early close. The rules use integer price ticks and have no configurable tolerance in this version.

The demo discloses a bullish engulfing candle at 14:02 UTC and a bearish one at 14:03 UTC on January 12, 2026. There is no match across the missing interval. A doji appears at 14:06 UTC, and the last doji appears at the next day's 14:02:30 UTC early close. Rewind and scan again to reproduce the earlier result. [Synthetic bars](../crates/core/tests/fixtures/synthetic-candle-patterns.csv) · [Synthetic calendar](../crates/core/tests/fixtures/synthetic-candle-pattern-sessions.csv).
