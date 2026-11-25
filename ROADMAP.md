# Prioritized implementation backlog

0.1.0 establishes a local chart, its numerical oracle, and a separately usable observer. See [coverage](docs/coverage.md) for the full requirement register and [verification](docs/verification.md) for what ran. Feature budgets such as 600 indicators, 150 tools and 35 chart types are long-term coverage targets. A new name or parameter preset does not count as a new implementation.

| Priority | Milestone / requirements | Deliverable and exit condition |
| --- | --- | --- |
| P0 · next | Versioned historical storage and recovery (MW-002, MW-007, MW-017, MW-029) | Create a series descriptor with venue, symbol, bar interval, source, usage grant and adjustment policy. Persist imports transactionally in IndexedDB with a migration from v1 browser storage. Add a versioned export/import bundle with record counts and checksums. An interrupted write, second tab and denied quota must preserve the prior data. Restore on a clean profile and compare every tick and identity. |
| P0 | Native release prerequisites (MW-010, MW-011) | Resolve the GTK dependency advisory, collect OS-specific build and launch evidence, validate clipboard/import/sandbox boundaries and ship corresponding notices. Sign and verify an installer on a second machine. |
| P1 | Market time, provenance and replay (MW-013, MW-017, MW-029) | Add explicit calendars and sessions, corporate actions, as-of membership and deterministic bar replay. Use authorized test fixtures for DST, splits, delisting and missing intervals. Switch between raw and adjusted series without rewriting source history. |
| P1 | Interactive research workspace (MW-006, MW-012, MW-014) | Persist two chart panes with linked UTC crosshairs, one measured drawing in data coordinates, reusable indicator parameters and CSV export. Restore exact settings after a versioned migration. |
| P1 | Simulation and research (MW-020, MW-021, MW-025) | Implement paper cash and fills with fees, reasoned rejections, idempotent event IDs and kill switch. Backtest against the same event contract. Check prefix invariance, delayed fills and out-of-sample splits. |
| P2 | Strategy language and extension model (MW-015, MW-016, MW-028) | Publish an independent time-series language spec, bounded interpreter and isolated Wasm execution. Test determinism, quotas and schema compatibility across SDKs. Start MCP with read-only research queries. |
| P2 | Cross-sectional and fundamental research (MW-018, MW-023, MW-024, MW-026, MW-027) | Screen a point-in-time universe, release an attributable heatmap, then add statement vintages, macro releases, option-chain analytics and deduplicated notifications with fixtures per domain. |
| P2 | Order flow and specialized visualization (MW-012, MW-019) | Add authorized trade and depth streams, sequence recovery, trade-side classification and profiles. Benchmark Canvas against WebGL/wgpu with identical traces before adopting another renderer. |
| P3 | Enterprise and authorized live execution (MW-022, MW-028, MW-030) | Introduce a headless Rust service, SQLite/DuckDB persistence, authenticated APIs and audited operations. Add external stores/queues only after load tests justify them. Prove quota enforcement and disaster recovery before a hosted rollout. Require explicit authorization and deterministic pre-trade risk for any live route. |

## Handoff for the next change

Start by importing the golden CSV under a new instrument key, changing an overlay and reloading offline. Preserve that behavior while migrating persistence. Define the new catalog and backup schemas first, then implement transactional migration with fixtures from this release, export and restore, corruption handling, UI affordances and browser tests in that order. Keep the current v1 storage untouched until a read-back verifies the migrated data. Do not couple the catalog migration to a broker connection.

