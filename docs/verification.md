# Initial milestone verification · 2026-11-25

## Browser and core

| Check | Observed result |
| --- | --- |
| Native Rust · Windows x64 and Debian 12 x64 | Six integration tests passed on each host, including fixed-point golden values, generated differential and prefix tests, UTC dates, identity, signed rounding and rejected imports. |
| Rust static checks | Workspace formatting and Clippy passed on Windows x64. Clippy also passed for the Wasm target with warnings treated as errors. |
| Compiled WebAssembly | Three Node integration tests passed, including a 100,000-bar import. Rebuilding in a fresh target directory with Rust 1.99.1 produced the same 39,413-byte module, SHA-256 `c18d40b49114abec2650aaf1415a4f3e696b6d9d4e5e21c24fda2999d7b505c5`. |
| Browser application | After a fresh `npm ci`, ten production Playwright tests passed with Chrome 158.0.8127.38 on Windows x64. Cases covered rendering actual candles and an SMA line, panning, zoom, crosshair inspection, invalid and valid imports, watchlist/overlay persistence, six-decimal prices and volume, offline reload, a 360px viewport, damaged workspace recovery, stale write detection and configurable import limits. |
| Quick-start launcher | Four Node tests passed, covering both ZIP and source layouts, loopback serving, asset MIME types, and the boundary around public assets. |
| Extracted browser ZIP | Launched the shipping server from a clean extraction. Chrome displayed the chart, installed its offline cache and imported the included reference CSV. The last close was 15.00 before and after an offline reload. No page errors were recorded. |
| Package reproducibility | Packaging the same built assets twice produced SHA-256 `7f26c963fa4dfd8f09d93a791e97c63cc0a6942d9ef11db25f3172fe5d053328`. This tests local archive reproducibility. |
| Dependency checks | The inventory comprises 489 external package versions across the locks, including the native backport and optional targets. Two license-expression tests passed. npm audit reported zero known vulnerabilities. OSV queried 432 native package versions, confirmed the reviewed backport for the two aliases of one GLib advisory, and reported two maintenance warnings. [Native dependency review](native-advisories.md). |
| trading-bot SDK | Six SDK tests passed. Two additional scenarios called all four real FastAPI routes on a pinned upstream checkout inside an isolated Linux container. They distinguished an empty standalone process from timestamped, synthetic account and position snapshots. See [endpoints, commit and reproduction](trading-bot.md). |

## Desktop and benchmarks

A Debian GNU/Linux 12 x86_64 developer build completed with GTK 3.24.38, WebKitGTK 2.50.6, Rust 1.100.0 and Tauri 2.12.7. In an unprivileged Xvfb/D-Bus session the native MarketWeft window exposed the chart, instrument rows, import and overlay controls through AT-SPI. Windows Application Control rejected unsigned dependency build executables (error 4551), including on a permitted retry. This limits the local Windows native claim independently of the successful Windows browser and Rust tests.

| Workload | Debian x64 native | Windows x64 Node/Wasm |
| --- | ---: | ---: |
| Parse 100,000 CSV bars | 27.37 ms | 62.06 ms |
| Compute SMA(20), 100,000 closes | 1.11 ms | 24.88 ms |
| Compute EMA(20), 100,000 closes | 1.17 ms | 23.92 ms |

Each figure is a mean across ten warm passes from one run. Browser-facing Wasm timings include JavaScript data transfer and result creation. Native Windows benchmark execution was blocked by Application Control. These measurements establish a baseline, not a service-level target.

## Production readiness and recovery

- **Local research.** The existing data paths are generated histories, entitled user files and a separately configured trading-bot observer. Import checks and fixed-point calculations have release fixtures. There is no real-money or simulated order-entry path. Exchange sessions, corporate actions, feed entitlements for remote providers and point-in-time financial statements are backlog requirements.
- **Storage.** Each accepted import is persisted in the current browser origin. Quota failures are surfaced. On damaged storage the terminal salvages readable imports and preserves raw state under `marketweft.workspace.v1.recovery.N` before a later save. Retain original CSV files outside the profile. After a lost profile, relaunch on the same origin and re-import those files. Validated full-workspace export and restore is the next milestone.
- **Distribution.** Static assets contain npm notices and the Rust standard-library notices. The ZIP also contains a runtime SBOM. The repository SBOM covers the full npm and Cargo locks. CI defines provenance attestation for version-matched browser release tags. Local ZIPs have a digest and have not received a release signature. Native signing and notarization remain future work.
- **Deployment.** The loopback launcher is usable by one local operator. Authentication, authorization, audit retention, key storage, high availability, a recovery-time objective and restore drills are required before multi-tenant hosting. Installed PWA behavior and mobile/BSD native targets need device-specific evidence.

The [roadmap](../ROADMAP.md) gives the next executable milestone and the [coverage matrix](coverage.md) associates the longer-term requirements with acceptance tests.

