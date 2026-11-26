<!-- MarketWeft README · locale=en -->

# MarketWeft

**0.34.0 · 0BSD**

**Documentation languages**

**English** · [简体中文](docs/readme/README.zh-Hans.md) · [हिन्दी](docs/readme/README.hi.md) · [Español](docs/readme/README.es.md) · [العربية الفصحى](docs/readme/README.ar.md) · [Français](docs/readme/README.fr.md) · [বাংলা](docs/readme/README.bn.md)
[Português](docs/readme/README.pt.md) · [Bahasa Indonesia](docs/readme/README.id.md) · [اردو](docs/readme/README.ur.md) · [Русский](docs/readme/README.ru.md) · [Deutsch](docs/readme/README.de.md) · [日本語](docs/readme/README.ja.md) · [Naijá](docs/readme/README.pcm.md)
[العربي المصري](docs/readme/README.arz.md) · [मराठी](docs/readme/README.mr.md) · [Tiếng Việt](docs/readme/README.vi.md) · [తెలుగు](docs/readme/README.te.md) · [Kiswahili](docs/readme/README.sw.md) · [Hausa](docs/readme/README.ha.md) · [Türkçe](docs/readme/README.tr.md)

<!-- section:01 -->
## What MarketWeft does

MarketWeft is a local-first research terminal for analysts, developers and operators who need inspectable historical market data. The browser opens authorized OHLCV files, renders interactive candles and volume, calculates fixed-point SMA and EMA, and saves the watchlist, selected instrument and overlays in IndexedDB. The application works offline after its assets are cached. Its bundled prices and volumes are synthetic and require no provider account.

MarketWeft 0.34.0 builds volume and time-price opportunity profiles from observed trades. MarketWeft 0.7.0 adds point-in-time universe screening by price return. Session-aware replay includes stock splits, cash dividends, membership and delistings. The repository also includes a read-only TypeScript observer for a separate trading-bot service and an experimental Tauri wrapper. Provider feeds, order entry, signed native installers and multi-user hosting remain roadmap work.

[ROADMAP.md](ROADMAP.md) · [docs/coverage.md](docs/coverage.md)

<!-- section:02 -->
## Start with the portable terminal

Open a successful GitHub verification run and download its browser-terminal-attempt-N artifact. Extract the enclosed MarketWeft-browser-0.34.0.zip, keep dist/ beside serve-terminal.mjs and run the following command in that directory. Open http://127.0.0.1:4173/ in a current browser with WebAssembly, Canvas, BigInt and IndexedDB. Node.js 22.12 or later runs the launcher. The portable package needs no npm installation. Wait for Offline ready before disconnecting.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](docs/platforms.md)

<!-- section:03 -->
## Replay the NYSE example

Open Historical replay, choose Start demo, and step through events or use Play and Pause. Previous event rewinds one event. Reset clears the visible prefix. The chart starts empty and reveals each candle at its scheduled interval end. Event time identifies the interval start or session boundary. Observed at shows when the event becomes available. The playback speed controls wall-clock presentation only.

Compare October 31, 2025 at 13:30 UTC (UTC−04:00) with November 3 at 14:30 UTC (UTC−05:00). The omitted November 3 interval starts at 15:00 and is reported missing at 15:30. Thanksgiving closure emits no slots, and November 28 ends at 18:00 UTC after seven 30-minute candles. The demo contains 20 sessions, 253 observed candles and 294 events. Its prices and volumes are synthetic and the calendar uses published NYSE core-hours facts.

