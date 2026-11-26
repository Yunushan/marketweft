# Formula paper backtest

Open **Historical replay**, select **Open bar backtest**, and start the demo or load a calendar and bar history. Use **Run bar backtest** to apply changes to the shared account and execution settings. Expand **Formula paper backtest**, enter the two expressions and set the effective and known cutoffs.

The engine evaluates the [version 1 formula language](time-series-language.md) on each observed close. An available nonzero entry value requests a buy up to the target position. An available nonzero exit value requests a sale of all held shares. If both conditions are active, exit takes priority. Zero and unavailable values trigger neither condition on their own. Opposite signals cancel working orders and the paper account enforces position, cash, exposure and price limits.

## Execution and evidence

With **Bar volume**, fills use later observed closes and the participation limit. A missing scheduled interval creates no decision or volume. With **Recorded trades**, load the supplied execution tape. The **effective cutoff** limits eligible trade execution times, and the **known cutoff** controls arrivals. Orders still begin at an observed bar close and can fill only against subsequent eligible executions.

The signal table includes exact entry and exit values and the proposed decision. The separate receipts table records each ledger action and fill. **Download formula backtest** exports all evaluations, receipts and marks along with formula source, language version, data sources, cutoffs and paper settings.

## Verify offline

Start the backtest demo and use entry `close >= 13` and exit `close <= 10`. Keep the effective cutoff at 2025-04-03T14:11:00Z.

| Known UTC | Bar-volume result |
| --- | --- |
| 14:05 | The buy order is submitted. Cash stays at 1,000 with no fill. |
| 14:06 | The missing interval contributes no volume and cash stays at 1,000. |
| 14:07 | The first fill acquires two shares and leaves cash of 969.8. |
| 14:11 | Four fills leave an empty position and 957.8 cash. |

Switch to **Recorded trades** and load the matching sample. At knowledge 14:11:10 UTC the final fill preserves ID `TRADE-9007199254741000` and cash ends at 957.8. To inspect a missing entry value, use `if(close >= 13, 1, 0 / 0)`. Return to **Bar volume** and rewind the cutoff to reproduce a saved CSV byte for byte.

[Formula strategy packages](formula-strategy-packages.md) can restore the same formulas and paper settings in another terminal.
