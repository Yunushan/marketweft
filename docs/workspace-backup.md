# Workspace backup and restore

Choose **Workspace backup → Export workspace** to download a `.marketweft.json` file. The export reads one committed catalog snapshot. It includes every imported series, including instruments removed from the watchlist, the selected instrument, watchlist order and SMA/EMA preferences. When the comparison pane is open, the export includes its instrument, overlays and UTC-link setting. Each series carries its source CSV text and its venue, symbol, bar interval, source label, usage grant and adjustment policy. The fixture data bundled with the app is identified by version and checksum.

To recover on another browser profile, open the terminal over HTTPS or localhost and choose **Workspace backup**. Select the file under **Backup file**. MarketWeft checks the format, checksums, sample compatibility, instrument identities, preferences, CSV values and record counts. The preview shows how many imported histories and bars the file contains, along with the selected instrument and watchlist count.

**Restore workspace** replaces the destination's imported histories and preferences in one transaction. Export the destination first to keep a copy. A verified backup with zero imported series also replaces the current import catalog. If another tab changes the workspace during review, choose the file again to review against its latest state. A failed or interrupted replacement leaves the previously committed catalog available.

A backup contains plain JSON, including the contents of imported CSV files. Keep backups in a location appropriate for those files and their usage grants. Checksums detect altered contents. Anyone able to edit the file can also compute new checksums.

## Format versions

A single-pane backup uses version 1. A two-pane backup uses version 2 and adds a `comparison` object under `manifest.preferences`. Its `selected` field identifies a sample or imported series, and its `sma`, `ema` and `linked` fields use Boolean values. MarketWeft validates both formats. Opening or restoring a single-pane workspace keeps the comparison pane closed until enabled.

| Field | Contents |
| --- | --- |
| `format`, `version` | The string `marketweft-workspace` and integer `1` or `2`. |
| `manifest.sampleSet` | The built-in sample version and SHA-256 digest of the ordered sample identities, names and OHLCV values. |
| `manifest.preferences` | `selected`, `watchlist`, `sma` and `ema`, plus `comparison` for version 2. Watchlist entries must be unique catalog or sample IDs. The primary selection must be on the watchlist. |
| `manifest.series` | Imported history records. A record contains `id`, `descriptor`, `csv`, `barCount` and `sha256`. Each ID must match its canonical `VENUE:SYMBOL` and be unique across imported and built-in instruments. |
| `descriptor` | Version `1` plus the strings `venue`, `symbol`, `barInterval`, `source`, `usageGrant` and `adjustmentPolicy`. Older imports use their filename as source. Unknown legacy metadata is recorded as `unspecified`. |
| `manifest.seriesCount`, `manifest.barCount` | Number of imported histories and total number of data rows parsed by the Rust financial core. |
| `sha256` | A lowercase hexadecimal SHA-256 digest of the canonical manifest. It also covers the per-series digests. |

To reproduce a digest, recursively sort object keys by UTF-16 code unit, retain array order, encode JSON strings using ECMAScript JSON escaping, write safe integers in decimal, and omit formatting whitespace. Hash the UTF-8 encoding of that representation. A per-series digest covers the record after removing its `sha256` member. The sample digest covers objects with `id`, `name` and `bars`, in built-in catalog order. Each bar is an array of Unix seconds followed by open, high, low, close and volume in integer millionths.

Raw CSV text preserves its line endings, timestamps and precision in the backup. On restore the native-equivalent Rust/Wasm parser validates every row again. The per-file deployment limits for *new CSV imports* do not hide previously accepted histories in backups. The core's data bounds and the destination's browser storage quota still apply.