For corporate actions, open Historical replay → Start split demo and switch Price basis between Raw and Split-adjusted at the same event. The 2-for-1 action is announced and observed before it takes effect. Both views agree beforehand. At the effective time the last pre-split close changes from 106.50 raw to 53.25 adjusted, with volume doubling. The first post-split bar stays at 53.00. For your own replay, upload a Corporate actions CSV for the selected instrument, confirm raw OHLCV and provide the session calendar. The latest observed ratio applies once effective. Late reports and corrections only change the view from their observation time. The source history remains intact.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Open Historical replay → Start dividend demo to follow 100 entitled shares. The ex-date creates a USD 25.00 receivable. A revised amount raises it to USD 30.00 and the revised pay date moves the credit. A late EUR report credits EUR 10.00 at observation, and a post-payment correction leaves USD 28.00. Rewind to inspect earlier balances. To use your data, upload Cash dividends CSV and enter Entitled shares per distribution. Keep the same distribution ID across revisions. The ledger keeps currencies separate, preserves earlier postings and leaves source prices intact.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Open Historical replay → Open universe replay → Start universe demo. At 14:05 UTC only ALFA is a member, and at 14:10 BETA joins. ALFA’s 14:20 removal becomes visible at 14:25. BETA’s 14:30 delisting becomes visible at 14:35. Step back to recover earlier membership or run an as-of query with independent Effective time and Known time cutoffs. Upload a Universe membership CSV for your own history. Use stable change IDs for revisions and distinct listing IDs when a ticker is reused.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

In Universe screen choose Load demo prices and keep the 14:00 UTC baseline. At 14:05 ALFA leads at 1%. At 14:10 BETA joins and stays unranked until its close becomes known at 14:12. Query effective 14:10 with known time 14:12, then 14:16, to compare BETA’s 12% and revised 1% return. At effective 14:20 ALFA drops out when its removal is known at 14:25. Upload a Universe prices CSV keyed by listing ID to run the same test with your own exact-time closes. A missing baseline or target leaves a member unranked.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

After loading the demo prices, choose Load demo sectors in Sector heatmap. At 14:10 UTC the heatmap covers 60% of known weight. When BETA’s price becomes known at 14:12, coverage rises to 100% and observed contribution rises from 1.2% to 6%. At 14:16 BETA moves from Financials to Technology after the sector revision. Open a tile for rank, contribution and classification timestamps. Upload a Sector and weight CSV for your own reports.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Open Historical replay → Open financial statements → Start financial demo. Choose Original filing for 10× P/E. At the same valuation time, Restatement observed raises P/E to 15× and shows missing common equity. Revised capitalization raises P/E to 20×. Upload an Annual filings CSV and an optional Capitalization CSV to query your own issuer and knowledge cutoff.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Open Historical replay → Open economic calendar → Start calendar demo. Before release, the forecast is 2.5 percent and the actual is unavailable. Actual observed shows 2.7 percent at 14:32 UTC. Revised actual shows 2.8 percent and the two revisions remain traceable in Release evidence. Upload a Macro calendar CSV to use your own dated releases.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Open Historical replay → Open option chain → Start option demo. The April 100-strike pair starts near 20% IV. Late option quote reveals the 90-strike call at 25% IV, and Corrected spread resolves an unavailable put. Open Implied volatility surface to compare maturities. Load Underlying CSV and Option quotes CSV to use your own dated quotes.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Open Historical replay → Open replay alerts → Start alert demo. First crossing shows one threshold alert. Correction observed shows the revised sample and its moving-average crossing. Full alert replay shows eight alerts. Save to alert inbox twice to verify eight saved records and zero new ones on the second save. Load Alert rules CSV and Alert observations CSV for your own data.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Open Historical replay → Open paper ledger → Start paper demo. Step from a 503 cash reserve through a unique partial fill that leaves 801.6 cash. Final account shows 663.7 cash and 13 realized profit after the later halt. Use Paper events CSV to replay your own simulated orders, fills and controls.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Open Historical replay → Open bar backtest → Start backtest demo. The 14:05 UTC signal places a buy order. The missing interval at 14:06 leaves it unfilled. The 14:07 close provides liquidity for two shares. Final backtest reports equity of 957.8. Use the session and bar CSVs to run the same strategy on local history.

In the bar backtest demo, run Walk-forward validation with the default six training bars and two test bars. The first complete fold appears at 14:09 UTC. Pair 1:2 wins the training search and stays fixed for both test bars, which start with a fresh account.

