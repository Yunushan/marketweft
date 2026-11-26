# 0009 · Reconstruct valuation from independently dated financial records

Accepted for 0.9.0. Use an issuer ID and one immutable source filing ID so a historical query can trace a statement through a restatement or a late file delivery. Keep fiscal dates, source publication and local observation separate. Select the newest publication known for the latest completed period. The observation timestamp determines what can be selected and breaks ties between observed copies of the same publication.

Treat market capitalization as a separate observation with its own clock, currency and source. Price multiples require positive supplied denominators and comparable currency. Full annual vintages preserve blanks and zeros independently. The same Rust calculation serves local native and Wasm callers without network access.
