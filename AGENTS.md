# Working on MarketWeft

Keep original code under 0BSD. Implement financial rules in the Rust core and use the same module in the browser. Rebuild the checked-in Wasm after a core change. Verify behavior with fixtures before updating coverage in docs/coverage.md.

Treat every dataset as having a source and usage rights. Ship generated examples and import files a user is entitled to use. Keep account observation isolated from order submission. Do not add credential persistence, broker mutations or live execution to the observation adapter.

Run the checks in README.md before handoff. Keep native build claims specific to the OS, architecture and test evidence. Update the platform matrix and ROADMAP.md when changing a support claim.
