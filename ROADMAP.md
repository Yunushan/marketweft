# Prioritized implementation backlog

0.3.0 adds session-aware historical replay to the local workspace, transactional storage and read-only observer. See [coverage](docs/coverage.md) for the full requirement register and [verification](docs/verification.md) for what ran. Feature budgets such as 600 indicators, 150 tools and 35 chart types are long-term coverage targets. A new name or parameter preset does not count as a new implementation.

| Priority | Milestone / requirements | Deliverable and exit condition |
| --- | --- | --- |
| Delivered · 0.2.0 | Versioned historical storage and recovery (MW-002, MW-007, MW-017, MW-029) | IndexedDB stores original histories and versioned series descriptors. Browser tests cover migration, read-back, competing tabs, an interrupted write, a denied quota, checksum validation and exact tick and identity comparison after clean-profile restore. [Backup format](docs/workspace-backup.md). |
| Delivered · 0.3.0 | Session-aware historical replay (MW-013, MW-017) | Rust and Wasm apply an explicit session calendar and observation clock. Browser replay exposes the revealed prefix. The verified example spans a DST change, an early close and a missing interval. [Replay contract](docs/historical-replay.md). |
| P0 | Native release prerequisites (MW-010, MW-011) | Maintain the GTK compatibility backport until its upstream replacement lands. Collect OS-specific install and upgrade evidence, validate import and sandbox boundaries and ship corresponding notices. Sign and verify an installer on a second machine. |
| P1 | Market data provenance and point-in-time adjustments (MW-013, MW-017, MW-029) | Add explicit corporate actions, revision observation times and as-of membership. Use authorized split and delisting fixtures. Switch between raw and adjusted series while preserving immutable source history. |
| P1 | Interactive research workspace (MW-006, MW-012, MW-014) | Persist two chart panes with linked UTC crosshairs, one measured drawing in data coordinates, reusable indicator parameters and CSV export. Restore exact settings after a versioned migration. |
| P1 | Simulation and research (MW-020, MW-021, MW-025) | Implement paper cash and fills with fees, reasoned rejections, idempotent event IDs and kill switch. Backtest against the same event contract. Check prefix invariance, delayed fills and out-of-sample splits. |
| P2 | Strategy language and extension model (MW-015, MW-016, MW-028) | Publish an independent time-series language spec, bounded interpreter and isolated Wasm execution. Test determinism, quotas and schema compatibility across SDKs. Start MCP with read-only research queries. |
| P2 | Cross-sectional and fundamental research (MW-018, MW-023, MW-024, MW-026, MW-027) | Screen a point-in-time universe, release an attributable heatmap, then add statement vintages, macro releases, option-chain analytics and deduplicated notifications with fixtures per domain. |
| P2 | Order flow and specialized visualization (MW-012, MW-019) | Add authorized trade and depth streams, sequence recovery, trade-side classification and profiles. Benchmark Canvas against WebGL/wgpu with identical traces before adopting another renderer. |
| P3 | Enterprise and authorized live execution (MW-022, MW-028, MW-030) | Introduce a headless Rust service, SQLite/DuckDB persistence, authenticated APIs and audited operations. Add external stores/queues only after load tests justify them. Prove quota enforcement and disaster recovery before a hosted rollout. Require explicit authorization and deterministic pre-trade risk for any live route. |

## Handoff for the next change

The next research milestone starts with replayable corporate actions. Model announcement, effective and observation times, add a licensed or synthetic split fixture and compare the raw and adjusted price and volume prefixes at two known points in time. Preserve the portable backup contract and immutable source CSV.

