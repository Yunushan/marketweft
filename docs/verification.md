# MarketWeft verification

## 0.42.0 · Formula paper backtest

| Check | Observed result |
| --- | --- |
| Signal discipline | Missing conditions remain unavailable, and exit wins when both conditions are nonzero. Later input edits leave earlier evaluations and receipts intact. |
| Paper fills | The 14:05 submission has no fill, the missing 14:06 interval has no volume, and the 14:07 partial fill leaves 969.8. Both execution modes end at 957.8. The recorded tape preserves the exact final capture ID. |
| Offline audit | Chromium verifies both execution sources, syntax failure without losing accepted results, catalog preservation and byte-for-byte CSV rewind. |
| Regression suite | All 83 browser, six SDK and four launcher tests passed on Windows x64. All 99 native tests passed on Linux x64, all 38 Wasm tests passed, and all 21 README editions passed parity. |

[Formula paper backtest](formula-paper-backtest.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.41.0 · Time-series formulas

| Check | Observed result |
| --- | --- |
| Exact and causal evaluation | Native conformance tests cover every prefix of return, SMA, EMA, lowest and highest expressions. The fixtures preserve half-away rounding, divide-by-zero gaps, overflow gaps, exact fractional volume and conditional selection. |
| Grammar and limits | The parser rejects unknown names, forward-looking or dynamic periods, excessive source size, nested expressions and node counts. The evaluator checks its separate expression-row budget. |
| Offline terminal | Chromium imports the synthetic bars offline and verifies 14.5 at the earlier cutoff, 16.833333 after one additional row, unchanged accepted output on invalid input, a phone-width layout and byte-for-byte CSV rewind. |
| Regression suite | All 82 browser, six SDK and four launcher tests passed on Windows x64. All 97 native tests passed on Linux x64, all 37 Wasm tests passed, and all 21 README editions passed parity. |

[Time-series language](time-series-language.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.40.0 · Cross-sectional walk-forward

| Check | Observed result |
| --- | --- |
| Frozen training | Raising a test-window price changes first test equity from 999.1 to 1,023.1 while leaving its training scores intact. A later observed close leaves both completed folds and the earlier candidate ranking intact. |
| Missing marks and coverage | The one-listing candidate earns training equity of 999.3. The two-listing candidate has an unmarked holding at that boundary. The winning test runs with a fresh account and records turnover of 484 and fees of 0.9. |
| Corporate cash and offline export | Wasm verifies an out-of-sample settlement of 500 USD and test equity of 1,015.1. Chromium verifies zero, one and two completed windows, malformed candidate rejection, catalog preservation and byte-for-byte CSV rewind. |
| Regression suite | All 81 browser, six SDK and four launcher tests passed on Windows x64. All 94 native tests passed on Linux x64, all 36 Wasm tests passed, and all 21 README editions passed parity. |

[Cross-sectional walk-forward](cross-sectional-walk-forward.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.39.0 · Recorded trade execution

| Check | Observed result |
| --- | --- |
| Dual cutoff and session | The signal-time print, late pre-signal print and session-close print leave the ledger unchanged. A trade executed at 14:05:20 fills two shares only when the effective cutoff includes it and the receipt at 14:05:30 is known. |
| Exact fills | Five accepted prints reconcile cash from 1,000 to 957.8. The final three shares sell on a print executed at 14:10:10 and known at 14:11:10. Fractional volume, per-order fees, limits and observed-bar expiry use the paper ledger. |
| Offline receipts | Chromium checks the full capture sequence, execution and observation times, exact CSV after rewind, and retention of the accepted result on a malformed import. Wasm accepts an 8 MiB trade file alongside the bar and calendar data. |
| Regression suite | All 80 browser, six SDK and four launcher tests passed on Windows x64. All 92 native tests passed on Linux x64, all 35 Wasm tests passed, and all 21 README editions passed parity. |

[Recorded trade execution](recorded-trade-execution.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.38.0 · Paper corporate cash

| Check | Observed result |
| --- | --- |
| Dividend entitlement | Two shares held before ex-time earn 4 USD. The same-second execution has zero impact on that entitlement. A later report reverses the USD payment and records 6 EUR separately. |
| Delisting proceeds | Four shares retire when the effective delisting becomes known. Missing terms make equity incomplete. The 500 USD receivable moves to cash on the payment date, a revision adds 20 USD, and a cancellation reverses 520 USD and restores the original 463.4 cost basis. |
| Cutoffs and offline export | Tests with different effective and known times withhold future payments. Chromium verifies exact CSV receipts, malformed import rejection, catalog preservation and a byte-for-byte rewind. |
| Regression suite | All 79 browser, six SDK and four launcher tests passed on Windows x64. The native workspace suite passed on Linux x64, all 34 Wasm tests passed, and all 21 README editions passed parity. |

[Paper corporate cash](paper-corporate-cash.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.37.0 · Cross-sectional paper replay

| Check | Observed result |
| --- | --- |
| Historical ranks | Each decision uses exact closes and membership known at that instant. Native tests cover missing prices, late additions and unavailable marks. A late close leaves earlier decisions and receipts intact. |
| Delayed executions | The first cutoff shows one submitted order, no fill, and 484.9 reserved. Two later liquidity rows fill four shares. Executed principal is 462, fees are 1.4, cash is 536.6, and equity is 1,069 at the exact closing mark. |
| Offline export | Chromium checks exact 64-bit liquidity IDs, report column counts, matching CSV on rewind and catalog preservation. Invalid liquidity leaves the accepted replay available. |
| Regression suite | All 78 browser, six SDK and four launcher tests passed on Windows x64. The native workspace suite passed on Linux x64, all 33 Wasm tests passed, and all 21 README editions passed parity. |

[Cross-sectional paper replay](cross-sectional-paper.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.36.0 · Correlated portfolio scenarios

| Check | Observed result |
| --- | --- |
| Joint coverage | The six-interval demo supplies four complete vectors at 14:06 knowledge, six at 14:07 after a late close, and four at 14:08 after a removal. A third listing adds a joint vector only when both of its required closes are known. |
| Exact rebalancing | Opposite moves preserve a 100-unit fixed-weight portfolio without fees. A 100-basis-point fee on one eligible move changes each path to 99.95 with fees of 0.05 and a peak-to-trough drawdown of 0.05%. |
| Offline export | Chromium verifies complete vector and listing counts, a 64-bit seed above the safe JavaScript integer range, allocation validation and exact CSV after rewind. |
| Regression suite | All 77 browser, six SDK and four launcher tests passed on Windows x64. All 84 native tests passed on Linux x64, all 32 Wasm tests passed, and all 21 README editions passed parity. |

[Correlated portfolio scenarios](portfolio-scenarios.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.35.0 · Rolling listing risk

| Check | Observed result |
| --- | --- |
| Exact grid and coverage | A missing B close leaves the first three-interval window with one paired return. An off-grid close remains excluded. The late exact close increases coverage to three pairs at the next observation cutoff. |
| Numerical and membership cases | With all three returns, per-interval volatility is approximately 5.773503% for both synthetic listings and correlation is −1. A constant series has zero volatility and undefined correlation. A late removal reduces the last window to one pair. |
| Offline CSV | Chromium verifies explicit missing metrics, the shared knowledge cutoff, exact sample counts and an export that rewinds byte for byte. An off-grid end leaves the earlier accepted study intact. |
| Regression suite | All 76 browser, six SDK and four launcher tests passed on Windows x64. All 81 native tests passed on Linux x64, all 31 Wasm tests passed, and all 21 README editions passed parity. |

[Rolling listing risk](listing-risk.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.34.0 · Observed volume and time-price profiles

| Check | Observed result |
| --- | --- |
| Distinct opportunities | The negative price bin has two occupied time brackets, even after a late trade adds a third execution. A separate test verifies that occupying a previously untouched bin and bracket adds one opportunity. |
| Exact area selection | At the first cutoff the 70% volume area covers 5 of 6.5 units and the time-price area covers 3 of 4 opportunities. A later cutoff changes the volume area to 13.000001 of 16.600001 with the same time-price counts. Ties prefer lower prices and an exact 75% boundary is tested independently. |
| Offline CSV | Chromium verifies both points of control, full bin data, empty and restored cutoffs, and a 100% area. Invalid targets preserve the earlier data. Rewinding reproduces the same CSV. |
| Regression suite | All 75 browser, six SDK and four launcher tests passed on Windows x64. All 79 native tests passed on Linux x64, all 30 Wasm tests passed, and all 21 README editions passed parity. |

[Price profiles](price-profiles.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.33.0 · Recorded footprint and cumulative delta

| Check | Observed result |
| --- | --- |
| Exact bins | A trade at −0.01 enters the inclusive bin from −0.5 to 0. A trade at 100.5 enters the bin beginning at 100.5. An in-bin sum of 13.000001 includes 3 units of unknown volume and preserves exact millionths. |
| Cutoff replay | The execution window ends at 00:01:00 UTC. Advancing knowledge by one second adds two late observations to earlier buckets and changes the final cumulative delta from −1 to 8.900001. A trade executed after the window stays excluded. Rewinding reproduces the earlier CSV byte for byte. |
| Exact export and range | Native tests preserve a fixed-point volume of 10,000,000,000,000,000,000 ticks. Offline Chromium verifies price-bin totals, exact capture sequences and observation times. An invalid increment leaves the previous result and catalog intact. |
| Regression suite | All 74 browser, six SDK and four launcher tests passed on Windows x64. All 76 native tests passed on Linux x64, all 29 Wasm tests passed, and all 21 README editions passed parity. |

[Recorded footprint](recorded-footprint.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.32.0 · Recorded market depth

| Check | Observed result |
| --- | --- |
| Exact frame replay | The first eligible snapshot appears at 14:00:02 UTC. The next update removes the old best bid and yields a best bid of 99.5 with size 4, and a best ask of 100.25 with size 3.25. Observation and event timestamps remain distinct. |
| Gap and recovery | At 14:00:05 UTC the missing sequence 9007199254740995 suppresses both sides. At 14:00:09 UTC a full snapshot and a same-second update recover a signed bid with size 0.000001. A later crossed book stays unavailable until an explicit empty snapshot resets it. |
| Offline export | CSV preserves sequences above the JavaScript safe integer range, exact level sizes, source labels and the lack of levels during a gap. The ladder limits display to 50 levels per side while export retains all observations. Invalid files preserve the prior view and the saved catalog. |
| Regression suite | All 73 browser, six SDK and four launcher tests passed on Windows x64. All 74 native tests passed on Linux x64, all 28 Wasm tests passed, and all 21 README editions passed parity. |

[Recorded market depth](recorded-depth.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.31.0 · Aligned relative returns

| Check | Observed result |
| --- | --- |
| Exact observations | At the 14:12 UTC cutoff, ALFA returns 2.9412% and BETA has no same-time close. Advancing knowledge one minute reveals BETA's 1.7857% return and a spread of 1.1555 percentage points. |
| Revisions and membership | A later baseline revision changes that spread to −9.9301 percentage points. The 14:20 removal first appears at 14:25. Rewinding knowledge reproduces the earlier CSV byte for byte. A delisted ID stops contributing regardless of ticker reuse. |
| Browser export | Offline Chromium verifies exact dates, listing IDs, quote observation times, spreadsheet-safe source labels, missing fields and full-window export beyond the first 50 rows. The catalog is unchanged. |
| Regression suite | All 71 browser, six SDK and four launcher tests passed on Windows x64. All 72 native tests passed on Linux x64, all 27 Wasm tests passed, and all 21 README editions passed parity. |

[Relative returns](relative-returns.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.30.0 · Portfolio dividend income

| Check | Observed result |
| --- | --- |
| Ex-date entitlement | The first 2.50 USD receivable uses two shares effective before ex. A quantity reported at the ex timestamp does not change that entitlement. The amount is absent before either its effective or observation cutoff. |
| Delisting and ticker reuse | Late delisting evidence removes a post-delisting entitlement. At 14:37 UTC the portfolio shows 7.50 USD in dividend receivables and a separate delisting receivable of 70 USD. The two BETA listings retain separate dividends even when they share a ticker and dividend ID. |
| Payments and revisions | At 14:55 UTC, dividend cash is 5 USD and 8 EUR. A later holding correction changes USD cash to 4. A zero-rate revision removes it. Rewinding knowledge restores the 5 USD result. |
| Regression suite | All 69 browser and six SDK tests passed on Windows x64, 70 native tests passed on Linux x64, 26 Wasm tests passed, and all 21 README editions passed parity. |

[Portfolio replay](portfolio-replay.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.29.0 · Recorded tick bars

| Check | Observed result |
| --- | --- |
| Known prefix | No trades appear before the first observation. At the first cutoff, two trades observed in the same second form one complete bar, with open 5, high 5, low −2, close −2 and exact volume 0.000003. |
| Late trade | A trade executed earlier and observed five seconds later starts a provisional second bar. The complete first bar and its exported values are identical at both cutoffs. |
| Identity and provenance | Capture sequences above the JavaScript safe integer range remain exact in Wasm, chart readouts and CSV. A foreign instrument is rejected without replacing the preceding result. The browser workspace backup manifest is identical before and after tick research. |
| Regression suite | All 68 browser and six SDK tests passed on Windows x64, 68 native tests passed on Linux x64, 25 Wasm tests passed, and all 21 README editions passed parity. |

[Recorded tick bars](recorded-tick-bars.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.28.0 · Session-aware timeframes

| Check | Observed result |
| --- | --- |
| Session opens and DST | With a one-hour source interval and two-hour target, the October 31 bucket opens at 13:30 UTC and the November 3 bucket opens at 14:30 UTC. The first rolls open 5, high 8, low 1, close 7 and volume 0.000003. The second reports one observed source bar out of two. |
| Early close | On November 28 the final bucket runs from 16:30 to 18:00 UTC. It reports one observed bar out of two expected slots, including the final half-hour slot, and identifies the early session. |
| Offline workflow | The research CSV includes bucket close, session open, session kind, source counts and the selected calendar filename. A malformed calendar preserves the preceding chart. Returning to source restores all four bars, and export preserves the original backup manifest. |
| Regression suite | All 67 browser and six SDK tests passed on Windows x64, 66 native tests passed on Linux x64, 24 Wasm tests passed, and all 21 README editions passed parity. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.27.0 · Fixed-duration UTC timeframes

| Check | Observed result |
| --- | --- |
| Exact OHLCV | For 60-second source data and a 180-second target, the first bucket has open −1, high 5, low −7, close −1 and volume 1.000002. The complete second bucket has volume 0.300001. Native and Wasm tests also cover signed opens before the Unix epoch and rejection of unaligned timestamps or unsupported durations. |
| Coverage and provenance | The browser exports the three observed buckets with coverage 2/3, 3/3 and 1/3, omits an empty bucket and includes both interval lengths. An invalid duration leaves the current view visible. |
| Original history | The offline workspace switches back from three aggregated bars to all six source bars. Its saved backup manifest compares equal before and after the rollup and CSV download. |
| Regression suite | All 66 browser and six SDK tests passed on Windows x64, 65 native tests passed on Linux x64, 23 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.26.0 · OHLC bar chart

| Check | Observed result |
| --- | --- |
| Asymmetric geometry | A bar with open 10, high 21, low 1 and close 15 draws a vertical high-to-low stem. The open tick extends left at 55% of the high-to-low span and the close tick extends right at 30%. The test inspects the chart's Canvas strokes. |
| Range and linked cursor | Zooming and panning the comparison OHLC pane preserves the primary close-line range. The two panes link the hovered timestamp when both contain the same UTC bar. |
| Workspace recovery | Reload and a version 6 backup preserve OHLC. Restoring a version 5 backup restores the earlier close line. A mixed workspace exports separate line and OHLC selections for its two panes. |
| Regression suite | All 65 browser and six SDK tests passed on Windows x64, 63 native tests passed on Linux x64, 22 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.25.0 · Close line chart

| Check | Observed result |
| --- | --- |
| Observed closes | The line rises from 10 to 30 and falls to 20 on the three-bar fixture. The browser checks the rendered pixels at all three positions, using OHLC bounds that differ from the closes. Switching chart type preserves the visible range. |
| Exact linked hover | The primary line and comparison candles share the crosshair on June 2. The comparison crosshair stays clear on June 3, when only the primary series reports a bar. |
| Persistence | Reload and a version 5 backup restore the primary pane as a line and the comparison pane as candles. A version 2 backup restores the original candle defaults. |
| Regression suite | All 63 browser and six SDK tests passed on Windows x64, 63 native tests passed on Linux x64, 22 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.24.0 · Chart CSV export

| Check | Observed result |
| --- | --- |
| Exact offline reimport | The comparison pane exports both source timestamps as UTC Unix seconds. Signed OHLC values and fractional volumes remain exact through six places. The terminal reimports the file offline. The original source record stays byte-identical. |
| Visible and full ranges | After setting 30 bars and panning earlier in a 36-bar fixture, the visible research download contains the first 30 rows. The All bars variant contains all 36. |
| Indicator alignment and provenance | The first 19 SMA cells remain empty. The twentieth row reports 10.5 and the thirtieth 20.5. The export preserves quoted text, comma-containing source labels, interval, usage grant and adjustment policy, with a leading apostrophe on a formula-like source. |
| Regression suite | All 62 browser and six SDK tests passed on Windows x64, 63 native tests passed on Linux x64, 22 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.23.0 · Independent moving-average periods

| Check | Observed result |
| --- | --- |
| Independent calculations | On closes of 10, 14, 20 and 32, the two-bar chart ends at SMA 26.00 and EMA 27.111111. The three-bar chart ends at SMA 22.00 and EMA 23.333334. |
| Warm-up and validation | Both panes show missing values at the first UTC bar. The form rejects a zero period before applying a change. |
| Offline persistence | Reload and a version 4 backup restore recover the custom periods. A version 2 backup restores the legacy periods and overlay settings. |
| Regression suite | All 60 browser and six SDK tests passed on Windows x64, 63 native tests passed on Linux x64, 22 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.22.0 · Editable chart measurements

| Check | Observed result |
| --- | --- |
| Exact endpoints | On the two-bar import, a one-second span from −0.000001 to 1.000001 reports a 1.000002 price change and 100000200%. Changing the start to zero leaves the percentage unavailable. An endpoint with no matching UTC bar is rejected. |
| Plot projection and concurrent edits | Cursor selection records both times and prices. Zooming and panning move the rendered line within the plot while the readout and exported endpoint values stay identical. Both panes share a drawing when they display the same instrument. An older open editor cannot overwrite a newer save. |
| Offline persistence | Reload and a version 3 backup restore recover the drawing and linked-chart preferences. Removing the last line returns the two-pane export to version 2. Restoring a version 2 backup recovers its settings and catalog. The imported CSV remains byte-identical. |
| Regression suite | All 59 browser and six SDK tests passed on Windows x64, 63 native tests passed on Linux x64, 22 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.21.0 · Linked chart panes

| Check | Observed result |
| --- | --- |
| UTC crosshair linking | NVDA and MSFT share a crosshair on an exact UTC bar. When the comparison instrument has a gap, its pane shows no linked crosshair. The reverse direction follows the same rule. |
| Independent panes | Zooming the primary pane leaves the comparison interval in place. Changing the primary symbol preserves the comparison symbol. Turning off linking leaves hover local to its pane. The panes align on a desktop display and fit a 360 px viewport. |
| Workspace persistence | Reload retains MSFT, its EMA setting and the link toggle. A version 2 backup restores comparison settings into a clean profile. Restoring the older version 1 backup returns to a single pane. |
| Regression suite | All 56 browser and six SDK tests passed on Windows x64, 61 native tests passed on Linux x64, 21 Wasm tests passed, and all 21 README editions passed the parity check. |

[Chart workspace](chart-workspace.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.20.0 · Point-in-time portfolio replay

| Check | Observed result |
| --- | --- |
| Late and revised closes | At effective 14:10 UTC, BETA-001 is unvalued at the same knowledge time. The 14:12 observation increases known USD share value from 204 to 764. The 14:16 correction gives 709 for the same effective time. Rewind recovers the original partial result. |
| Delisting claims | BETA-001 retains its pre-delisting quantity when proceeds are missing. At 14:45, its 70 USD receivable stays separate from 225 EUR of marked shares in BETA-002. The 14:50 USD subtotal is 284, including 70 in delisting cash. |
| Position and currency revisions | A late pre-delisting position correction lowers known USD cash to 64 at 14:58. Revised terms give a 72 EUR receivable and later cash, and an explicit zero correction removes that value. The open holding and the delisted claim remain distinct despite the shared symbol. |
| Regression suite | All 54 browser and six SDK tests passed on Windows x64, 61 native tests passed on Linux x64, 21 Wasm tests passed, and all 21 README editions passed the parity check. |

[Portfolio replay contract](portfolio-replay.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.19.0 · Dated dividend entitlements

| Check | Observed result |
| --- | --- |
| Ex-date selection | ALPHA starts at 100 shares and 25 USD receivable. A same-timestamp holding change and a later sale leave the earlier entitlement intact. BETA independently uses 40 shares and credits 4 EUR. |
| Late corrections | A late **pre-ex** position revision changes ALPHA to 120 and adds 5 USD to the receivable. The revised dividend pays 36 USD. A post-pay position correction to 110 shares reverses 3 USD. The later rate correction leaves 30.80 USD cash. Rewinding restores the older settled and receivable balances. |
| Missing, zero and changed ex-date | Native and Wasm tests distinguish a missing position from reported zero. Native tests move a dividend ex-date at the same cutoff as a position correction and confirm that both observations apply exactly once. |
| Regression suite | All 53 browser and six SDK tests passed on Windows x64, 58 native tests passed on Linux x64, 20 Wasm tests passed, and all 21 README editions passed the parity check. |

[Dividend entitlement contract](cash-dividends.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.18.0 · Split revisions and cancellations

| Check | Observed result |
| --- | --- |
| Effective-time revision | The original split changes the last pre-open close from 106.50 raw to 53.25 adjusted. The 14:10 UTC revision moves the effect to 14:20 and restores the raw prefix until then. |
| Distinct IDs and cancellation | Two IDs compound at 14:20 UTC, so the 14:10 candle closes at 17.833333 adjusted and 53.50 raw. Canceling SPLIT-A at 14:30 leaves SPLIT-B in force and the adjusted close becomes 35.666667. Candles starting on the new effective boundary retain their original basis. |
| Replay and legacy files | Rewinding restores the earlier exact view and keeps source prices and the saved workspace intact. The native suite rejects ambiguous revisions and verifies a withdrawal before the revised effect. The six-column imports and prior dividend and split replays still pass. |
| Regression suite | All 52 browser and six SDK tests passed on Windows x64, 55 native tests passed on Linux x64, 19 Wasm tests passed, and all 21 README editions passed the parity check. |

[Split contract and fixture](corporate-actions.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.17.0 · Point-in-time delisting proceeds

| Check | Observed result |
| --- | --- |
| Effective and known cutoffs | The holding retains ten ordinary shares through the 14:34 UTC knowledge cutoff. At 14:35, the delisting becomes known and the proceeds are unavailable. Terms received at 14:37 establish a 70 USD receivable and a −30% return. |
| Cash and currency revisions | The ledger credits 70 USD at 14:50 and 10 USD at 14:55, reverses 80 USD at 15:01, then credits 90 EUR at 15:04. An observed zero payment at 15:05 reverses 90 EUR. The return remains unavailable when the proceeds and reference close have different currencies. |
| Identity and cancellation | BETA-002 keeps its ordinary shares despite reusing the same symbol. Native tests verify that canceling the original delisting restores ordinary shares and reverses recognized cash. Earlier cutoffs preserve their original postings. |
| Regression suite | All 51 browser and six SDK tests passed on Windows x64, 53 native tests passed on Linux x64, 18 Wasm tests passed, and all 21 README editions passed the parity check. |

[Delisting proceeds contract](delisting-proceeds.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.16.0 · Seeded scenarios

| Check | Observed result |
| --- | --- |
| Default demo | Seed 20250403 with 256 paths, eight moves per path and the 14:11 UTC cutoff gives observed baseline equity of 957.8. Scenario ending equity is 975.1455 at the 5th percentile, 997.6 at the median, and 1020.476924 at the 95th percentile. A total of 145 paths end below starting cash. |
| Seed and cutoff | Repeated inputs preserve every ordered path and percentile. A different seed changes the sampled paths and preserves the observed baseline. Modifying a bar first observable after the cutoff leaves all outputs identical. Wasm accepts the largest unsigned 64-bit seed and rejects the next value. |
| Risk and recovery | A flat fixture keeps starting cash and yields zero drawdown and zero exposure in every path. The browser reproduces the default risk table offline, reports an insufficient horizon and retains its previous valid result. |
| Regression suite | All 50 browser and six SDK tests passed on Windows x64, 50 native tests passed on Linux x64, 17 Wasm tests passed, and all 21 README editions passed the parity check. |

[Scenario contract](seeded-scenarios.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.15.0 · Walk-forward validation

| Check | Observed result |
| --- | --- |
| Complete folds | The 14:08 UTC cutoff shows zero completed folds. At 14:09, the first appears with training ending at 14:07 and testing from 14:08 to 14:09. At 14:11, the second covers 14:10 to 14:11. |
| Training selection | Pair 1:2 ranks first at 1003.4 ending training equity and 2:3 ranks second at 997.8. Changing both first test closes changes its test marks and preserves both training scores and the winner. Ties favor the lower fast window, then the lower slow window. |
| Independent test ledger | Test cash starts at 1000 with zero shares, and every test receipt belongs to the test clock. Later folds preserve the full earlier test trace. The offline panel exposes each fold and rejects repeated candidate pairs. |
| Regression suite | All 49 browser and six SDK tests passed on Windows x64, 48 native tests passed on Linux x64, 16 Wasm tests passed, and all 21 README editions passed the parity check. |

[Walk-forward contract](walk-forward.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.14.0 · Session-aware bar backtest

| Check | Observed result |
| --- | --- |
| Delayed fills | The 14:05 crossover submits a buy and leaves holdings at zero. The missing 14:06 interval leaves the ledger unchanged. The 14:07 close supplies a two-share partial fill and the 14:08 close fills the remainder. |
| Liquidity and fees | The 10% participation cap determines whole-share fill sizes. The default run ends at 957.8 cash with realized loss of 42.2. A 100-basis-point adverse shift prices the first fill at 14.14 and makes the last sale violate its limit. |
| Prefix and import | Tests compare every cutoff's signals, equity marks and paper receipts against a longer run. Changing later quotes leaves the earlier prefix intact. Browser tests cover the offline chart, local import, rewind and unchanged workspace. |
| Regression suite | All 48 browser and six SDK tests passed on Windows x64, 46 native tests passed on Linux x64, 15 Wasm tests passed, and all 21 README editions passed the parity check. |

[Backtest contract and fixture](bar-backtest.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.13.0 · Paper cash and fill ledger

| Check | Observed result |
| --- | --- |
| Cash and reserves | The initial 503 reserve leaves 497 available. A unique four-share partial fill leaves 801.6 cash, 300.6 reserved and 501 available. Fees total 2.4 on the first fill and 0.6 on the second. |
| Position accounting | Selling three shares gives 13 realized profit and a 663.7 cash balance. Native tests reconcile fixed-point cost and profit through partial liquidation and final removal, including a residual millionth. |
| Risk and replay | Tests cover cash, position and exposure caps, insufficient shares, ineligible price time, limit prices, repeated fill IDs, cancellations and halting. Rewinding restores the earlier account and receipt prefix. |
| Regression suite | All 46 browser and six SDK tests passed on Windows x64, 44 native tests passed on Linux x64, 14 Wasm tests passed, and all 21 README editions passed the parity check. |

[Paper ledger contract and fixture](paper-ledger.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.12.0 · Replayable alerts and local inbox

| Check | Observed result |
| --- | --- |
| Exact crossing evidence | The demo has one threshold alert at 14:02. At 14:03 the revised observation crosses the level and the three-sample SMA. A stale report leaves rolling state unchanged. The full replay has eight distinct records. |
| Replay and durability | Two Chromium tabs concurrently save identical replay evidence. One commits eight records and the other commits zero. A rewind and repeat save keep all eight, including after offline reload. |
| Atomicity and retries | Conflicting evidence under the same ID aborts the whole batch. An interrupted write succeeds on the third attempt after two simulated interruptions. Three consecutive interruptions leave existing records intact and stop retrying. |
| Regression suite | All 44 browser and six SDK tests passed on Windows x64. Forty native tests passed on Linux x64 and 13 Wasm tests passed. All 21 README editions passed the parity check. |

[Alert contract and fixture](replay-alerts.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.11.0 · Point-in-time European option chains

| Check | Observed result |
| --- | --- |
| Independent pricing evidence | A 100-strike one-year fixture gives USD 8.827321 and USD 6.866891 for the 20% call and put. Tests compare a separate Gaussian calculation, dividend-adjusted parity and an out-of-the-money tail value. |
| Numerical sensitivity | Native tests invert 54 combinations of strike, expiry, volatility and side, then verify Delta, Gamma, Vega, Theta and Rho by finite differences. |
| Cutoff and invalid quotes | Rust, Wasm and Chromium verify the 14:02 delayed quote, 14:03 underlying update and 14:04 spread correction. One-sided, crossed, stale, expired and out-of-bounds rows retain typed reasons. |
| Offline surface and regressions | Chromium compares April and October IV points, rewinds checks and validates both local files while preserving the catalog. All 41 browser and six SDK tests passed on Windows x64. Thirty-seven native tests passed on Linux x64, twelve Wasm tests passed, and all 21 README editions passed the parity check. |

[Option-chain methods and fixture](option-chain.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.10.0 · Point-in-time economic release calendar

| Check | Observed result |
| --- | --- |
| Schedule and forecast | The synthetic inflation release moves from 14:10 UTC to 14:30 after the reschedule is observed. The pre-release forecast is 2.5 percent. |
| Independent actual gates | No actual appears with a publication cutoff of 14:29:59, even with later knowledge. Publication at 14:30 also produces no actual at knowledge cutoff 14:31:59. The report becomes visible at 14:32 with 2.7 percent. |
| Revisions and rewind | The first and second revisions show 2.6 and 2.8 percent. The official chain links each revision to its predecessor. The frozen forecast remains 2.5 percent, and rewinding restores the earlier view. |
| Imports and regression | Native tests cover reordered and incomplete lineage, malformed reports and missing releases. Chromium verifies offline replay, CSV validation, focus restoration, a 360-pixel viewport and an unchanged workspace catalog. All 39 browser and six SDK tests passed on Windows x64. Thirty-two native tests passed on Linux x64 and eleven Wasm tests passed. All 21 README editions passed the parity check. |

[Economic calendar contract and fixture](macro-calendar.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.9.0 · Point-in-time financial statements

| Check | Observed result |
| --- | --- |
| Original and restated filings | Keeping valuation fixed at 14:00 UTC, the original ALFA filing gives 10× P/E. The 14:20 observed restatement gives 15×. A preliminary filing arriving at 14:25 leaves the newer published restatement selected. |
| Market capitalization and rewind | The first capitalization is invisible until 14:01. Its revision at 14:35 lifts P/E to 20× without changing the selected filing. Rewinding restores the original filing and capitalization. |
| Unavailable ratios | Fixtures verify absent market cap, mismatched currencies, missing equity or revenue, and nonpositive net income. The UI preserves issuer, filing, fiscal period and both source times. |
| Import and regression | Chromium validates a filing-only CSV, invalid dates, offline queries, a 360-pixel viewport and an unchanged workspace catalog. All 37 browser and six SDK tests passed on Windows x64. Twenty-nine native tests passed on Linux x64 and ten Wasm checks passed. All 21 README editions passed the parity check. |

[Financial statement contract and fixtures](financial-statements.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.8.0 · Point-in-time sector heatmap

| Check | Observed result |
| --- | --- |
| Reconciliation | Native and Chromium tests compare listing identities to the screen at each selected cutoff, including unknown classifications, late removals, delisting and ticker reuse. |
| Covered weight and contribution | At effective 14:10 UTC the late close leaves 60% of 100% known weight covered with 1.2% observed contribution. At 14:12 coverage reaches 100% and observed contribution rises to 6%. |
| Sector revisions | The 14:16 correction moves BETA from Financials to Technology and the price revision yields a 1.6% weighted sector return. Rewinding restores the earlier sectors and weights. |
| Sparse data and validation | The new BETA listing first appears with missing sector, weight and return. Its later sector report leaves weight missing. Native tests distinguish zero from missing weight. Browser tests verify CSV validation, an unchanged stored catalog and a 360-pixel viewport. |
| Regression suite | 35 production Chromium and six SDK tests passed on Windows x64. Twenty-six native tests passed on Linux x64 and nine compiled Wasm checks passed. The README checker verified all 21 editions. |

[Heatmap contract and fixture](sector-heatmap.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.7.0 · Point-in-time universe screening

| Check | Observed result |
| --- | --- |
| Addition and late close | At 14:05 UTC ALFA alone ranks at +1%. BETA joins at 14:10 and stays unranked through 14:11:59. Its first visible close at 14:12 puts it first at +12%. |
| Price revision | Holding the effective cutoff at 14:10 and advancing the knowledge cutoff to 14:16 changes BETA to +1%, behind ALFA at +2%. Rewinding restores the earlier rank or missing price. |
| Membership removal and delisting | Holding the effective cutoff at 14:20 shows two ranked members at 14:24:59 and only BETA at 14:25. After delisting there are no members. BETA's later listing remains unranked with a missing baseline. |
| Exact ranking and inputs | Native checks cover tied ranks, equally displayed but unequal returns, signed tie rounding, values above JavaScript's safe integer limit, out-of-order reports, missing endpoints and rejected duplicates. Chromium verifies rejection of a foreign universe, custom baseline validation, offline replay, a 360-pixel viewport and an unchanged catalog. |
| Regression suite | 33 production Chromium and six SDK tests passed on Windows x64. Twenty-four native tests passed on Linux x64 and eight compiled Wasm checks passed. The README checker verified all 21 editions. |

[Screen contract and fixture](universe-screen.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.6.0 · Point-in-time universe membership and delistings

| Check | Observed result |
| --- | --- |
| Additions and removals | At 14:05 UTC BETA is known but still outside the universe. At 14:10 it becomes a member. ALFA's 14:20 removal appears at 14:25 when the report arrives. |
| Independent cutoffs | Holding the effective cutoff at 14:20 and advancing the knowledge cutoff from 14:24:59 to 14:25 changes ALFA from member to removed. Moving the effective cutoff back one second restores membership. |
| Delisting and ticker reuse | BETA-001's 14:30 delisting appears at 14:35. It stays delisted when BETA-002, a separate listing of the same ticker, enters at 14:45. ALFA reenters under its existing listing ID at 14:50. |
| Revisions and cancellation | The replay omits a superseded future effective time. A later cancellation removes its pending addition. Native tests also check same-time priority, row-order independence and malformed imports. |
| Browser replay | Chromium checked all 11 demo cutoffs, backward replay, offline CSV import, independent queries and a 360-pixel viewport. The imported catalog stayed intact. |
| Regression suite | 31 production Chromium tests and six SDK tests passed on Windows x64. Twenty native tests passed on Linux x64, and seven compiled Wasm tests passed. The README checker verified all 21 editions. |

The synthetic fixture uses explicit UTC times and stable listing IDs. [Universe contract and cutoff table](universe-membership.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.5.0 · Point-in-time cash dividends

| Check | Observed result |
| --- | --- |
| Cutoff ledger | Compared the synthetic 100-share ledger at all 35 browser replay events. Native tests also checked immediately before, at and after every dividend event and at the superseded pay time. |
| Ex-date and revisions | USD starts at zero, accrues 25.00 at ex-date and rises to 30.00 when the amount revision arrives. The old pay date produces no cash. The revised pay date closes the 30.00 receivable and credits USD 30.00. |
| Late and corrected reports | The late EUR record posts EUR 10.00 at observation. The post-payment correction posts a USD 2.00 debit and leaves USD 28.00. Rewinding restores USD 30.00 and the earlier postings. |
| Multi-currency and limits | Native tests exercise currency replacement, post-payment reversals, cancellation, coincident cutoffs, zero shares and exact totals above JavaScript's safe-integer limit. Browser tests verify validation and a custom seven-share scenario alongside raw and split-adjusted charts, with no catalog changes. |
| Packaged upgrade | The actual 0.4.0 and 0.5.0 browser archives opened the same workspace in an isolated profile. After upgrading, Chromium replayed the uploaded dividend fixture offline and kept the stored history and preferences intact. |
| Regression suite | 29 production Chromium and six SDK tests passed on Windows x64. Sixteen native tests passed on Linux x64, and six compiled Wasm tests passed. The README checker verified all 21 editions and their shared examples. |

The fixture is synthetic and uses explicit UTC times and an assumed whole-share entitlement. [Dividend ledger contract and cutoff table](cash-dividends.md) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.4.0 · Point-in-time stock splits

| Check | Observed result |
| --- | --- |
| Before effect | The first raw and adjusted close is 101.00. At 14:20 UTC on June 2 the report becomes visible, but the 2-for-1 ratio becomes eligible at 14:00 UTC on June 3. |
| At and after effect | The last pre-split close is 106.50 raw and 53.25 adjusted. Its volume is 810.000001 raw and 1,620.000002 adjusted. The first post-split close is 53.00 in both views. |
| Clock-aware corrections | The browser keeps the historical close at 101.00 until a late report is observed, switches it to 50.50, and returns to 101.00 when rewound. Native Rust and Wasm also verify a later 3-for-1 ratio correction without exposing it at earlier cutoffs. |
| Numerical and file boundaries | Native tests cover reciprocal volume, rational composition, reverse splits, signed tie rounding and overflow rejection. Browser tests reject a mismatched instrument and a split inside a candle. The imported workspace database stays unchanged. |
| Packaged upgrade | Using both archives' own launchers, Chromium opened a 0.3.0 catalog under 0.4.0 on the same origin and ran the imported split offline. The raw CSV, catalog and preferences matched before and after the upgrade and replay. The split view fit a 360-pixel viewport. |
| Regression suite | All 27 production Chromium and six SDK tests passed on Windows x64. Twelve native tests passed on Linux x64. Five compiled Wasm checks passed. The README check verified all 21 editions and their shared runnable examples. |

The fixture uses synthetic prices, volumes and sessions. [Corporate actions contract](corporate-actions.md) · [Hosted verification history](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.3.0 · Session-aware historical replay

| Check | Observed result |
| --- | --- |
| Clock change | The NYSE fixture opens October 31, 2025 at 13:30 UTC (UTC−04:00) and November 3 at 14:30 UTC (UTC−05:00), both at 09:30 local. Each session uses its explicit UTC boundaries. |
| Thanksgiving and early close | November 27 emits no events. November 28 has seven half-hour candles and closes at 18:00 UTC (13:00 local). The test also verifies a shorter final interval using a one-hour grid. |
| Missing interval | The slot starting November 3 at 15:00 UTC is reported missing at 15:30 UTC. Its event reveals zero new bars and leaves the previous close visible. The engine rejects off-grid, duplicate and out-of-session bars. |
| Prefix correctness | Native Rust and the Wasm bridge checked SMA(20) and EMA(9) at every one of the 294 events against the corresponding prefix of the fixed-point batch result. The example contains 20 sessions, 253 observed candles and one missing slot. |
| Terminal behavior | Production Chromium ran through the demo with the network disabled. It verified the initial empty view, clock change, gap, last close, rewind and reset. A separate imported-series test exercised file selection, off-grid rejection, six-place quotes and an unchanged local catalog. The replay screen also fit a 360-pixel viewport. |
| Local regression counts | Eight native Rust tests ran on Linux x64 with toolchain 1.100.0. Four compiled Wasm, four launcher and two dependency-policy tests passed. Six SDK and 25 Playwright tests passed with Node 26.8.2, TypeScript 7.0.2 and the pinned Chrome Headless Shell on Windows x64. The Windows host's Application Control denied direct execution of the new native test binary. |
| Documentation | 21 complete README editions pass checks for 11 corresponding sections, identical runnable examples and valid navigation. The selection covers the 20 highest published positions by total speakers, including both languages listed at the rounded rank-20 boundary. |

The schedule uses published NYSE core hours and an explicit U.S. Eastern offset at each opening. The OHLCV fixture is synthetic. [Replay contract and source citations](historical-replay.md) · [Hosted workflow evidence](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.2.0 · Transactional history and workspace recovery

| Check | Observed result |
| --- | --- |
| Upgrade from the distributed 0.1.0 ZIP | Imported two histories through the previous terminal, hid one from the watchlist, selected the other and enabled EMA only. Opening 0.2.0 on the same origin upgraded the active service worker and migrated both histories. Chrome retained the original v1 storage value byte for byte. |
| Recovery without a network connection | Exported the upgraded workspace, installed the new terminal in a separate browser context and disconnected it before restoring. The recovered workspace matched all 25 timestamps and all 125 six-place OHLCV values, both instrument identities, watchlist membership, selection and overlay settings. Chrome reported zero page errors. |
| Migration failure and retry | Browser tests interrupt an IndexedDB transaction, change the legacy workspace while migration is in progress, deny legacy storage access and present orphaned records or an unknown schema. The terminal preserves the source and reports the failure. A retry after an interrupted migration succeeds. |
| Restore and concurrency | Tests cover altered digests, inconsistent counts or identifiers, invalid CSV, stale previews in another tab and an abort after writes have begun. Each rejected replacement leaves the prior catalog intact. A Chrome quota override applied before the database is opened exercises an actual out-of-quota write and verifies the committed workspace after reload. |
| Portable format | A separate Node implementation recalculates sample, manifest and series digests. A clean-profile restore compares integer timestamps and fixed-point OHLCV values, including negative prices and six-decimal volumes, and the imported metadata and preferences. |
| Chart after replacement | Two open tabs displayed a three-bar instrument. A restore replaced it with one bar under the same instrument ID while the second tab's crosshair was on the third bar. Both tabs immediately displayed the new one-bar chart and close, without a page error. |
| Preference durability | A second IndexedDB transaction held a pending indicator write while the user pressed Escape. The dialog reported that it was saving, closed when the transaction committed and retained the indicator after reload. |
| Local regression suite | A clean install with TypeScript 7.0.2 passed 23 production browser tests on Windows x64 using Playwright's pinned Chrome Headless Shell 159.0.8154.6. Six SDK tests, six native Rust tests, three Wasm tests, four launcher tests, two dependency-policy tests, Rust formatting and native/Wasm Clippy also passed. |
| Dependencies | The license and SBOM gate verified 509 locked external package versions. npm audit reported zero known vulnerabilities. The native advisory check queried 432 Cargo package versions, verified the GLib backport and reported two upstream maintenance notices. [Native dependency review](native-advisories.md). |
| Portable distribution | Two local packaging runs produced identical 157,228-byte ZIPs with SHA-256 `33bc652334db484b39ac252baaea9a180cbb01082b75af46787d37cf7ebb03a4`. The final drill ran each version's own launcher from its extracted ZIP and checked the embedded 0.2.0 SBOM and Wasm digest. |

These recovery drills exercise the production browser build on desktop Chromium. The hosted workflow also builds the native wrapper on Windows, macOS and Linux and runs a Linux window smoke test. A backup is unencrypted and anyone who can edit it can recompute its checksums. [Backup instructions](workspace-backup.md) · [Workflow runs by revision](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

## 0.1.0 · Initial milestone record

The results and recovery instructions below describe the original release.

### Browser and core

| Check | Observed result |
| --- | --- |
| Native Rust · Windows x64 and Debian 12 x64 | Six integration tests passed on each host, including fixed-point golden values, generated differential and prefix tests, UTC dates, identity, signed rounding and rejected imports. |
| Rust static checks | Workspace formatting and Clippy passed on Windows x64. Clippy also passed for the Wasm target with warnings treated as errors. |
| Compiled WebAssembly | Three Node integration tests passed, including a 100,000-bar import. Rebuilding in a fresh target directory with Rust 1.99.1 produced the same 39,413-byte module, SHA-256 `c18d40b49114abec2650aaf1415a4f3e696b6d9d4e5e21c24fda2999d7b505c5`. |
| Browser application | After a fresh `npm ci`, ten production Playwright tests passed with Chrome 158.0.8127.38 on Windows x64. Cases covered rendering actual candles and an SMA line, panning, zoom, crosshair inspection, invalid and valid imports, watchlist/overlay persistence, six-decimal prices and volume, offline reload, a 360px viewport, damaged workspace recovery, stale write detection and configurable import limits. |
| Quick-start launcher | Four Node tests passed, covering both ZIP and source layouts, loopback serving, asset MIME types, and the boundary around public assets. |
| Extracted browser ZIP | Launched the shipping server from a clean extraction. Chrome displayed the chart, installed its offline cache and imported the included reference CSV. The last close was 15.00 before and after an offline reload. No page errors were recorded. |
| Package reproducibility | Packaging the final built assets and updated third-party notices twice produced SHA-256 `4d5bac3b90b21b79f45136da7d8ef3aae0d8b8ec223240087d9a6412a44f3b2c`. The extracted archive passed the Chrome import and offline checks again. This tests local archive reproducibility. |
| Dependency checks | The inventory comprises 489 external package versions across the locks, including the native backport and optional targets. Two license-expression tests passed. npm audit reported zero known vulnerabilities. OSV queried 432 native package versions, confirmed the reviewed backport for the two aliases of one GLib advisory, and reported two maintenance warnings. [Native dependency review](native-advisories.md). |
| trading-bot SDK | Six SDK tests passed. Two additional scenarios called all four real FastAPI routes on a pinned upstream checkout inside an isolated Linux container. They distinguished an empty standalone process from timestamped, synthetic account and position snapshots. See [endpoints, commit and reproduction](trading-bot.md). |

### Desktop and benchmarks

A Debian GNU/Linux 12 x86_64 release-profile build completed against the final browser assets and patched GLib, with GTK 3.24.38, WebKitGTK 2.50.6, Rust 1.100.0 and Tauri 2.12.7. The optimized GLib consumer regression passed. In an unprivileged Xvfb/D-Bus session the 1440×900 native window exposed the chart and watchlist through AT-SPI. The smoke test opened Import CSV, expanded the format disclosure and read the configured 1,500,000-byte and 100,000-bar limits. The older vendored GTK binding produces nonfatal compiler warnings. Windows Application Control rejected unsigned dependency build executables (error 4551) on the local machine. Hosted Windows build evidence is recorded separately below.

The initial hosted run passed the browser verification job and built the desktop host on Windows Server 2022, macOS 15 and Ubuntu 24.04. Its separate advisory job failed on the dependency subsequently backported in the desktop workspace. The backport run passed the advisory gate. The workflow also exercises a Linux GLib consumer test and opens the embedded terminal under Xvfb. [Initial run](https://github.com/Yunushan/marketweft/actions/runs/45668657701) · [Backport run](https://github.com/Yunushan/marketweft/actions/runs/45669223098) · [Current run history](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

| Workload | Debian x64 native | Windows x64 Node/Wasm |
| --- | ---: | ---: |
| Parse 100,000 CSV bars | 27.37 ms | 62.06 ms |
| Compute SMA(20), 100,000 closes | 1.11 ms | 24.88 ms |
| Compute EMA(20), 100,000 closes | 1.17 ms | 23.92 ms |

Each figure is a mean across ten warm passes from one run. Browser-facing Wasm timings include JavaScript data transfer and result creation. Native Windows benchmark execution was blocked by Application Control. These measurements establish a baseline, not a service-level target.

### Production readiness and recovery at 0.1.0

- **Local research.** The existing data paths are generated histories, entitled user files and a separately configured trading-bot observer. Import checks and fixed-point calculations have release fixtures. There is no real-money or simulated order-entry path. Exchange sessions, corporate actions, feed entitlements for remote providers and point-in-time financial statements are backlog requirements.
- **Storage.** Each accepted import is persisted in the current browser origin. Quota failures are surfaced. On damaged storage the terminal salvages readable imports and preserves raw state under `marketweft.workspace.v1.recovery.N` before a later save. Retain original CSV files outside the profile. After a lost profile, relaunch on the same origin and re-import those files. Validated full-workspace export and restore is the next milestone.
- **Distribution.** Static assets contain npm notices and the Rust standard-library notices. The ZIP also contains a runtime SBOM. The repository SBOM covers the full npm and Cargo locks. CI defines provenance attestation for version-matched browser release tags. Local ZIPs have a digest and have not received a release signature. Native signing and notarization remain future work.
- **Deployment.** The loopback launcher is usable by one local operator. Authentication, authorization, audit retention, key storage, high availability, a recovery-time objective and restore drills are required before multi-tenant hosting. Installed PWA behavior and mobile/BSD native targets need device-specific evidence.

The [roadmap](../ROADMAP.md) gives the next executable milestone and the [coverage matrix](coverage.md) associates the longer-term requirements with acceptance tests.

