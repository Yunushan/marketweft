# Platform support · MarketWeft 0.92.0

A successful web test validates a specific browser, build and host. Producing a native artifact and validating installation, launch, upgrades and normal operation on its target are separate release gates. No signed native distribution is part of this milestone.

| Target | Current route / available evidence | Required for official native or operational support |
| --- | --- | --- |
| Browser / installable PWA | Static React app with a Wasm core. Windows x64 Chromium-family automation, responsive viewport and offline reload. | Browser-engine and device matrix, install/update tests and storage lifecycle acceptance. |
| Windows x64 | Tested web path. Windows Server 2022 hosted Tauri build passed. Local native build was blocked by Windows Application Control while running dependency build scripts. | Native window, installer and upgrade acceptance on a supported client OS. |
| Windows ARM64 | Browser route. Experimental native target. | ARM64 WebView2 runtime, native runner and package tests. |
| macOS Apple Silicon / Intel | Browser route. macOS 15 hosted Tauri build passed. Intel remains unverified. | Per-architecture launch, import, sandbox, signing and notarization on actual hosts. |
| Linux x64 | Ubuntu 24.04 hosted Tauri build passed. Debian 12 native window and chart rendering observed through AT-SPI. See [verification](verification.md) and the [advisory review](native-advisories.md). | Distribution/runtime matrix, install and upgrade tests and continued backport maintenance. |
| Linux ARM64 | Browser route. Native toolchain target pending. | ARM64 GTK/WebKit build, launch and package evidence. |
| Android | Responsive browser path. Phone-sized desktop viewport tested. | Physical-device browser/PWA acceptance. Android wrapper project and signing remain future work. |
| iOS / iPadOS | Responsive browser route. | Safari storage/import, installation and device tests. Native wrapper and Apple signing remain future work. |
| FreeBSD / OpenBSD / NetBSD / DragonFly BSD | The complete static browser build uses standard web APIs, with no wrapper or server OS dependency. A BSD user may serve the ZIP's dist/ from any static server or open it on an HTTPS host. | Each BSD/browser combination needs its own offline and import tests. No native BSD wrapper has a release claim. |
| Headless servers | Serve the same dist/ using a static web server. The bundled Node launcher binds loopback. The Node observation package and local MCP formula server run without a GUI. The MCP stdio process and the scoped localhost REST, WebSocket and gRPC service were exercised on Linux x64. CI packages the research service with bundled SQLite for Ubuntu 24.04 x64 and exercises local audit recovery and explicitly configured TLS. [Local REST research](local-rest-research.md). | 0.59.0 exercises TLS and scoped credentials from an isolated second client. Enterprise deployment and credentials-provider integration. |
| OCI / Kubernetes / enterprise | A non-root Linux x64 OCI image was verified with private Compose and Kubernetes deployments. A separate Compose project recovered an audit snapshot onto fresh storage and continued its receipt sequence. A portable audit command reports receipt counts and can require a trusted SHA-256 before restore. [Research OCI image](local-rest-research.md#research-oci-image) · [Kubernetes](local-rest-research.md#private-kubernetes-deployment) · [Fresh-volume recovery](local-rest-research.md#recover-audit-in-a-separate-compose-project). | Hosted recovery and enterprise authentication. |

