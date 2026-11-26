# MarketWeft time-series formula language

Language version 1 evaluates one expression over a chronological OHLCV input. Each observed bar produces one fixed-point value or an unavailable value. The same Rust interpreter runs natively and in the browser.

## Grammar

```text
expression = comparison
comparison = sum { ("==" | "!=" | "<" | "<=" | ">" | ">=") sum }
sum        = product { ("+" | "-") product }
product    = unary { ("*" | "/") unary }
unary      = ("+" | "-") unary | primary
primary    = decimal | field | "(" expression ")" | call
field      = "open" | "high" | "low" | "close" | "volume"
call       = "abs" "(" expression ")"
           | "coalesce" "(" expression "," expression ")"
           | "if" "(" expression "," expression "," expression ")"
           | window "(" expression "," period ")"
window     = "lag" | "sma" | "ema" | "lowest" | "highest"
decimal    = digit { digit } [ "." digit { digit } ]
period     = digit { digit }
digit      = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
```

Identifiers are case-sensitive ASCII. ASCII whitespace separates tokens. Decimal literals require an integer part and support up to six decimal places. Unary signs bind before multiplication and division, followed by addition and subtraction, then comparisons. Binary operators at the same level associate left to right. Comparisons return 1 for true and 0 for false.

## Evaluation

- Numbers use signed millionths from −2,000,000,000 through 2,000,000,000. Multiplication and division round to the nearest millionth, with exact halves away from zero.
- Arithmetic and comparison require both operands. Division by zero and an out-of-range result produce an unavailable value for that row.
- `abs(x)` returns the magnitude. `coalesce(x, fallback)` keeps an available value of x, including zero, or uses the fallback.
- `if(condition, yes, no)` selects yes for nonzero and no for zero. An unavailable condition gives an unavailable result. Both branches are evaluated without side effects. Only the selected branch supplies the row's result.
- `lag(x, n)` reads exactly n earlier observed rows. `sma(x, n)`, `lowest(x, n)` and `highest(x, n)` require n consecutive available values including the current row. `ema(x, n)` starts with the first such window's SMA, then uses weight 2/(n+1) for the current value and rounds at every step. An unavailable row resets the EMA. Windows count rows in the supplied history. Calendar gaps leave the sequence of supplied rows intact.
- Periods are positive integer literals from 1 to 4,096. The language grammar exposes arithmetic, selection and backward-looking windows. Evaluation has no host I/O, mutable state, user-defined calls, or forward-index operator.

Each formula permits up to 2,048 source bytes, 96 expression nodes and 32 parser nesting levels. An evaluation permits up to 100,000 bars and four million node-row pairs. Invalid syntax and resource limits return an error before changing the accepted view.

## Use in the terminal

Select a chart, open **Time-series formulas**, and set the observed cutoff. The cutoff includes bars by their supplied source timestamps. Enter an expression and choose **Evaluate formula**. The plot shows the most recent 512 observed rows, with gaps for unavailable values. The table and CSV retain every row through the cutoff. **Download formula values** includes the instrument, source, cutoff, expression, language version and exact timestamps.

With the packaged `formula-bars.csv`, evaluate `ema(if(close == 11, close / 0, close), 2)`. Its six values are unavailable, 11, unavailable, unavailable, 14.5 and 16.833333. At 14:04 UTC the result ends at 14.5. Rewinding to that cutoff reproduces its CSV byte for byte. The first result of `coalesce(lag(volume, 1), 0)` is zero, and the row after the 150.125 observation retains that exact fractional volume.

The [formula paper backtest](formula-paper-backtest.md) uses the same grammar for entry and exit signals.
