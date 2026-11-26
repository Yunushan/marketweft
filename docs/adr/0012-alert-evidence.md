# 0012 · Save replay notifications by immutable event identity

Accepted for 0.12.0. Reconstruct threshold and SMA crossings from time-stamped data and versioned rules. Include the exact rule and both comparator observations in the event evidence. Keep the preview pure. Save notifications by their deterministic IDs in a dedicated atomic local inbox.

Treat repeated deliveries as successful zero-insert operations. Roll back an entire batch on conflicting identity or transaction failure. Retry an interrupted local transaction at most twice. The test suite exercises two tabs on one origin, rewind and reload.
