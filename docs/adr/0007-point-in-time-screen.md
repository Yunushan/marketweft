# 0007 · Rank universe members by reproducible close observations

Accepted for 0.7.0. A historical ranking needs both membership history and the timestamp at which each input became available. The source candle catalog captures raw source bars. Screening needs explicit publication timestamps and revisions, so it accepts a separate file keyed by listing ID and the exact time of the close.

Use the target membership snapshot and one observation cutoff for both price endpoints. Keep members with absent observations visible. Exact ratio comparison and stable listing IDs keep rank independent of file order and display precision. Preserve each selected input close and its observation time in the native and Wasm outputs.

A two-endpoint rule makes the result directly reproducible from the supplied data. Sparse inputs yield a partial rank. Sector analysis can later use the same member list and close evidence, then add separately dated classification and weight inputs. [Input schema and replay example](../universe-screen.md).