In the bar backtest demo, run Seeded scenarios with seed 20250403, 256 paths and eight moves per path. Baseline ending equity is 957.8 and median scenario ending equity is 997.6. The same cutoff, input and seed reproduce the risk table.

In the universe demo, load Delisting proceeds for BETA-001 and set both cutoffs to 14:35 UTC to see missing proceeds. At 14:37, ten shares give a 70 USD receivable. At 14:50, the cash ledger first posts 70 USD. Later corrections preserve earlier cutoffs and keep BETA-002 separate.

Open Start split revisions demo and choose Split-adjusted. On June 3 at 14:10 UTC, the revised effective time withdraws the old adjustment. At 14:20 two IDs compound. Canceling SPLIT-A at 14:30 preserves SPLIT-B and leaves the raw candles intact.

Open Start dividend entitlement demo. ALPHA starts with 100 entitled shares and rises to 120 when a late report arrives. BETA uses 40 shares. A later correction to 110 ALPHA shares reverses 3 USD after pay. Rewind to see the earlier balance.

In the universe demo, load Portfolio replay. BETA-001’s 14:10 UTC close appears only at the 14:12 knowledge cutoff. At 14:45 its 70 USD receivable is separate from BETA-002’s 225 EUR share value. At 14:50, USD share value and delisting cash total 284.

Choose Compare charts and select a comparison instrument. Link by UTC highlights the same visible timestamp in both panes. Zoom each pane independently. Workspace backup preserves both instruments, overlays and the link setting.

Choose Draw measurement and select an existing UTC bar and price for each endpoint. Zoom and pan to see the chart reproject the same stored line. The workspace backup keeps its coordinates and the app reports elapsed seconds, price change and percent change.

Open Indicators and set the SMA and EMA periods in bars for each pane. The chart shows the values for the selected UTC bar once enough closes are available. The periods carry across instruments, reloads and workspace backups.

Open Export CSV beneath a chart. Download OHLCV bars for reimport or include provenance and the enabled moving averages for research. Averages remain blank until enough closes are available.

Choose Close line in either pane's chart-type control. The line uses observed closes and keeps the volume chart and enabled indicators. An unobserved UTC bar has no linked crosshair. Workspace backups preserve the selected chart types.

Choose OHLC bars to see the high and low on a vertical stem, the open on the left and the close on the right. Each pane keeps its own chart type, and the linked cursor still follows exact UTC bars.

Open Timeframe in either pane and enter the source and target intervals in seconds. The chart and research CSV show observed source coverage. Workspace backups retain the original series.

Add a session calendar CSV in Timeframe to start each target bucket from the dated session open. The final bucket stops at the listed close, and research CSV records the calendar and source coverage.

Open Recorded tick bars and choose a trade count and observation cutoff. The chart keeps capture order for equal timestamps, identifies incomplete bars, and exports their exact sequence boundaries.

In Portfolio replay, load the dividend income demo or add a portfolio dividends CSV. The query uses holdings before the ex date, settles at the pay date, and applies later revisions at their observation times.

In Universe screen, expand Relative returns after loading prices. Pick two listing IDs and an exact UTC baseline. Use the universe cutoffs to replay missing closes and revisions, then download the complete comparison as CSV.

Open Recorded market depth and load a depth CSV for the selected instrument. Step through observation cutoffs to inspect the bid and ask ladder, a sequence gap, and recovery at the next snapshot. Download all levels as CSV.

Open Recorded footprint and load the selected instrument's trades. Set the execution window and knowledge cutoff to inspect buy, sell and unknown volume by price bin. Download the full footprint and cumulative delta as CSV.

In Recorded footprint, expand Price profiles after running a query. Compare volume by price with the number of time brackets that traded at each price. Set a value-area target and download the full profiles as CSV.

