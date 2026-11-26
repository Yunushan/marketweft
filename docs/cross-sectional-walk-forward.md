# Cross-sectional walk-forward

Open **Universe replay**, load membership and price reports, and expand **Cross-sectional paper replay**. Load the execution liquidity CSV and run the ranking replay. **Cross-sectional walk-forward** uses that accepted replay's decision interval, position target, limits, fees, paper account and optional corporate cash reports.

Set the numbers of training and test decisions. Enter two to sixteen distinct candidates as comma-separated `lookback seconds:top listings` pairs. For example, `60:1,60:2` compares holding one and two listings with the same 60-second lookback.

## How the windows advance

Each window begins with the supplied cash, an empty portfolio and no open orders. The training window uses only information available as its decisions occur and values the account with information known at its last decision. Candidates are ranked by marked ending equity. A tie favors fewer listings and then a shorter lookback. A candidate with incomplete ending marks cannot win. If all candidates have incomplete marks, the fold records the training evidence and skips the test.

The winner is frozen for the following test window. Both windows use exact closes and the point-in-time membership and liquidity rules of the paper replay. Optional corporate cash is limited to what was effective and known within the window. The training window rolls forward by one test window at each fold. Historical lookbacks can include closes before a window starts when they were already known. Test windows are disjoint, and each complete test is revealed only after both the effective and known cutoffs reach its final decision. Later observations leave completed scores intact.

The score table reports equity, account cash, gross filled turnover, fees, accepted fills and ranked or missing observations. Missing equity appears as **Incomplete marks**. The CSV includes both cutoffs, source filenames, shared account and execution settings, each window boundary, candidate scores and the frozen candidate's result. Use **Download cross-sectional walk-forward** to export all completed folds.

## Verify the synthetic case

Open **Start listing risk demo**, choose **Use walk-forward sample liquidity**, and run the ranking replay. Keep the first decision at 2025-06-02T14:01:00Z and the effective cutoff at 14:06 UTC. Use two training decisions, two test decisions and the default candidates.

| Known UTC | Completed folds | Observed result |
| --- | ---: | --- |
| 14:03 | 0 | The first test is still in progress. |
| 14:04 | 1 | The one-listing candidate has training equity of 999.3. The two-listing candidate has an unavailable closing mark. The selected rule ends the first test at 999.1 with turnover of 484. |
| 14:06 | 2 | The second test covers 14:05–14:06 UTC with a fresh account. |
| 14:07 | 2 | A late close leaves the frozen scores intact. |

Rewind to 14:04 UTC to reproduce the first export. The synthetic reports are included in the browser ZIP and work offline once the cache is ready.
