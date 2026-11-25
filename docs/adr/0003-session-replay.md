# ADR 0003 · Resolve historical sessions before replay

Accepted for the 0.3.0 terminal. Persisted OHLCV timestamps alone cannot determine whether a gap represents a closure, a shorter trading day or an absent row. A date or weekday rule also lacks the venue's exceptions. The replay plan takes a versioned application contract with explicitly resolved UTC session boundaries supplied by the operator. The example resolves public NYSE schedule facts with a separately generated series.

The Rust core validates the calendar, combines it with immutable bar-start timestamps and emits chronological opens, observed bars, missing intervals and closes. Session offsets support inspection without making playback depend on the browser's current local time zone or timezone database. Scheduled interval end supplies the earliest hypothetical bar observation time. Native and Wasm use the same planner, and both compare each disclosed price prefix against the batch indicator outputs.

Replay state belongs to a view. Workspace transactions and backups preserve the original market-data sources and preferences. Source corrections, intrabar events and provider arrival timestamps can have different observation times, so model them explicitly before introducing execution simulation or point-in-time revisions. [Replay contract](../historical-replay.md).