[docs/historical-replay.md](docs/historical-replay.md) · [replay-sessions.csv](crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](docs/corporate-actions.md) · [split-actions.csv](crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](docs/cash-dividends.md) · [cash-dividends.csv](crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](docs/universe-membership.md) · [universe-membership.csv](crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](docs/universe-screen.md) · [universe-prices.csv](crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](docs/sector-heatmap.md) · [universe-sectors.csv](crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](docs/financial-statements.md) · [financial-filings.csv](crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](docs/macro-calendar.md) · [macro-calendar.csv](crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](docs/option-chain.md) · [option-underlying.csv](crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](docs/replay-alerts.md) · [alert-rules.csv](crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](docs/paper-ledger.md) · [paper-events.csv](crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](docs/bar-backtest.md) · [backtest-sessions.csv](crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](docs/walk-forward.md) · [seeded-scenarios.md](docs/seeded-scenarios.md) · [delisting-proceeds.md](docs/delisting-proceeds.md) · [split-revisions.csv](crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](docs/portfolio-replay.md) · [portfolio-holdings.csv](crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](docs/chart-workspace.md) · [relative-returns.md](docs/relative-returns.md) · [recorded-depth.md](docs/recorded-depth.md) · [recorded-footprint.md](docs/recorded-footprint.md) · [price-profiles.md](docs/price-profiles.md)

<!-- section:04 -->
## Import and replay your own data

Choose Import CSV, enter a venue and symbol, and select UTF-8 OHLCV data you are entitled to store. Supply increasing UTC Unix seconds, UTC dates or UTC timestamps ending in Z. Use at most six decimal places, nonnegative volume, and high and low values that enclose open and close. One invalid row rejects the import. Enter the interval, source, usage grant and adjustment policy under Series details.

For replay, label bars by interval start. Open Historical replay, select the imported instrument, add a calendar CSV and enter the interval in whole seconds (1–86,400). Write exact UTC opens and closes, the offset at open in minutes, and regular or early in each calendar row. The opening anchors the grid. A short final slot ends at the scheduled close. Out-of-session and off-grid bars are rejected. Missing in-session slots advance time and preserve the previous bar and indicators.

The default browser import limit is 1,500,000 bytes and 100,000 bars per file. Deployments can change the limit at build time up to 8 MiB and 100,000 rows. The replay calendar accepts 1 MiB, 10,000 nonoverlapping segments and 200,000 replay events. Browser storage quotas apply separately.

```csv
time,open,high,low,close,volume
2025-11-28T14:30:00Z,10,12,9,11,200.000001
2025-11-28T15:00:00Z,11,13,10,12,150
```

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

[apps/terminal/README.md](apps/terminal/README.md) · [crates/core/README.md](crates/core/README.md)

<!-- section:05 -->
## Back up, migrate and recover

Choose Workspace backup → Export workspace to save a versioned JSON bundle with original CSV text, provenance, hidden and visible histories, watchlist order, selection and overlay settings. On the target profile choose Backup file, review the verified counts and use Restore workspace. Restore replaces the destination catalog in one transaction. Export the destination first if it must be retained.

Serve an upgrade on the same scheme, host and port in the same browser profile. Version 0.1.0 workspaces migrate into IndexedDB with a verification readback and preservation of the original storage value. Close tabs still running the older app. Backups contain plaintext. SHA-256 verifies data integrity and callers control storage, access and retention according to the data grant.

[docs/workspace-backup.md](docs/workspace-backup.md) · [SECURITY.md](SECURITY.md)

<!-- section:06 -->
## Architecture and numerical contract

The Rust core validates identity, UTC dates and OHLCV, performs fixed-point calculations in integer millionths, and builds the session event plan. The same code compiles to Wasm for the React terminal. The browser uses Canvas for charts, IndexedDB transactions for committed history, and a service worker for static assets. Workspace revisions detect concurrent writes. Chart and replay state are scoped to the local profile and origin.

SMA uses an exact rolling sum. EMA seeds from the first full window and rounds each step to one millionth, with ties away from zero. Replay shows the indicator prefix of revealed closes across session boundaries and gaps. Scheduled slot end supplies historical availability. Provider arrival, revisions and intrabar times need separate input. Workspace source rows are immutable during replay.

