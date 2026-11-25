# Security

This milestone is a local research application. CSV content, instrument labels, browser storage and trading-bot responses cross trust boundaries. React renders labels as text. The Rust importer enforces its schema and bounds. The terminal has no order submission UI. The independent SDK is for observation. Keep broker credentials out of browser storage and source control.

Report a suspected vulnerability privately to the maintainer through GitHub's private vulnerability reporting if enabled, or request a private contact channel from the maintainer. Include the version, platform, affected component and impact. Redact credentials and account data.

Serve the browser build over HTTPS or loopback. Use a separate browser profile or operating-system account on shared machines. An import persists in the current browser origin. Browser profiles and local backups may contain financial histories. Keep the source CSV for recovery. A hosted multi-tenant service requires a new identity, isolation, retention and audit design.

The dependency jobs check locked versions for advisories and license changes. A green build covers only its tested targets. Release signing, platform notarization, recovery drills and independent review are release gates before a production claim.
