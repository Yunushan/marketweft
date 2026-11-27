# Platform support · MarketWeft 0.179.0

A successful web test validates a specific browser, build and host. Producing a native artifact and validating installation, launch, upgrades and normal operation on its target are separate release gates. Operating system signing and notarization are tracked per platform.

| Target | Current route / available evidence | Required for official native or operational support |
| --- | --- | --- |
| Browser / installable PWA | Static React app with a Wasm core. Windows x64 Chromium-family automation, responsive viewport and offline reload. | Browser-engine and device matrix, install/update tests and storage lifecycle acceptance. |
| Windows x64 | Per-user installer, native WebView2 CSV import and same-profile installer upgrade on hosted Windows Server 2022. | Windows client coverage and Authenticode verification. |
| Windows ARM64 | Per-user installer, installed release startup, same-profile upgrade with an instrumented build and Python research SDK on hosted Windows 11 ARM64. | Authenticode verification. |
| macOS Apple Silicon / Intel | Per-architecture app archives and read-only disk images. Hosted tests import CSV through the production app's native file picker and verify in-place upgrades with a saved WKWebView workspace in packaged test builds. | Developer ID signing and notarization. |
| Linux x64 | Ubuntu 24.04 x64 package installation and native CSV import. Debian 12 native window and chart rendering observed through AT-SPI. See [verification](verification.md) and the [advisory review](native-advisories.md). | Broader upgrade coverage, continued backport maintenance and validation on other supported distributions. |
| Linux ARM64 | Browser route and Ubuntu 24.04 ARM64 package installation, native X11 launch and CSV import smoke test. | Broader upgrade coverage and validation on other supported distributions. |
| Android | Experimental x86_64 debug APK. Hosted Android 35 emulator verifies offline startup, native CSV selection and exact chart recovery after relaunch. | Physical devices, ARM64, upgrade and backup checks, and distribution signing. |
| iOS / iPadOS | Responsive browser route and experimental ARM64 Simulator bundle. Hosted iPhone 16 and iPad (A16) simulators verify Files import and exact chart recovery after a controlled loopback service outage. | Full network disconnection, workspace backup and upgrade tests, physical devices and Apple distribution signing. |
| FreeBSD / OpenBSD / NetBSD / DragonFly BSD | The complete static browser build uses standard web APIs, with no wrapper or server OS dependency. A BSD user may serve the ZIP's dist/ from any static server or open it on an HTTPS host. | Each BSD/browser combination needs its own offline and import tests. No native BSD wrapper has a release claim. |
| Headless servers | Serve the same dist/ using a static web server. The bundled Node launcher binds loopback. The Node observation package and local MCP formula server run without a GUI. The MCP stdio process and the scoped localhost REST, WebSocket and gRPC service were exercised on Linux x64. CI packages the research service with bundled SQLite for Ubuntu 24.04 x64 and exercises local audit recovery and explicitly configured TLS. [Local REST research](local-rest-research.md). | 0.59.0 exercises TLS and scoped credentials from an isolated second client. Enterprise deployment and credentials-provider integration. |
| OCI / Kubernetes / enterprise | A non-root Linux x64 OCI image was verified with private Compose and Kubernetes deployments. A separate Compose project recovered an audit snapshot onto fresh storage and continued its receipt sequence. A portable audit command reports receipt counts and can require a trusted SHA-256 before restore. [Research OCI image](local-rest-research.md#research-oci-image) · [Kubernetes](local-rest-research.md#private-kubernetes-deployment) · [Fresh-volume recovery](local-rest-research.md#recover-audit-in-a-separate-compose-project). | Hosted recovery and enterprise authentication. |

## Android terminal

The Android job builds the same terminal through the shared Tauri entry point. It uses the pinned Tauri CLI and Android NDK, verifies the APK signature, x86_64 ELF library, source revision and dependency notices, and installs the APK on an Android 35 Google APIs emulator. With airplane mode enabled, it opens the app and checks the bundled chart and CSV action in Android System WebView. [Tauri Android distribution](https://v2.tauri.app/distribute/google-play/) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

Download `android-terminal-x86_64-attempt-N` from a successful run and verify the SHA-256 sidecar before installing the debug APK on a compatible emulator. The evidence artifact contains the launch result, WebView provider and UI hierarchy.

The import test places the synthetic fixture in Downloads. It opens the native document picker from the terminal, selects the file and verifies the exact chart OHLCV through Android's accessibility hierarchy. It force-stops and relaunches the same installed app, then verifies the original chart again. The evidence includes the imported and restored UI hierarchies. [Android Storage Access Framework](https://developer.android.com/guide/topics/providers/document-provider).

## iOS and iPadOS Simulator

The iOS job builds the bundled terminal through the shared Tauri entry point using Xcode 16.4. It verifies the app's source revision, simulator platform and ARM64 binary, then installs the same build on fresh iPhone 16 and iPad (A16) profiles running the iOS 18.5 Simulator runtime. XCTest sees the local CSV action and exact NVDA sample OHLCV in WKWebView without a development server. [Apple Simulator setup](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

Download `ios-simulator-arm64-attempt-N` from a successful workflow for the simulator app and SHA-256 sidecar. The result bundles for both devices are in `ios-simulator-evidence-attempt-N`.

The import test stages an authorized synthetic CSV in a separate simulator test app, opens the Files picker in MarketWeft and checks the imported OHLCV. After CI stops a runner-local TCP listener, the test confirms connection refusal from the simulator, relaunches MarketWeft and checks the exact same chart. This exercises recovery after loss of a previously reachable local service. [Apple File Provider](https://developer.apple.com/documentation/fileprovider).

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

The upgrade fixture installs verified 0.168.0 packages and applies the candidate directly to the existing installation. It checks the candidate executable and source revision, then reopens the exact WebView2 profile to verify the saved close-line chart and imported OHLCV. The x64 fixture drives the installed executables through Edge WebDriver. The ARM64 fixture reopens the shared profile using test builds of the prior and candidate sources.

### Verify Windows installer provenance

The tagged workflow checks each Windows installer's SHA-256, embedded source revision and the PE architecture of its application before creating a GitHub build attestation. Download the `windows-desktop-signed-attempt-N` artifact from the successful tag run. The signed provenance covers both installers and can be verified with the accompanying bundle. Windows Authenticode has its own verification requirements. [GitHub attestation verification reference](https://cli.github.com/manual/gh_attestation_verify).

```powershell
gh attestation verify $Installer --repo Yunushan/marketweft --signer-workflow Yunushan/marketweft/.github/workflows/verify.yml --deny-self-hosted-runners --source-ref refs/tags/v0.170.0 --source-digest $Commit --bundle marketweft-windows-desktop.intoto.jsonl
```

Set `$Installer` to the downloaded x64 or ARM64 installer and `$Commit` to the full commit SHA for the tag. Use the matching tag and attestation bundle when verifying a later release.

## macOS native builds

The desktop CI matrix uses separate macOS 15 runners for Intel and Apple Silicon. Each job builds the Tauri desktop executable and native research engine, checks the machine and both Mach-O architectures, and runs the Python research SDK fixture against the built engine. [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories) · [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

The CSV fixture opens the bundled terminal in an ephemeral WKWebView, sends a synthetic file through the visible import form, and checks the resulting chart and exact open, high, low, close and volume.

### macOS application archives

Download `macos-desktop-x64-attempt-N` for Intel or `macos-desktop-arm64-attempt-N` for Apple Silicon from a successful GitHub run. Verify the SHA-256 sidecar and extract the ZIP to get `MarketWeft.app`. The bundle includes its icon, source revision, native dependency inventory and notices. [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

The macOS jobs build the archive twice, verify its ad hoc code signature after extraction and open the exact release bundle with Launch Services. A separate packaged test build exercises CSV import in WKWebView. Developer ID signing and notarization are follow-on release gates. [Apple bundle layout](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle).

### macOS disk images

Download `macos-disk-image-x64-attempt-N` for Intel or `macos-disk-image-arm64-attempt-N` for Apple Silicon from a successful GitHub run. Extract the artifact, verify the SHA-256 sidecar and open the disk image. Drag `MarketWeft.app` to the Applications shortcut and eject the image. These test images ship an ad hoc-signed application. Developer ID signing and notarization are pending. [Hosted verification](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [Apple disk image packaging](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution).

The hosted test mounts the image read-only and checks the Applications shortcut. It copies the app into an isolated Applications directory, ejects the image, compares the copy against the ZIP bundle, checks its signature and architecture, and launches the copy through Launch Services.

### macOS app upgrades

The matrix verifies upgrades from the [0.172.0 disk images](https://github.com/Yunushan/marketweft/actions/runs/46007400230). The test launches the prior and candidate release bundles in the same isolated Applications path. Separate packaged test builds share an isolated WKWebView profile and confirm that the chosen close-line chart and exact imported OHLCV reopen after replacement. The test also checks a user-created file beside the app.

The baseline download checks the original workflow, full source revision and artifact digest. If the archive has expired, CI builds the disk image from the pinned revision.

### macOS native file picker

On Intel and Apple Silicon, the hosted XCTest UI test opens the exact production app from its verified archive, opens the native file panel from the CSV import form and selects the synthetic fixture by path. It submits the import and checks the chart's accessible OHLCV readout. See the `macos-file-picker-ARCH-attempt-N` artifact for the Xcode test result. [Apple UI automation](https://developer.apple.com/documentation/xcuiautomation).

### Verify macOS disk-image provenance

On a release tag, the hosted workflow verifies each disk image's checksum, embedded source revision, app signature and Mach-O architecture. It then attests both disk images. Download `macos-desktop-signed-attempt-N` from the successful tag run and use the provided bundle to verify the image. Apple Developer ID signing and notarization remain separate release gates. [GitHub attestation verification](https://cli.github.com/manual/gh_attestation_verify).

```sh
gh attestation verify MarketWeft-desktop-0.174.0-macos-arm64.dmg \
  --repo Yunushan/marketweft \
  --signer-workflow Yunushan/marketweft/.github/workflows/verify.yml \
  --deny-self-hosted-runners \
  --source-digest "$(git rev-list -n 1 v0.174.0)" \
  --source-ref refs/tags/v0.174.0 \
  --bundle marketweft-macos-desktop.intoto.jsonl
```

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
