# MarketWeft verification

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

