# Formula strategy packages

Run a [formula paper backtest](formula-paper-backtest.md), then choose **Download strategy package** to save its accepted entry and exit expressions, execution mode and paper settings. The JSON file can be opened by another offline MarketWeft terminal.

In the target terminal, open the bar history and calendar, choose the JSON file under **Formula strategy package**, and select **Load strategy package**. MarketWeft checks the schema, validates the language version, compiles both expressions and checks the paper settings using the same Rust rules as execution. The form shows the loaded filename. Select **Run formula backtest** to use the package settings with the active inputs and cutoffs. For **Recorded trades**, supply the execution tape separately.

The package carries strategy settings. Market data and cutoffs are selected in the terminal. The run's CSV records both cutoffs, data source labels, formula text and the executed settings. Use the matching inputs and cutoffs to reproduce its evaluations, receipts, equity and export. **Use current backtest settings** switches the form back to its parent replay's settings while leaving the two formula fields available for editing.

## Version 1 format

The top-level fields are `format`, `packageVersion`, `languageVersion`, `formulas`, `execution` and `account`. Use `marketweft.formula-strategy` for the format and `1` for the package schema. The formula language has its own version. Files are UTF-8 JSON up to 32 KiB.

| Object | Fields |
| --- | --- |
| `formulas` | `entry`, `exit` |
| `execution` | `source` (bars or trades), `targetShares`, `participation`, `slippage`, `limitBuffer`, `maxWait` |
| `account` | `startingCash`, `positionLimit`, `exposureLimit`, `feePerShare`, `feePerOrder` |

Execution and account numbers use strings so decimal values and their precision survive JSON interchange. The same bounds, numeric parsing and missing-value rules apply to imported and manually entered strategies. An invalid import leaves the existing formulas, settings and accepted result in place.

## Verify the portable example

Start the same historical bar demo in two independent browser profiles. Import the packaged `formula-strategy.mwstrategy.json` and keep the two default cutoffs at 2025-04-03T14:11:00Z. The import applies four target shares and starting cash of 1,100.25. Run the formula backtest in both profiles and compare the CSVs and re-exported packages byte for byte.

In [formula walk-forward validation](formula-walk-forward.md), packages supply candidate formulas for comparison under a shared execution source and shared paper settings.
