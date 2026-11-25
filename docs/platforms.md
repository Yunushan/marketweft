# Platform support · 0.1.0 foundation

A successful web test validates a specific browser, build and host. Producing a native artifact and validating installation, launch, upgrades and normal operation on its target are separate release gates. No signed native distribution is part of this milestone.

| Target | Current route / available evidence | Required for official native or operational support |
| --- | --- | --- |
| Browser / installable PWA | Static React app with a Wasm core. Windows x64 Chromium-family automation, responsive viewport and offline reload. | Browser-engine and device matrix, install/update tests and storage lifecycle acceptance. |
| Windows x64 | Tested web path. Tauri source; local native build blocked by Windows Application Control while running dependency build scripts. Windows CI build configured. | Native build, window and installer acceptance on a supported host. |
| Windows ARM64 | Browser route. Experimental native target. | ARM64 WebView2 runtime, native runner and package tests. |
| macOS Apple Silicon / Intel | Browser route. macOS ARM runner configured for a Tauri build. Intel unverified. | Per-architecture launch, import, sandbox, signing and notarization on actual hosts. |
| Linux x64 | Static browser and Tauri source. See [verification](verification.md) for the precise native build evidence and the [advisory review](native-advisories.md) before packaging. | Distribution/runtime matrix, GTK dependency resolution, install and upgrade tests. |
| Linux ARM64 | Browser route. Native toolchain target pending. | ARM64 GTK/WebKit build, launch and package evidence. |
| Android | Responsive browser path. Phone-sized desktop viewport tested. | Physical-device browser/PWA acceptance. Android wrapper project and signing remain future work. |
| iOS / iPadOS | Responsive browser route. | Safari storage/import, installation and device tests. Native wrapper and Apple signing remain future work. |
| FreeBSD / OpenBSD / NetBSD / DragonFly BSD | The complete static browser build uses standard web APIs, with no wrapper or server OS dependency. A BSD user may serve the ZIP's dist/ from any static server or open it on an HTTPS host. | Each BSD/browser combination needs its own offline and import tests. No native BSD wrapper has a release claim. |
| Headless servers | Serve the same dist/ using a static web server. The bundled Node launcher binds loopback. The Node observation package can run without a GUI. | Authenticated MarketWeft headless research service is planned. |
| OCI / Kubernetes / enterprise | A static hosting target is possible. A disposable Linux container exercised the external observation adapter. | Supported images, manifests, configuration, monitoring and restore drills remain planned. |

