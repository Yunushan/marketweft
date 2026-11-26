# ADR 0005 · Book cash dividend movements at observation cutoffs

Accepted for 0.5.0. The amount, ex-date, pay date and cash currency can each change after a dividend is announced. Reconstructing cash from the final data would leak revisions into earlier replay snapshots and erase historical postings.

Use a stable distribution ID and timestamp each report. The Rust engine emits a chronological series of observations and valid scheduled boundaries. It reconciles each distribution's gross receivable and cash against its prior state, and reports cumulative totals by currency after each movement. A correction posts its difference at observation time. Currency changes reverse the old currency and book the updated one. The final plan keeps a single revision valid at any cutoff, and the browser groups simultaneous movements before displaying the ledger.

Entitlement is a fixed whole-share assumption. Raw and split-adjusted candle presentation are independent of the ledger, and the app preserves both the raw file and the existing workspace backup schema. [Cash dividend contract](../cash-dividends.md).
