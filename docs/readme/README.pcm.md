<!-- MarketWeft README · locale=pcm -->

# MarketWeft

**0.26.0 · 0BSD**

**Language dem for dis guide**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · **Naijá**
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Wetin MarketWeft dey do

MarketWeft na research terminal wey dey work for your own device. Analyst, developer and operator fit load OHLCV file wey dem get right to use, see candle and volume, calculate SMA and EMA with fixed decimal, and save watchlist, instrument and indicator for IndexedDB. E fit work offline after e cache the files. The price and volume wey follow am na synthetic, so provider account no dey needed.

MarketWeft 0.26.0 add OHLC bars as another choice wey each pane fit select on im own. MarketWeft 0.7.0 fit rank universe members by how price change, using reports wey don reach by the query time. Replay for trading session cover stock split, cash dividend, who dey inside and which listing dem don remove for exchange. The repo get TypeScript observer wey only read separate trading-bot service and Tauri wrapper wey still dey test. Provider feeds, orders, signed installers and hosting for many users dey roadmap.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Start the portable terminal

Download browser-terminal-attempt-N from GitHub verification wey pass. Extract MarketWeft-browser-0.26.0.zip, leave dist/ beside serve-terminal.mjs and run the command inside that folder. Open http://127.0.0.1:4173/ for current browser wey get WebAssembly, Canvas, BigInt and IndexedDB. Use Node.js 22.12 or newer. You no need install npm for the ZIP. Wait for Offline ready before you off network.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## How to replay the NYSE sample

Open Historical replay and choose Start demo. Next event moves one step, Previous event goes back, Play and Pause control playback, and Reset clears the history wey don show. Chart starts empty. Candle shows when the interval ends. Event time na interval start or session boundary. Observed at na when the event ready to show. Speed only changes as e fast for screen.

For 31 October 2025 session opens 13:30 UTC (UTC−04:00). For 3 November e opens 14:30 UTC (UTC−05:00). The gap wey starts 15:00 on 3 November shows as missing at 15:30. Thanksgiving no get interval. On 28 November market closes early 18:00 UTC after seven 30-minute candles. The demo get 20 sessions, 253 candles and 294 events. Price and volume na synthetic, with NYSE public hours.

Open Historical replay → Start split demo, and use Price basis to switch Raw and Split-adjusted for the same event. The 2-for-1 split dey announced and observed before e take effect. Both views match before effect. When e take effect, the last old close changes from raw 106.50 to adjusted 53.25, and volume doubles. The first candle after still closes 53.00. For your data, upload Corporate actions CSV for the instrument, confirm the OHLCV na raw and add session calendar. Use the latest observed ratio once e effective. Late report or correction changes the view only from when e reach. Original history still dey intact.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Open Historical replay → Start dividend demo to follow 100 shares wey qualify for each payment. For ex-date, USD 25.00 dey due. Amount revision raises am to USD 30.00, and the revised pay date shifts when cash enters. Late report posts EUR 10.00 when e reach. Correction after payment leaves USD 28.00. Rewind to see earlier balances. For your own data, upload Cash dividends CSV and put Entitled shares per distribution. Keep the same distribution ID for corrections. The ledger keeps currencies separate and keeps old postings and source prices intact.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Open Historical replay → Open universe replay → Start universe demo. For 14:05 UTC na only ALFA dey inside, BETA joins for 14:10. ALFA removal wey start 14:20 becomes known 14:25. BETA delisting wey start 14:30 becomes known 14:35. Rewind to see old members or run query with separate Effective time and Known time. Upload Universe membership CSV for your own data. Keep change ID for revisions, and use another listing ID if dem reuse ticker.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

For Universe screen, choose Load demo prices and leave 14:00 UTC as baseline. ALFA lead with 1% for 14:05. BETA join for 14:10 and get no rank till dem know im close for 14:12. Put effective time for 14:10 and try known time 14:12 and 14:16 to see how BETA return change from 12% to 1%. For effective time 14:20, ALFA comot when report reach for 14:25. To use your own close prices for exact times, upload Universe prices CSV with listing ID. If start or target close no dey, the member show without rank.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

