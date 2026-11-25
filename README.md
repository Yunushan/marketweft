# MarketWeft

MarketWeft is an offline-capable financial research terminal. Open a local OHLCV history, pan and zoom through candles and volume, compare SMA and EMA overlays, and reopen the same watchlist after a reload. The browser and native Rust tests use the same fixed-point calculation engine. Initial prices are clearly labeled, deterministic synthetic examples. No provider account is required.

## Run the prebuilt terminal

Extract the **entire browser ZIP**. From the extracted directory run:

```sh
node serve-terminal.mjs
```

Open <http://127.0.0.1:4173/>. This requires Node.js 22.12+ and a current browser with WebAssembly, Canvas and BigInt support. The ZIP includes static assets and a sample CSV. There is no package installation step. Any ordinary HTTPS static host can also serve the contents of `dist/`. After the first successful load, **Offline ready** means the service worker has cached the application for that browser origin.

## Run from source

Use Node 22.12+ and npm. Development and acceptance testing used Node 26.8.2. Run commands from the repository root.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite, normally <http://127.0.0.1:5173/>. To use the production offline build:

```sh
npm run build
node scripts/serve-terminal.mjs
```

The checked-in Wasm module lets browser users build without a Rust toolchain. To rebuild it from the pinned Rust source:

```sh
rustup show active-toolchain
node scripts/build-wasm.mjs
```

A Rustup installation reads the version and Wasm target in `rust-toolchain.toml`. To launch the experimental desktop wrapper, build the web assets, install Tauri's platform prerequisites and run `cargo run --locked --manifest-path apps/desktop/Cargo.toml`. See the [platform matrix](docs/platforms.md) and [native advisory review](docs/native-advisories.md) for release constraints. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Try an import

Choose **Import CSV**, enter a venue and symbol such as **LOCAL** and **DEMO**, then select a UTF-8 file. An invalid row rejects the import. The full sample in `crates/core/tests/fixtures/reference.csv` doubles as a numerical test fixture.

```csv
time,open,high,low,close,volume
2025-01-02,10,12,9,11,200
2025-01-03,11,13,10,12,150
```

Use strictly increasing UTC seconds, UTC dates or UTC timestamps ending in Z. Prices and volumes accept up to six decimal places. The browser defaults to 1,500,000 bytes and 100,000 bars per file. Deployments can set lower limits or raise the byte limit to the core's 8 MiB maximum. Browser storage quotas can further limit an import. Imported history and watchlists live in this browser profile, at this origin. Keep original CSV files for recovery. Opening another port, using private browsing or clearing site data changes which workspace you can see. [Deployment settings](apps/terminal/README.md) · [Data contract and numerical rules](crates/core/README.md).

## Verify the milestone

```sh
cargo test --workspace --locked
node --experimental-strip-types --test scripts/core-wasm.test.mjs
node --test scripts/serve-terminal.test.mjs
npx --no-install playwright install chromium
npm test
cargo fetch --locked --manifest-path apps/desktop/Cargo.toml
python -B scripts/test_supply_chain.py
python -B scripts/supply_chain.py --check
npm audit --audit-level=high
python -B scripts/advisories.py
```

Python checks require Python 3.11+. Linux CI also installs Playwright's system dependencies. The native advisory command currently reports open upstream findings. The two benchmark commands are `cargo bench --locked --bench history` and `node --experimental-strip-types scripts/bench-wasm.mjs`. After building the web workspace, `python scripts/package_browser.py` writes a portable browser ZIP under `reports/`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `crates/core` | Instrument identity, UTC OHLCV parser, fixed-point arithmetic, Wasm ABI and benchmarks |
| `apps/terminal` | React/TypeScript terminal, Canvas chart, browser storage, PWA and Playwright acceptance tests |
| `packages/trading-bot` | Independent read-only SDK for the versioned upstream API |
| `apps/desktop` | Optional Tauri host for the same static application |
| `scripts` | Build, local serving, packaging, license inventory and dependency checks |

The observation SDK can read a separately running trading-bot service. There is no broker order path in this milestone. Paper simulation is the first execution target. [SDK example and upstream evidence](docs/trading-bot.md).

[Feature coverage](docs/coverage.md) · [Development roadmap](ROADMAP.md) · [Primary-source competitor inventory](docs/references.md) · [Verification and handoff](docs/verification.md) · [Dependency SBOM](docs/dependencies.cdx.json) · [Third-party notices](THIRD_PARTY_NOTICES) · [0BSD license](LICENSE)