[docs/adr/0002-transactional-history.md](docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Deployment and operating scope

Serve dist/ on HTTPS with current browser APIs or use the loopback launcher. Preserve an origin to preserve its local workspace. A different port, profile or private window opens a different storage context. For native evaluation, build the terminal first, install the Tauri system prerequisites, then run the desktop command. Hosted CI builds Windows Server 2022, macOS 15 and Ubuntu 24.04 and smokes the Linux window. Mobile, ARM and BSD support is tracked by target. Use desktop Chromium when reproducing the acceptance suite.

The current operating model is one local user per profile. Keep imported data and backups on approved devices. Hostnames, authentication, tenancy, monitoring, retention and recovery objectives belong in a separately validated deployment design. The supplied browser ZIP includes license notices and a runtime CycloneDX SBOM. The release-tag workflow includes artifact attestation.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](docs/dependencies.cdx.json)

<!-- section:08 -->
## Observe an external service

The independent TradingBotObserverV1 SDK can read runtime, status, account and portfolio from a separately configured trading-bot service. Use a trusted service origin, HTTPS outside loopback, and inject an authorized token via trusted process configuration. Interpret each observation using its own timestamp. An empty account snapshot or healthy service status conveys no additional data about balances or positions. Broker credentials, order control and execution remain with the independently operated upstream service.

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
});
const snapshot = await observer.account();
console.log(snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

[docs/trading-bot.md](docs/trading-bot.md) · [trading-bot](https://github.com/Yunushan/trading-bot)

<!-- section:09 -->
## Build and verify from source

Use npm with Node.js 22.12 or later, Rustup with the toolchain pinned in rust-toolchain.toml, and Python 3.11 or later for packaging and license checks. Run from the repository root. Development uses the Vite URL printed by npm run dev, usually port 5173. Production uses the built assets served at port 4173. Install the locked Chromium build before running browser acceptance.

The verification suite covers native Rust, the compiled Wasm bridge, browser and SDK flows, loopback serving, dependency licensing, SBOM and advisories. Replay checks both averages against their batch prefixes after every event, including the DST transition, missing interval and early close. CI uploads the tested ZIP, waits for its exact artifact ID and verifies the downloaded bytes. Only matching release tags trigger attestation.

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

[verify.yml](.github/workflows/verify.yml) · [docs/native-advisories.md](docs/native-advisories.md)

<!-- section:10 -->
## Troubleshoot and reproduce

If localhost is busy, pass --port 4174 to the launcher. That port starts a different browser workspace, so use export and restore to move data between origins. If offline startup fails, first reopen the production build online and wait for Offline ready. If an import or replay is rejected, check the row named in the error, confirm interval-start timestamps and use the exact session calendar for the source venue and dates.

Preserve the source CSV and calendar, interval, MarketWeft Git revision, browser version and event timestamp for replay evidence. Report UI or build issues with an appropriate synthetic case and the first failing command or step. The verification record captures platform-specific evidence and the roadmap lists the next acceptance targets.

[docs/verification.md](docs/verification.md) · [ROADMAP.md](ROADMAP.md)

<!-- section:11 -->
## Repository, contributions and license

The Rust engine and fixtures live in crates/core, the browser and its tests in apps/terminal, the native host in apps/desktop, and the observation SDK in packages/trading-bot. Build, policy and packaging commands live in scripts. Keep changes small and backed by tests. Preserve source data rights and third-party notices, regenerate the locked inventory after dependency changes and report vulnerabilities privately.

MarketWeft’s original code uses the 0BSD license. Dependencies retain their own licenses. The README is published in the most widely spoken languages by total first- and second-language speakers from the 2026 Ethnologue ranking, with both languages shown at the rounded twentieth-place tie. The translations cover this entire README. Linked technical manuals and the application interface may use English.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) · [0BSD](LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