After you load demo prices, choose Load demo sectors for Sector heatmap. For 14:10 UTC di map cover 60% of weight wey dem know. When BETA close show for 14:12, coverage reach 100% and di contribution move from 1.2% to 6%. Di correction for 14:16 move BETA from Financials go Technology. Open one tile to see rank, contribution and classification times. For your own reports, upload Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Open Historical replay → Open financial statements → Start financial demo. Original filing show P/E of 10×. For the same valuation time, Restatement observed raise am to 15× and show say common equity no dey. Revised capitalization raise P/E to 20×. Upload Annual filings CSV and optional Capitalization CSV to query your own issuer and the time dem know the data.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Open Historical replay → Open economic calendar → Start calendar demo. Before release, forecast na 2.5 percent and actual never show. Actual observed show 2.7 percent for 14:32 UTC. Revised actual show 2.8 percent and Release evidence keep both corrections. Upload Macro calendar CSV for your own dated releases.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Open Historical replay → Open option chain → Start option demo. April strike 100 pair start with IV near 20%. Late option quote show strike 90 call at 25% IV, and Corrected spread make one put fit calculate. Open Implied volatility surface to compare expiry dates. Load Underlying CSV and Option quotes CSV for your own quotes.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Open Historical replay → Open replay alerts → Start alert demo. First crossing show one threshold alert. Correction observed show corrected sample and where e cross moving average. Full alert replay show eight alerts. Press Save to alert inbox two times. E save eight first and zero new one the next time. Use Alert rules CSV and Alert observations CSV for your own data.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Open Historical replay → Open paper ledger → Start paper demo. Move from cash reserve 503 reach one partial fill wey leave 801.6 cash. Final account show 663.7 cash and 13 profit after the halt. Use Paper events CSV to replay your own simulated orders, fills and controls.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Open Historical replay → Open bar backtest → Start backtest demo. Signal for 14:05 UTC place buy order. Gap for 14:06 no give fill. Di close for 14:07 allow two shares. Final backtest show equity 957.8. Load session and bar CSVs for your own local history.

For di backtest demo, run Walk-forward validation with six bars for training and two for testing. Di first complete window show for 14:09 UTC. Pair 1:2 win for training and stay di same for di two test bars. Di test start with fresh account.

For di bar backtest demo, run Seeded scenarios with seed 20250403 and 256 paths with eight moves for each path. Di reference account end with 957.8 and di middle scenario end with 997.6. Di same cutoff, input and seed go give di same risk table.

For di universe demo, load Delisting proceeds for BETA-001 and set both cutoffs to 14:35 UTC. Di money never show. For 14:37, ten shares get 70 USD wey dem still owe, and di ledger record di cash for 14:50. Later correction leave earlier results and keep BETA-002 separate.

Open Start split revisions demo and choose Split-adjusted. On June 3 for 14:10 UTC, di new time remove di old adjustment. For 14:20, di two ratios work together. When dem cancel SPLIT-A for 14:30, SPLIT-B still dey and di original candle no change.

Open Start dividend entitlement demo. ALPHA start with 100 shares and reach 120 when late report show. BETA use 40 shares. When later report correct ALPHA to 110 after pay, di ledger remove 3 USD. Go back to see di balance before di change.

For di universe demo, load Portfolio replay. BETA-001 close for 14:10 UTC show only when dem know am for 14:12. For 14:45, di 70 USD wey dem owe dey separate from 225 EUR for BETA-002 shares. For 14:50, share value and delisting cash add up to 284 USD.

Choose Compare charts and pick instrument for comparison. Link by UTC mark di same time wey dey show for both panes. Zoom each pane on im own. Workspace backup keep both instruments, overlays and link setting.

Choose Draw measurement and pick one existing UTC bar and price for each end. If you zoom or shift di chart, e go draw di same saved line again. Workspace backup keep di coordinates. Di app show time for seconds, how much price change and di percentage.

Open Indicators and set SMA and EMA periods as number of bars for each pane. If closing prices don reach, di chart go show values for di UTC bar you choose. Di periods remain when you change instrument, reload or restore workspace backup.

Open Export CSV under di chart. Download OHLCV bars to import again, or add source information and di moving averages wey dey on for research. Di averages stay blank until closing prices don reach.

Choose Close line for either pane. Di line use closing prices wey dey available, with volume and indicators wey dey on. If UTC bar no dey, linked crosshair no show for am. Workspace backup keep both chart types.

Choose OHLC bars. Di vertical line show high and low, di left mark show open and di right mark show close. Each pane keep im own chart type and di linked cursor follow di exact UTC bar.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md)

<!-- section:04 -->
## Import and replay data wey be your own

For Import CSV, enter market and symbol and choose UTF-8 OHLCV wey you get right to store. Use strictly increasing Unix seconds, UTC dates, or UTC timestamps with Z for end. Use up to six decimal places, volume wey no negative, and high and low wey cover open and close. One bad row stops the whole import. For Series details enter interval, source, usage right and adjustment rule.

Give each candle the start time. For Historical replay pick instrument, session CSV and complete seconds from 1 to 86,400. Put exact UTC boundaries, minute offset for open, and regular or early for every row. Grid starts at opening, and the last slot fit short. Candle outside session or grid no go enter. Gap moves clock and keeps the last observed value.

Default file limit na 1,500,000 bytes and 100,000 candles. Build settings fit go reach 8 MiB and 100,000 rows. Calendar allows 1 MiB, 10,000 segments wey no overlap, and 200,000 events. Browser storage quota dey separate.

