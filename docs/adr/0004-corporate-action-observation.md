# ADR 0004 · Compute split-adjusted history at the replay cursor

Accepted for 0.4.0. A split can be announced, take effect and reach a data consumer at different times. Using the fully adjusted history from the end of a dataset can change an earlier replay snapshot with data the observer did not yet have.

Keep raw OHLCV and action observations as distinct inputs. The split book selects the latest observation at the cursor for each effective time. If that time has passed, apply the split to each already observed bar that starts strictly before it. The Rust engine composes exact rational price and volume factors and returns derived bars. The browser computes moving averages from those bars using the same Rust core. Resolving an earlier snapshot starts from the original bars and the earlier observation cutoff.

The browser emits action observations and effective transitions on the existing replay clock. Action events precede market events at the same second. The calendar and bar grid must establish a clear share-basis boundary. The current split schema uses the effective time as its revision key. A later schema can add persistent action identifiers to represent effective-time changes or cancellation. [Action and replay contract](../corporate-actions.md).
