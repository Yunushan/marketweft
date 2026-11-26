# Source permissions

When importing an OHLCV CSV, open **Series details** and record the documented permission for display, storage, redistribution and automated use. Each field accepts **Granted**, **Restricted** or **Unconfirmed**. Keep the agreement name or terms in **Usage grant**. If the source sets an expiration date, enter the last UTC calendar day covered by the grant.

The terminal stores and displays an imported series locally. An explicit display or storage restriction blocks import. A rejected import leaves the existing workspace intact.

The selected series shows its source, usage grant, permission statuses and any expiration date in the provenance panel.

## Backup and restore

Exports containing a structured grant use workspace backup version 7 and series descriptor version 2. The per-series checksum covers the structured grant and its underlying data. Restore validates the four permission statuses and any UTC expiry before preparing a replacement.

Earlier workspace backups remain readable. Histories carrying legacy free-text grants keep those records when the workspace adds a newer structured grant.
