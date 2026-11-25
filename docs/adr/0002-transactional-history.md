# ADR 0002 · Transactional histories in the browser

Accepted for 0.2.0. A large import, a damaged browser profile and a second open tab expose different failure modes. The application needs to update chart preferences and imported history together, and it needs an explicit way to move that data to another origin or computer.

Use two object stores in an origin-local IndexedDB database. The active workspace record contains the selection, ordered watchlist, overlay settings, ordered import IDs and a monotonically increasing revision. Each imported instrument has one series record keyed by its canonical venue and symbol, with the original CSV, a versioned descriptor and the validated bar count. Retaining the source text preserves decimal precision, UTC observations and provenance while allowing the same Rust parser to validate migration and restore.

Mutations compare the last-seen revision within a read-write transaction. Competing writes report a conflict. Updating chart preferences leaves the series records untouched. Notifications help open tabs refresh, while transaction serialization enforces correctness even when notification delivery is delayed. Replace operations validate complete data before publishing a new revision and check the stored history before commit.

The v1 migration reads the legacy key, recovers supported entries and validates the result. The original localStorage value remains available if the migration is interrupted, a legacy tab writes during the upgrade, or a user needs to recover a malformed entry. New backups bind series and preferences to SHA-256 digests and an identified sample set. Portable backups use a separate version number from the IndexedDB layout so either can evolve through an explicit migration. [Format and compatibility rules](../workspace-backup.md).

