# ADR 0001 · One financial engine for the first two clients

Accepted for 0.1.0. The critical path is a user opening an authorized price history and verifying a chart offline. A server, a market subscription and broker credentials would each add a failure mode to that path.

The Rust crate owns instrument keys, bar validation and indicator arithmetic. The web client calls a small Wasm boundary and renders results with browser graphics. Native desktop embeds the built web client through Tauri. Its separate Cargo workspace keeps the WebView and packaging toolchain optional. The trading-bot client is a separately usable TypeScript-facing package with an explicit read-only contract.

The first domain events are local user actions such as importing a history or selecting an instrument. The UI commits accepted state locally and redraws from that state. Introduce a durable event envelope with instrument, source, observation time and exchange time when streaming or replay needs ordering. Keep simulations deterministic by driving them from recorded events, never from wall-clock UI timers.

Before adding a headless API, define snapshot version, provenance, entitlement and replay contracts. SQLite is the planned standalone catalog and DuckDB the optional analytical store. Benchmark a large local history before adding a network service. Axum/Tokio, PostgreSQL, ClickHouse, NATS JetStream and Valkey each require a demonstrated integration or deployment need. Compare wgpu with the browser chart on the same reference workload before selecting an accelerated renderer.
