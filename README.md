<!-- MarketWeft README · locale=en -->

# MarketWeft

**0.3.0 · 0BSD**

**Documentation languages**

**English** · [简体中文](docs/readme/README.zh-Hans.md) · [हिन्दी](docs/readme/README.hi.md) · [Español](docs/readme/README.es.md) · [العربية الفصحى](docs/readme/README.ar.md) · [Français](docs/readme/README.fr.md) · [বাংলা](docs/readme/README.bn.md)
[Português](docs/readme/README.pt.md) · [Bahasa Indonesia](docs/readme/README.id.md) · [اردو](docs/readme/README.ur.md) · [Русский](docs/readme/README.ru.md) · [Deutsch](docs/readme/README.de.md) · [日本語](docs/readme/README.ja.md) · [Naijá](docs/readme/README.pcm.md)
[العربي المصري](docs/readme/README.arz.md) · [मराठी](docs/readme/README.mr.md) · [Tiếng Việt](docs/readme/README.vi.md) · [తెలుగు](docs/readme/README.te.md) · [Kiswahili](docs/readme/README.sw.md) · [Hausa](docs/readme/README.ha.md) · [Türkçe](docs/readme/README.tr.md)

<!-- section:01 -->
## What MarketWeft does

MarketWeft is a local-first research terminal for analysts, developers and operators who need inspectable historical market data. The browser opens authorized OHLCV files, renders interactive candles and volume, calculates fixed-point SMA and EMA, and saves the watchlist, selected instrument and overlays in IndexedDB. The application works offline after its assets are cached. Its bundled prices and volumes are synthetic and require no provider account.

The 0.3.0 milestone adds session-aware historical replay over one immutable series. The repository also offers a separate read-only TypeScript observer for a trading-bot service and an experimental Tauri wrapper. Corporate actions, provider feeds, order entry, multi-user hosting and signed native installers remain roadmap work.

[ROADMAP.md](ROADMAP.md) · [docs/coverage.md](docs/coverage.md)

<!-- section:02 -->
## Start with the portable terminal

Open a successful GitHub verification run and download its browser-terminal-attempt-N artifact. Extract the enclosed MarketWeft-browser-0.3.0.zip, keep dist/ beside serve-terminal.mjs and run the following command in that directory. Open http://127.0.0.1:4173/ in a current browser with WebAssembly, Canvas, BigInt and IndexedDB. Node.js 22.12 or later runs the launcher. The portable package needs no npm installation. Wait for Offline ready before disconnecting.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](docs/platforms.md)

<!-- section:03 -->
## Replay the NYSE example

Open Historical replay, choose Start demo, and step through events or use Play and Pause. Previous event rewinds one event. Reset clears the visible prefix. The chart starts empty and reveals each candle at its scheduled interval end. Event time identifies the interval start or session boundary. Observed at shows when the event becomes available. The playback speed controls wall-clock presentation only.

Compare October 31, 2025 at 13:30 UTC (UTC−04:00) with November 3 at 14:30 UTC (UTC−05:00). The omitted November 3 interval starts at 15:00 and is reported missing at 15:30. Thanksgiving closure emits no slots, and November 28 ends at 18:00 UTC after seven 30-minute candles. The demo contains 20 sessions, 253 observed candles and 294 events. Its prices and volumes are synthetic and the calendar uses published NYSE core-hours facts.

[docs/historical-replay.md](docs/historical-replay.md) · [replay-sessions.csv](crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
