# MarketWeft verification

## 0.2.0 · Transactional history and workspace recovery

| Check | Observed result |
| --- | --- |
| Upgrade from the distributed 0.1.0 ZIP | Imported two histories through the previous terminal, hid one from the watchlist, selected the other and enabled EMA only. Opening 0.2.0 on the same origin upgraded the active service worker and migrated both histories. Chrome retained the original v1 storage value byte for byte. |
| Recovery without a network connection | Exported the upgraded workspace, installed the new terminal in a separate browser context and disconnected it before restoring. The recovered workspace matched all 25 timestamps and all 125 six-place OHLCV values, both instrument identities, watchlist membership, selection and overlay settings. Chrome reported zero page errors. |
| Migration failure and retry | Browser tests interrupt an IndexedDB transaction, change the legacy workspace while migration is in progress, deny legacy storage access and present orphaned records or an unknown schema. The terminal preserves the source and reports the failure. A retry after an interrupted migration succeeds. |
| Restore and concurrency | Tests cover altered digests, inconsistent counts or identifiers, invalid CSV, stale previews in another tab and an abort after writes have begun. Each rejected replacement leaves the prior catalog intact. A Chrome quota override applied before the database is opened exercises an actual out-of-quota write and verifies the committed workspace after reload. |
| Portable format | A separate Node implementation recalculates sample, manifest and series digests. A clean-profile restore compares integer timestamps and fixed-point OHLCV values, including negative prices and six-decimal volumes, and the imported metadata and preferences. |
| Chart after replacement | Two open tabs displayed a three-bar instrument. A restore replaced it with one bar under the same instrument ID while the second tab's crosshair was on the third bar. Both tabs immediately displayed the new one-bar chart and close, without a page error. |
| Local regression suite | A clean install with TypeScript 7.0.2 passed 22 production Chrome tests and six SDK tests on Windows x64. Six native Rust tests, three Wasm tests, four launcher tests, two dependency-policy tests, Rust formatting and native/Wasm Clippy also passed. |
| Dependencies | The license and SBOM gate verified 509 locked external package versions. npm audit reported zero known vulnerabilities. The native advisory check queried 432 Cargo package versions, verified the GLib backport and reported two upstream maintenance notices. [Native dependency review](native-advisories.md). |
| Portable distribution | Two local packaging runs produced identical 157,064-byte ZIPs with SHA-256 `d86880d878a888d0c1d054f5ff02e859d8ed5437a520a1cf41a388ca1a6be029`. The final drill ran each version's own launcher from its extracted ZIP and checked the embedded 0.2.0 SBOM and Wasm digest. |

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

