# Native dependency review · 2026-11-25

The OSV query in scripts/advisories.py examined all 432 crates.io versions in the initial desktop lockfile, SHA-256 `44f2548eee161a3d866da78f4d1c6566dc27f744912f4360e140a2e06e94d17d`. The core lockfile, SHA-256 `417fb59d13a13eb11f4ab65923cbdb85efc4ce263edafc406e87a9307316e86d`, contains zero registry packages. These were local source checks of the initial working tree. No native artifact has been released.

| Dependency | Scope and finding | Resolution gate |
| --- | --- | --- |
| glib 0.18.5 | Linux GTK3 and WebKitGTK branches of Tauri 2.12.7, including gtk 0.18.2 and webkit2gtk 2.0.2, use this crate. RUSTSEC-2024-0429 and GHSA-wrw7-89jp-8q8g identify the same iterator soundness issue. | Upstream's fixed version starts at 0.20.0, outside GTK3's 0.18 version constraint. A normal lockfile update cannot select it. Require a compatible dependency transition or a reviewed, regression-tested backport before native Linux release. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0429.html), [Tauri tracking issue](https://github.com/tauri-apps/tauri/issues/12564). |
| proc-macro-error 1.0.4 | The Linux GTK build pulls this unmaintained procedural macro helper through gtk3-macros and glib-macros. | Upgrade the parent macros to versions using a maintained replacement. There is no upstream patched version. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0370.html). |
| chrono 0.4.45 | The desktop lock includes this optional serde_with dependency. The default-feature Cargo dependency tree for all targets did not activate it. The advisory concerns maintenance. | Recheck feature selection on each packaging target. Remove the optional lock entry when upstream stops resolving it. [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0543.html). |

The native advisory job intentionally exits nonzero while a locked package has an open advisory. The browser build and its tests run independently. The milestone has no standing waiver. Third-party OS runtimes and browser engines require separate maintenance.
