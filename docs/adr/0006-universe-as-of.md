# ADR 0006 · Reconstruct universe membership from two cutoffs

Accepted for 0.6.0. An end-of-period constituent list misses additions, removals and delistings that affected earlier periods. Reports can reach a researcher after their effective times, and later reschedules must be applied only after they become known.

The Rust core accepts revisions with stable change and listing IDs. It selects the latest report by observation cutoff before filtering by effective cutoff. It then reduces the remaining actions in effective-time order and records exclusions with source evidence. A symbol is a display label and a distinct listing ID identifies reuse. An ordinary removal allows future readdition, while a delisting ends its listing lifetime.

The Wasm bridge exposes sorted replay checkpoints and queries with independent effective and known UTC timestamps. The browser steps both clocks together in replay and accepts custom as-of inputs. The underlying membership history stays local to the view. [Universe membership contract](../universe-membership.md).
