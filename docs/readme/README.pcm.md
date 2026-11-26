<!-- MarketWeft README · locale=pcm -->

# MarketWeft

**0.5.0 · 0BSD**

**Language dem for dis guide**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · **Naijá**
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Wetin MarketWeft dey do

MarketWeft na research terminal wey dey work for your own device. Analyst, developer and operator fit load OHLCV file wey dem get right to use, see candle and volume, calculate SMA and EMA with fixed decimal, and save watchlist, instrument and indicator for IndexedDB. E fit work offline after e cache the files. The price and volume wey follow am na synthetic, so provider account no dey needed.

MarketWeft 0.5.0 adds cash dividend wey follow information available for each replay time, together with stock split for session replay. The repo get separate read-only TypeScript SDK for trading-bot and experimental Tauri host. Spin-off, data feed, orders, hosting for many users and signed installer dey roadmap.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Start the portable terminal

Download browser-terminal-attempt-N from GitHub verification wey pass. Extract MarketWeft-browser-0.5.0.zip, leave dist/ beside serve-terminal.mjs and run the command inside that folder. Open http://127.0.0.1:4173/ for current browser wey get WebAssembly, Canvas, BigInt and IndexedDB. Use Node.js 22.12 or newer. You no need install npm for the ZIP. Wait for Offline ready before you off network.

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

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv)

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
