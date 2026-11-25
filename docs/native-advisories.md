# Native dependency review

## GLib 0.18 compatibility backport

The desktop GTK3 dependency graph uses GLib 0.18 through GTK, WebKitGTK and their Rust bindings. RustSec identifies `>=0.20.0` as patched. GTK 0.18 and WebKitGTK 2.0.2 require the 0.18 API. The browser terminal and financial core resolve independently of these libraries. [RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) · [Tauri migration tracking](https://github.com/tauri-apps/tauri/issues/12564)

The desktop workspace selects `apps/desktop/vendor/glib-0.18.5` through `[patch.crates-io]`. This directory contains the complete published crate, including its original MIT license, contributor notices and source-revision metadata. Of the 121 files, the sole modification is in `src/variant_iter.rs`. The Rust binding now passes a mutable out-parameter to the GLib function. This matches the upstream correction merged on March 30, 2024 and Debian's 0.18.5-7 backport. [Original crate archive](https://static.crates.io/crates/glib/glib-0.18.5.crate) · [gtk-rs correction](https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb) · [Debian patch 0007](https://sources.debian.org/patches/rust-glib-0.18/0.18.5-7/0007-glib-fix-UB-in-VariantStrIter-impl_get.patch/)

| Artifact | Identifier |
| --- | --- |
| Published crate archive SHA-256 | `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5` |
| Original crate source commit | `42b9caf98e03ded086362d9653ca58fe94dc8658` |
| Patched iterator file SHA-256 | `a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc` |
| Patched iterator Git blob, matching Debian | `e0997f651b103f7b198e528ee41137ad374e19b8` |
| Full patched source tree SHA-256 as computed by `scripts/desktop_backport.py` | `e8dbbd51b181d6ffc6d5e002bc28334a94760799a200181dedbfc263382076b1` |
| Initial desktop Cargo.lock SHA-256 | `44f2548eee161a3d866da78f4d1c6566dc27f744912f4360e140a2e06e94d17d` |
| Desktop Cargo.lock SHA-256 after applying this backport | `c2a6625ca10c5efa4e9eabe8531ecd00e95f0f796e84cc07b8bff330125a06df` |

### Verification and maintenance

An independent byte comparison on 2026-11-25 verified every file against the authenticated archive and patch. Cargo's locked Linux dependency tree resolved the single patched GLib copy. From the repository root, repeat the source comparison using a copy of the original archive and run the application consumer test on Linux with the desktop build prerequisites installed.

```sh
python apps/desktop/vendor/verify_glib.py /path/to/glib-0.18.5.crate
cargo tree --locked --manifest-path apps/desktop/Cargo.toml --target x86_64-unknown-linux-gnu -i glib
cargo test --locked --release --manifest-path apps/desktop/Cargo.toml --test glib_variant_iter
```

The test reads a valid UTF-8 string array in both directions through the library used by the application. The dependency gate requires the reviewed tree digest and the expected manifest and lockfile source. The OSV job also queries the original package and version, including after a path patch. The backport disposition covers the aliases RUSTSEC-2024-0429 and GHSA-wrw7-89jp-8q8g only.

The GTK3 bindings and this local backport remain a MarketWeft maintenance obligation. Recheck the parent dependency constraints and advisories with every native dependency update. When every GTK consumer can select a compatible upstream release carrying the correction, remove the vendored package and Cargo override, update the lockfile and supply-chain inventory, and rerun the optimized consumer test and native application smoke test.

## Other native maintenance notices

| Dependency | Scope | Follow-up |
| --- | --- | --- |
| `proc-macro-error 1.0.4` | GTK and GLib procedural macros use this unmaintained build dependency. | Track maintained replacements through the upstream macro crates. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0370.html) |
| `chrono 0.4.45` | The desktop lock includes an optional `serde_with` dependency. The default all-target feature tree at initial review did not activate it. | Recheck the feature graph on packaging changes. [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0543.html) |

The advisory job reports upstream records classified as unmaintained and fails on unresolved security findings. Native operating-system libraries and webview runtimes require independent patching and release qualification.
