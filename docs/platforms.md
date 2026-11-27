# Platform support · MarketWeft 0.168.0

A successful web test validates a specific browser, build and host. Producing a native artifact and validating installation, launch, upgrades and normal operation on its target are separate release gates. Operating system signing and notarization are tracked per platform.

| Target | Current route / available evidence | Required for official native or operational support |
| --- | --- | --- |
| Browser / installable PWA | Static React app with a Wasm core. Windows x64 Chromium-family automation, responsive viewport and offline reload. | Browser-engine and device matrix, install/update tests and storage lifecycle acceptance. |
| Windows x64 | Browser route and a per-user installer with native WebView2 CSV import on hosted Windows Server 2022. | Client Windows installation, upgrade and Authenticode verification. |
| Windows ARM64 | Per-user installer, installed release startup, native WebView2 CSV import in an installed test build and Python research SDK on hosted Windows 11 ARM64. | Upgrade and Authenticode verification. |
| macOS Apple Silicon / Intel | Browser route and macOS 15 hosted Tauri builds with native Mach-O, Python research SDK and WKWebView CSV import checks for both architectures. | Native file-picker interaction, sandbox, signing and notarization on actual hosts. |
| Linux x64 | Ubuntu 24.04 x64 package installation and native CSV import. Debian 12 native window and chart rendering observed through AT-SPI. See [verification](verification.md) and the [advisory review](native-advisories.md). | Broader upgrade coverage, continued backport maintenance and validation on other supported distributions. |
| Linux ARM64 | Browser route and Ubuntu 24.04 ARM64 package installation, native X11 launch and CSV import smoke test. | Broader upgrade coverage and validation on other supported distributions. |
| Android | Responsive browser path. Phone-sized desktop viewport tested. | Physical-device browser/PWA acceptance. Android wrapper project and signing remain future work. |
| iOS / iPadOS | Responsive browser route. | Safari storage/import, installation and device tests. Native wrapper and Apple signing remain future work. |
| FreeBSD / OpenBSD / NetBSD / DragonFly BSD | The complete static browser build uses standard web APIs, with no wrapper or server OS dependency. A BSD user may serve the ZIP's dist/ from any static server or open it on an HTTPS host. | Each BSD/browser combination needs its own offline and import tests. No native BSD wrapper has a release claim. |
| Headless servers | Serve the same dist/ using a static web server. The bundled Node launcher binds loopback. The Node observation package and local MCP formula server run without a GUI. The MCP stdio process and the scoped localhost REST, WebSocket and gRPC service were exercised on Linux x64. CI packages the research service with bundled SQLite for Ubuntu 24.04 x64 and exercises local audit recovery and explicitly configured TLS. [Local REST research](local-rest-research.md). | 0.59.0 exercises TLS and scoped credentials from an isolated second client. Enterprise deployment and credentials-provider integration. |
| OCI / Kubernetes / enterprise | A non-root Linux x64 OCI image was verified with private Compose and Kubernetes deployments. A separate Compose project recovered an audit snapshot onto fresh storage and continued its receipt sequence. A portable audit command reports receipt counts and can require a trusted SHA-256 before restore. [Research OCI image](local-rest-research.md#research-oci-image) · [Kubernetes](local-rest-research.md#private-kubernetes-deployment) · [Fresh-volume recovery](local-rest-research.md#recover-audit-in-a-separate-compose-project). | Hosted recovery and enterprise authentication. |

## Windows native verification

The Windows Server 2022 x64 job selects the Microsoft-signed Edge WebDriver that matches the installed WebView2 Runtime. The driver launches MarketWeft with a temporary data folder. The fixture checks the app's Tauri origin, records the native runtime version, imports the shared CSV through the file input and checks the exact candlestick quote. [Microsoft WebView2 WebDriver guide](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

The Windows 11 ARM64 job checks the runner, Node.js and Rust host architectures and inspects the PE machine field of both Windows executables. It runs the Python research SDK fixture, then launches a test build of the normal desktop entry point with an ephemeral WebView2 profile and verifies the same CSV import through the native control. [GitHub Windows 11 ARM64 runner inventory](https://github.com/actions/runner-images/blob/main/images/windows/Windows11-VS2026-Arm64-Readme.md).

With a matching Edge WebDriver and WebView2 runtime, run the same fixture from the repository root after producing the release executable.

```powershell
python -B apps/desktop/tests/import_webview.py apps/desktop/target/release/marketweft-desktop.exe --driver 'C:\tools\msedgedriver.exe'
```

### Windows installers

Download the `windows-desktop-x64-attempt-N` or `windows-desktop-arm64-attempt-N` artifact for your Windows architecture from a successful verification run. Unpack it and compare the installer's SHA-256 with its sidecar before running it. The per-user installer uses the installed Microsoft WebView2 Runtime and registers a Start menu shortcut and an uninstall entry. It includes the application license, dependency notices, source revision and dependency source records. [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

CI compiles each installer twice from the same release executable, verifies identical bytes, installs into a temporary directory and checks uninstallation. The x64 job imports the CSV in the installed release. The ARM64 job confirms the installed release initializes WebView2 and exercises the same CSV workflow through a separately installed test build. Both jobs verify that the uninstaller preserves a user-created file.

## macOS native builds

The desktop CI matrix uses separate macOS 15 runners for Intel and Apple Silicon. Each job builds the Tauri desktop executable and native research engine, checks the machine and both Mach-O architectures, and runs the Python research SDK fixture against the built engine. [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

The CSV fixture opens the bundled terminal in an ephemeral WKWebView, sends a synthetic file through the visible import form, and checks the resulting chart and exact open, high, low, close and volume.

## Linux native verification

The desktop CI matrix exercises Ubuntu 24.04 x64 and ARM64. It builds the Tauri wrapper against the locked dependencies, checks the GLib compatibility fixture, then launches under Xvfb and verifies the chart, watchlist, import limits and a local CSV import through the WebView using the loopback WebKit WebDriver. The ARM64 job also records the runner and ELF architectures. [GitHub-hosted Ubuntu ARM64 runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

Run the same check on an Ubuntu development host after installing the dependencies listed in the workflow. From the repository root, build the browser and native executable, then run the X11 smoke test.

```sh
npm ci
npm run build
cargo build --locked --manifest-path apps/desktop/Cargo.toml
PATH="/usr/bin:$PATH" sh apps/desktop/tests/smoke-x11.sh apps/desktop/target/debug/marketweft-desktop
PATH="/usr/bin:$PATH" xvfb-run -a dbus-run-session -- python3 -B apps/desktop/tests/import_webview.py apps/desktop/target/debug/marketweft-desktop
```

This evidence covers the Ubuntu CI WebView and launch environment. Installer signing and upgrade checks are separate milestones.

## Ubuntu desktop package

Use an Ubuntu 24.04 machine. Download the matching `ubuntu-desktop-X64-attempt-N` or `ubuntu-desktop-ARM64-attempt-N` artifact from a successful verification run. Unpack it and verify the included SHA-256 file. APT installs the native executable, desktop launcher, icon, notices and runtime dependency metadata. [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

```sh
architecture=$(dpkg --print-architecture)
package="marketweft-desktop_0.162.0_$architecture.deb"
sha256sum --check "$package.sha256"
sudo apt install "./$package"
marketweft-desktop
```

Build a package on its target Ubuntu architecture with `python3 -B scripts/package_desktop_deb.py apps/desktop/target/release/marketweft-desktop` after compiling the frontend and the native release executable. The packager derives runtime dependencies from the linked libraries and records the source revision and locked Rust crate sources. Packaging twice from the same executable and commit produces the same archive.

GitHub Actions verifies a fresh package installation and the native WebView import fixture on Ubuntu 24.04 x64 and ARM64. The upgrade fixture verifies version 0.160.0 to 0.161.0 on the same Ubuntu runners. Tagged releases provide signed build provenance for both Ubuntu packages. Other distributions retain their separate verification requirements.

### Verify an Ubuntu package upgrade

The upgrade fixture requires two checksum-verified desktop packages for the same CPU architecture. Run it on a disposable Ubuntu host with the build and WebKit test dependencies from the desktop workflow.

```sh
sh scripts/verify_desktop_upgrade.sh PREVIOUS.deb CANDIDATE.deb
```

The previous installation imports a synthetic CSV and saves the close-line chart preference. After the previous version reopens the profile successfully, APT upgrades the same installation. The candidate launches against the same profile and checks the saved chart preference and the exact OHLCV readout. The fixture removes its temporary profile after the test.

### Verify Ubuntu package provenance

The tagged release workflow publishes both architecture packages with SHA-256 files and a GitHub attestation bundle. The verification job binds the package bytes to the build’s repository, workflow, tag and commit. [GitHub attestation verification reference](https://cli.github.com/manual/gh_attestation_verify).

Use the following command with the package, bundle, release tag and full commit SHA from a successful tag run.

```sh
gh attestation verify "$package" --repo Yunushan/marketweft \
  --signer-workflow Yunushan/marketweft/.github/workflows/verify.yml \
  --deny-self-hosted-runners --source-ref "$release_ref" --source-digest "$release_commit" \
  --bundle marketweft-ubuntu-desktop.intoto.jsonl
```

Set `release_ref` to the release’s full Git ref, such as `refs/tags/v0.162.0`. A successful check confirms the exact package came from the selected GitHub-hosted build and release commit.
