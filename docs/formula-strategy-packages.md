# Formula strategy packages

Run a formula paper backtest, then choose **Download strategy package** to save its accepted entry and exit expressions, execution mode and paper settings. The JSON file can be opened by another offline MarketWeft terminal. [Formula paper backtest](formula-paper-backtest.md).

In the target terminal, open the bar history and calendar, choose the JSON file under **Formula strategy package**, and select **Load strategy package**. MarketWeft checks the schema, validates the language version, compiles both expressions and checks the paper settings using the same Rust rules as execution. The form shows the loaded filename. Select **Run formula backtest** to use the package settings with the active inputs and cutoffs. For **Recorded trades**, supply the execution tape separately.

The package carries strategy settings. Market data and cutoffs are selected in the terminal. The run's CSV records both cutoffs, data source labels, formula text and the executed settings. Use the matching inputs and cutoffs to reproduce its evaluations, receipts, equity and export. **Use current backtest settings** switches the form back to its parent replay's settings. The loaded formulas and functions stay available for editing and evaluation.

## Version 1 format

The top-level fields are `format`, `packageVersion`, `languageVersion`, `formulas`, `execution` and `account`. Use `marketweft.formula-strategy` for the format and `1` for the package schema. The formula language has its own version. Files are UTF-8 JSON up to 32 KiB.

| Object | Fields |
| --- | --- |
| `formulas` | `entry`, `exit` |
| `execution` | `source` (bars or trades), `targetShares`, `participation`, `slippage`, `limitBuffer`, `maxWait` |
| `account` | `startingCash`, `positionLimit`, `exposureLimit`, `feePerShare`, `feePerOrder` |

Execution and account numbers use strings so decimal values and their precision survive JSON interchange. The same bounds, numeric parsing and missing-value rules apply to imported and manually entered strategies. An invalid import leaves the existing formulas, settings and accepted result in place.

## Version 2 format

Version 2 uses the same fields and adds the `functions` array from a formula function library. Load a standalone library under **Backtest formula functions** and use its names in an entry or exit expression. When the accepted run has custom functions, **Download strategy package** writes version 2 and includes the function definitions in declaration order. Version 1 remains available for built-in expressions and uses its existing 32 KiB limit. Version 2 allows up to 64 KiB and requires at least one function. [Custom formula functions](formula-functions.md).

When you import a version 2 package, the engine validates its library and compiles both formulas in that scope before it accepts the settings. A run with custom functions puts the library definitions in the first line of data in its ledger CSV. Each walk-forward candidate uses its own function scope and can define the same function name differently. The first fold’s training rows carry the definitions by candidate ID.

## Verify the portable example

Start the same historical bar demo in two independent browser profiles. Import the packaged `formula-strategy.mwstrategy.json` and keep the two default cutoffs at 2025-04-03T14:11:00Z. The import applies four target shares and starting cash of 1,100.25. Run the formula backtest in both profiles and compare the CSVs and re-exported packages byte for byte.

In formula walk-forward validation, packages supply candidate formulas and their functions for comparison under a shared execution source and shared paper settings. [Formula walk-forward validation](formula-walk-forward.md).
