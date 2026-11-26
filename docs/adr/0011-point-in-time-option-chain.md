# 0011 · Reconstruct European option inputs before solving IV

Accepted for 0.11.0. Select option and underlying quotes independently by effective and known timestamp. Treat the quote itself as evidence of contract visibility. Preserve one-sided, crossed, stale, expired and out-of-bounds observations with a machine-readable reason.

Use a single tested European continuous-yield model for both native and Wasm, a bounded solve and per-point Greek units documented in the UI. Group observed IV points by strike, side and maturity. Market inputs stay local to the replay view.