```csv
time,open,high,low,close,volume
2025-11-28T14:30:00Z,10,12,9,11,200.000001
2025-11-28T15:00:00Z,11,13,10,12,150
```

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

[apps/terminal/README.md](../../apps/terminal/README.md) · [crates/core/README.md](../../crates/core/README.md)

<!-- section:05 -->
## Make backup, move am and restore

Workspace backup → Export workspace saves versioned JSON with original CSV, data source, visible and hidden history, watchlist order, choice and indicators. For the new profile choose Backup file, check the totals and press Restore workspace. One transaction replaces the target catalog. If you need the old target data, export am first.

Use the same scheme, host, port and profile for upgrade. The 0.1.0 workspace moves to IndexedDB, reads back to verify and keeps the original value. Close old tabs. Backup na plain text. SHA-256 checks integrity. Use the data permission to control storage, access and how long you keep am.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## How e build and how e calculate

Rust checks identity, UTC and OHLCV, calculates with integer millionths and builds the session events. React uses the same Wasm engine, Canvas for chart, IndexedDB transactions and service worker for cache. Revision numbers catch two writes wey race. Workspace belongs to profile and origin.

SMA uses exact rolling sum. EMA starts with the first full window and rounds each step to one millionth, away from zero if e tie. Replay uses only closes wey don show. Slot end na when complete candle fit appear. Real provider arrival, correction and inside-candle time need their own input. Original rows still dey intact.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Where and how to run am

Serve dist/ over HTTPS or use loopback launcher. Keep the same origin to keep workspace. Other port, profile or private window get different storage. To try Tauri, build web first and install the system requirements. CI builds for Windows Server 2022, macOS 15 and Ubuntu 24.04 and checks the Linux window. Check the platform list for mobile, ARM and BSD. Use desktop Chromium for acceptance tests.

The setup today na one local user for each profile. Keep data and copies on approved device. To get authentication, user separation, monitoring, retention and recovery targets, verify another deployment design. The ZIP gets license notices and CycloneDX SBOM. Release tag workflow fit attest the artifact.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Observe service wey dey outside

TradingBotObserverV1 reads runtime, status, account and portfolio from trading-bot wey you set up apart. Use origin wey you trust, HTTPS outside loopback and allowed token from process configuration. Check the time for each snapshot. Empty snapshot or healthy service no give extra balance or position. Credentials, orders and execution stay with the outside service.

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
});
const snapshot = await observer.account();
console.log(snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

[docs/trading-bot.md](../../docs/trading-bot.md) · [trading-bot](https://github.com/Yunushan/trading-bot)

<!-- section:09 -->
## Build and check from source

Use Node.js 22.12 or newer with npm, Rustup wey rust-toolchain.toml pins, and Python 3.11 or newer. Run from root of repo. Vite prints development URL, normally 5173. Production launcher uses 4173. Install the pinned Chromium before browser test.

Checks cover native Rust, Wasm, browser, SDK, local server, license, SBOM and advisories. After every event both averages match the correct front part of the batch result, including clock change, gap and early close. CI waits for the exact ZIP ID and compares the bytes after download. Release tag wey match version triggers attestation.

```sh
git clone https://github.com/Yunushan/marketweft.git
cd marketweft
npm ci
npm run dev
```

```sh
node scripts/build-wasm.mjs
npm run build
node scripts/serve-terminal.mjs
```

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
cargo test --workspace --locked
node --experimental-strip-types --test scripts/core-wasm.test.mjs
node --test scripts/serve-terminal.test.mjs
npx --no-install playwright install chromium
npm test
cargo fetch --locked --manifest-path apps/desktop/Cargo.toml
python -B scripts/test_supply_chain.py
python -B scripts/supply_chain.py --check
python -B scripts/check_readmes.py
npm audit --audit-level=high
python -B scripts/advisories.py
python -B scripts/package_browser.py
```

[verify.yml](../../.github/workflows/verify.yml) · [docs/native-advisories.md](../../docs/native-advisories.md)

<!-- section:10 -->
## Find problem and repeat am

If port busy, use --port 4174 and use export and restore to move data between origins. For offline trouble, open the production build online and wait for Offline ready. If data reject, check the row for error, start-time stamp and the exact calendar for market and dates.

Keep CSV, calendar, interval, Git revision, browser version and event time. For a report share a synthetic case and the first step wey fail. Verification record gets proof by platform and roadmap shows the next targets.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Repo, contribution and license

Engine and fixture dey crates/core, terminal and tests dey apps/terminal, desktop host dey apps/desktop, SDK dey packages/trading-bot and tools dey scripts. Make small changes with tests. Respect data rights and notices, update inventory when dependencies change and report security issue privately.

Original code uses 0BSD. Dependencies get their own licenses. Full guides follow Ethnologue 2026 by people wey speak as first or second language, including the two wey tie at rounded number 20. The app and linked technical manuals fit use English.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
