# Formula walk-forward validation

Open **Historical replay**, choose **Open bar backtest**, then load a synthetic or authorized bar history. Expand **Formula walk-forward validation** to enter candidate formulas or use **Add strategy packages** to bring in entry and exit formulas from saved packages. Give each candidate a unique strategy ID. The run uses the current bar backtest’s paper account settings, execution parameters and the execution source chosen in this panel. All candidates start each training window with the same cash and an empty portfolio.

Set an effective cutoff, a known cutoff and the number of observed bars per training and test window. The earlier cutoff bounds the visible bars. A fold appears once both windows are complete. The next fold advances by the test window size. Missing intervals consume no observed bars. Supply 2–16 candidates and 2–5,000 observed bars per window. A run can return up to 64 completed folds within the engine’s evaluation budget.

The engine ranks candidates by exact ending training equity with ascending strategy ID as the tiebreaker. It freezes that choice at the training endpoint. The winner can use training history to warm its indicators, and begins the test with fresh cash, no positions and no pending orders. Signals become actionable after the close where they were evaluated. For recorded-trade execution, each window accepts only eligible prints visible through its own endpoint.

The result shows each candidate’s training equity, maximum drawdown, turnover, fees, accepted fills and unavailable conditions. Select a completed fold for the winner’s test score and paper receipts. **Download formula walk-forward** exports the inputs, all completed folds, test marks, receipts and condition evaluations in one CSV. Importing a malformed package or submitting invalid inputs preserves the accepted result and export.

## Verify the bundled demo

Start the bar backtest demo, keep the two default candidates and leave the effective cutoff at 2025-04-03T14:11:00Z. With six training bars and two test bars, a known cutoff at 14:08 UTC shows zero completed folds. At 14:09 there is one fold. Rising ranks first with training equity 1,003.4 and finishes its test at 997.4, including 2.6 in fees and 60 in turnover. At 14:11 a second fold appears and the first training scores stay the same. Rewind to 14:09 to reproduce the first CSV byte for byte.

Switch to **Recorded trades**, select **Use validation sample trades**, and rerun at 14:09. The first test has zero accepted fills. The included print that would fill the order is observed after the fold’s last bar.
