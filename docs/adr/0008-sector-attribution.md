# 0008 · Attribute sector returns from the historical screen

Accepted for 0.8.0. Build sector groups from the same Rust screen used by the ranking table. Load classifications and weights independently using effective and observed UTC cutoffs. Preserve a tile for every screened listing so an incomplete classification or price report stays inspectable.

Keep the known-weight denominator in contributions and publish covered weight alongside it. Compute sector means over covered weight. This exposes partial observations without silently normalizing unavailable returns across weights. Keep source reports in memory for the current replay and expose the same calculation through native Rust and Wasm.
