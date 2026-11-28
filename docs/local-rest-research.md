# Local research service

The Rust research service defaults to IPv4 loopback and exposes read-only formula, calendar, universe, portfolio and option research over REST, WebSocket and gRPC. It uses the same core that powers the native executable and WebAssembly terminal.

For Ubuntu 24.04 on Linux x64, download the `research-service-linux-x64-attempt-N` artifact from a successful GitHub verification run and unpack its enclosed tar.gz archive. Extract the service with its notices. Start it with `./marketweft-research-service` after configuring its environment as shown below. To build from source, use the same settings from the repository root and run the Cargo command.

Configure a separate random token for each scope you intend to use. At least one scope is required. Each token uses 32 random bytes encoded as 64 hexadecimal characters.

```sh
export MARKETWEFT_FORMULA_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export MARKETWEFT_SCREEN_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
cargo run --locked --manifest-path apps/research-service/Cargo.toml
```

The service prints the bound loopback address. The port defaults to 4174. Set `MARKETWEFT_RESEARCH_PORT` to change it, or use 0 for an automatically assigned port. Send `Authorization: Bearer <token>` and `Content-Type: application/json`. The request host must match the printed `127.0.0.1` authority. Same-origin requests can send that exact origin. The service accepts static tokens from the environment and optional managed credentials.

| Method and path | Required scope | Request |
| --- | --- | --- |
| `POST /v1/formula` | `MARKETWEFT_FORMULA_TOKEN` | `formula`, `history_csv`, optional `observed_through` UTC seconds and ordered `functions` |
| `POST /v1/monthly-returns` | `MARKETWEFT_FORMULA_TOKEN` | `history_csv`, `first_year`, `last_year` and an exact `observed_through` UTC timestamp |
| `POST /v1/macro-calendar` | `MARKETWEFT_FORMULA_TOKEN` | Economic report `csv` and exact `published_through` and `known_at` UTC cutoffs |
| `POST /v1/universe/screen` | `MARKETWEFT_SCREEN_TOKEN` | `membership_csv`, `prices_csv`, `baseline_at`, `effective_at` and `known_at` |
| `POST /v1/universe/rank-comparison` | `MARKETWEFT_SCREEN_TOKEN` | Both CSVs, a shared baseline and two effective and known cutoff pairs |
| `POST /v1/universe/portfolio-scenarios` | `MARKETWEFT_SCREEN_TOKEN` | Point-in-time membership and price reports, allocations and deterministic sampling settings |
| `POST /v1/portfolio/allocation` | `MARKETWEFT_SCREEN_TOKEN` | membership and prices CSV, listing IDs, UTC window and knowledge times, whole interval |
| `POST /v1/portfolio/fx` | `MARKETWEFT_SCREEN_TOKEN` | `rates_csv`, source subtotals, reporting currency and independent effective and known cutoffs |
| `POST /v1/portfolio/equity-concentration` | `MARKETWEFT_SCREEN_TOKEN` | `membership_csv`, `holdings_csv`, `prices_csv` and independent effective and known cutoffs |
| `POST /v1/portfolio/equity-target-drift` | `MARKETWEFT_SCREEN_TOKEN` | `membership_csv`, `holdings_csv`, `prices_csv`, `targets_csv`, optional `terms_csv`, and independent effective and known cutoffs |
| `POST /v1/options/snapshot` | `MARKETWEFT_OPTIONS_TOKEN` | `underlying_csv`, `quotes_csv`, `effective_at`, `known_at` and optional `max_age` |
| `POST /v1/options/american/valuation` | `MARKETWEFT_OPTIONS_TOKEN` | Option CSVs, `contract_id`, both UTC cutoffs, and optional volatility and cash dividends |

The formula, universe and option snapshot endpoints accept `offset` and `limit`. The default page contains up to 200 rows. Pages can contain at most 1,000 rows. Reuse the same query and apply `next_offset` to obtain the next page. A screen ranks the full effective universe before slicing the result.

The response carries exact integer values as decimal strings. Alongside each screen row the service returns the selected membership change and selected close observation timestamps. Missing prices and unavailable returns are `null`. [Research universe screening](research-universe-screen.md) · [Time-series formulas](time-series-language.md).

The service accepts at most 16 MiB per JSON body and reads each body within five seconds. The server returns 401 for missing or invalid tokens, 403 for a different scope or origin, and 422 for inputs rejected by the research engine.

## Monthly returns

Send `POST /v1/monthly-returns` with a formula credential on the loopback or configured private TLS listener. Supply the OHLCV CSV contents as `history_csv` and up to 30 consecutive UTC years in `first_year` and `last_year`. `observed_through` is an inclusive `YYYY-MM-DDTHH:MM:SSZ` timestamp. The route shares the formula scope's admission limits, managed quotas and audit receipts. [Monthly returns calendar](chart-workspace.md#monthly-returns-calendar).

Each row contains the year, month, UTC window state, preceding and current close evidence, and the return. Close timestamps are whole UTC seconds. Price ticks and the return in millionths of a percentage point are exact decimal strings. Unavailable evidence and results are `null`. Supply `limit` from 1 to 120, with 60 as the default. To continue, pass `next_offset` as `offset` with the same CSV, years and cutoff. A `null` offset completes the result.

### Monthly returns over WebSocket and gRPC

Connect to `/v1/monthly-returns/stream` with a formula credential and send one text frame containing the REST query. Each `page` frame contains the same response as the REST endpoint. Reconnect with the last accepted `next_offset` and the same history, years and cutoff to resume. The socket closes after the last page. Use `wss` on the configured private TLS listener.

Use `marketweft.research.v1.Research/GetMonthlyReturns` over HTTP/2 for a typed unary page. Send the formula bearer credential as gRPC metadata. Set the next request's `offset` from the optional `next_offset` field. Close timestamps use signed UTC seconds, and prices and return values use strings to preserve their full integer precision. Missing close messages or return strings remain absent. The same formula admission controls, managed quotas and audit receipts apply across REST, WebSocket and gRPC. [Research Protobuf schema](../apps/research-service/proto/research.proto).

## Economic release calendar

Send `POST /v1/macro-calendar` with a formula bearer credential. Use the contents of an authorized calendar CSV in `csv` and two inclusive `YYYY-MM-DDTHH:MM:SSZ` cutoffs in `published_through` and `known_at`. The engine accepts up to 1 MiB and 10,000 reports. [Economic calendar inputs and cutoff rules](macro-calendar.md)

The page echoes both cutoffs and includes `total_releases`, `total_rows`, `offset`, `next_offset` and `rows`. Rows carry the release and series IDs, reference date, unit, report ID and kind, publication and observation times, and any scheduled time or predecessor ID. Versioned reports stay in chain order within each release. Numeric values use signed decimal strings in integer millionths and times in rows use whole Unix seconds. JSON uses `null` for unavailable fields.

Use `limit` from 1 to 250 records with a default of 100. Pass `next_offset` as `offset` with the same CSV and cutoffs. At the synthetic fixture's 14:50 UTC publication cutoff and 14:52 UTC knowledge cutoff, the inflation chain is `CPI-A0`, `CPI-A1` and `CPI-A2`. Moving knowledge back to 14:31:59 retains the schedule and forecast and withholds the first actual. [Synthetic economic calendar](../crates/core/tests/fixtures/synthetic-macro-calendar.csv)

Connect to `/v1/macro-calendar/stream` and send the same query as one JSON text frame. The service streams REST-shaped pages and closes after the terminal page. Resume after a disconnect with the same query and the last accepted `next_offset`. Use `wss` on a configured TLS listener.

Use `marketweft.research.v1.Research/GetMacroCalendar` for a typed unary page over HTTP/2. Send the formula token as `authorization` metadata. Protobuf preserves absence for the optional scheduled time, numeric value, predecessor and next offset. Formula-scoped admission, managed quotas and audit receipts apply to all three routes. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Compare universe ranks

Send a JSON object to `POST /v1/universe/rank-comparison` using a screen credential. The same route works on the loopback listener or an enabled private TLS listener. Supply `membership_csv` and `prices_csv` as UTF-8 CSV contents and provide `baseline_at`, `before_effective_at`, `before_known_at`, `after_effective_at` and `after_known_at` as exact UTC timestamps. Optional `offset` runs from 0 to 5,000 and `limit` from 1 to 1,000. The default page size is 200.

The result echoes the five cutoffs and provides the universe ID, total row count, offset and next offset. Each row retains the listing ID, instrument and both snapshots. Each snapshot contains its membership status, change ID, effective and observation times, rank, return units and exact baseline and target closes with their observation times. Prices and returns use decimal strings. Missing values use JSON `null`. Both snapshots are ranked before slicing the union by stable listing ID. Reuse the same inputs and cutoffs when requesting the next page. [Rank comparison semantics and examples](research-universe-screen.md#compare-rank-snapshots).

## Portfolio scenarios

Send `POST /v1/universe/portfolio-scenarios` with a screen bearer credential. Supply the authorized UTF-8 CSV contents in `membership_csv` and `prices_csv`, and use exact `YYYY-MM-DDTHH:MM:SSZ` timestamps for `from_at`, `through_at` and `known_at`. The service uses the same limits and complete block rules as the terminal. [Portfolio scenario method and fixture](portfolio-scenarios.md).

Supply `allocations` with 2 to 16 stable listing IDs and weights totaling 10,000 basis points. Set `interval_seconds`, `fee_basis_points`, `paths` and `horizon`. Send `seed` as an unsigned 64-bit decimal string and `starting_value_ticks` as an integer millionths string. For example, `"100000000"` sets the starting portfolio value to 100. Leave `block_size` absent for independent moves, or specify the number of adjacent moves to sample together.

Each page reports the cutoffs, seed, horizon, block size, eligible vectors and blocks, listing coverage and whole-simulation percentiles. Ending values and fees are decimal strings in millionths of portfolio currency, and drawdown uses millionths of peak value. Path numbers start at 1. Use `limit` from 1 to 250, with a default of 100. Set `offset` to the previous page’s `next_offset` with the same inputs to continue.

Connect to `/v1/universe/portfolio-scenarios/stream` using the same screen credential and send the REST JSON query in one text frame. On reconnect, resume with the last accepted `next_offset`. Use `wss` on the configured TLS listener. The gRPC method `marketweft.research.v1.Research/GetPortfolioScenarios` returns an equivalent typed unary page and uses the bearer token in `authorization` metadata. Both use the same screen admission controls, quotas and audit receipts as REST. [Research Protobuf schema](../apps/research-service/proto/research.proto).

## Portfolio allocation

Send `POST /v1/portfolio/allocation` with a screen bearer credential. Provide CSV contents in `membership_csv` and `prices_csv`, 2–16 stable `listing_ids`, UTC cutoffs in `from_at`, `through_at` and `known_at`, and a positive whole `interval_seconds`. The membership and prices limits are 1 and 2 MiB. [Portfolio minimum variance](portfolio-scenarios.md#portfolio-minimum-variance)

The response fits in one report. It echoes the inputs that define the sample window and gives expected and common returns, sorted listing coverage and any estimated weights. The `sample` carries the equal and estimated mean returns and volatilities, the estimated variance gap and iteration count. A coverage-only report has a `null` sample and `null` basis-point fields. A computed zero uses the number `0`.

Use the optional integer `maximum_weight_basis_points` to apply the same ceiling to every selected listing. The cap times the listing count must be at least 10,000. The response echoes the supplied cap even when a sample is unavailable. [Allocation weight limits](portfolio-scenarios.md#allocation-weight-limits)

Connect to `/v1/portfolio/allocation/stream` and send the same query for one WebSocket report. The HTTP/2 method is `marketweft.research.v1.Research/GetPortfolioAllocation`. Both use the same screen scope, admission and audit rules as REST. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Recorded notional bars

Send `POST /v1/trades/notional-bars` with a screen bearer credential. Supply a canonical `instrument`, up to 8 MiB of `trades_csv` contents and a positive integer `target_notional_ticks` in quote millionths. An optional exact UTC `known_at` includes observations through that second. The request also accepts `offset` and `limit`. The default page contains up to 200 bars, and the maximum is 1,000. [Trade format and fixed-point units](recorded-tick-bars.md#recorded-notional-bar-sdks)

The result echoes the instrument, target and cutoff and returns `total_bars`, `offset`, `next_offset`, and the current page. Decimal strings carry capture boundaries, gross notional in trillionths, and OHLCV in millionths. Each bar also includes a trade count, completion state and first and last UTC observation times in Unix seconds.

Connect to `/v1/trades/notional-bars/stream` for paged WebSocket results. Reuse the same tape, cutoff and target with `next_offset` to resume. The typed gRPC method `marketweft.research.v1.Research/GetRecordedNotionalBars` returns one matching page. Both use the screen authorization, admission and audit rules shared with REST. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Recorded trade prints

Send `POST /v1/trades/prints` with a screen bearer credential. Supply the canonical `instrument` and the contents of `trades_csv`, up to 8 MiB or 100,000 trades. Set `known_at` to an exact UTC second to include observations through that second. Omit it to include all captures. The optional `offset` and `limit` default to zero and 200. The maximum page size is 1,000. [CSV format and fixture](recorded-tick-bars.md#recorded-time-and-sales)

The page reports `instrument`, `known_at`, `total_prints`, `offset`, `next_offset` and `prints` in capture order. Each print includes `executed_at` and `observed_at` as whole Unix seconds, plus the captured `reported_side` of `buy`, `sell` or `unknown`. The exact unsigned `sequence`, signed `price_ticks` and positive `size_ticks` are decimal strings. Price and size use millionths.

Connect to `/v1/trades/prints/stream` to stream the same page shape. On reconnect, submit the same input and cutoff with `next_offset` from the last accepted page. The unary gRPC method `marketweft.research.v1.Research/GetRecordedTradePrints` returns one matching typed page. The three transports share authorization, admission and audit rules. [Protobuf schema](../apps/research-service/proto/research.proto) · [Read-only MCP](local-mcp-research.md#recorded-trade-prints)

## Dividend ledger

Send `POST /v1/dividends/ledger` with a screen bearer credential and a canonical `instrument`. Send `dividends_csv` as text and supply exactly one of `shares` or `positions_csv`. Fixed shares can range from zero to 1,000,000. Each CSV accepts up to 1 MiB. An optional `known_at` includes events through that exact UTC second. Omit it to include all recorded events. [Dividend report and dated position formats](cash-dividends.md)

The page includes `total_events`, `offset`, `next_offset`, and the ordered `events`. The default limit is 200 and the maximum is 1,000. Each event gives its stable ID, kind, event and report times in Unix seconds, gross per-share amount and available entitlement. The currency movements contain signed deltas and resulting balances. Money fields are exact decimal strings in millionths. Optional withholding fields are `null` with the eight-column gross format.

Connect to `/v1/dividends/ledger/stream` for the same page shape. Reconnect using the last accepted page's `next_offset` with the same reports and cutoff. The unary gRPC method `marketweft.research.v1.Research/GetDividendLedger` returns one matching page. The transports share screen authorization, admission and audit. [Protobuf schema](../apps/research-service/proto/research.proto) · [Read-only MCP](local-mcp-research.md#dividend-ledger)

## Listing downside risk

Send `POST /v1/risk/listings/downside` with a screen bearer credential. Supply `membership_csv`, `prices_csv`, `left_listing_id`, `right_listing_id`, `from_at`, `through_at`, `known_at`, `interval_seconds` and `window_periods`. The reports accept up to 1 MiB and 2 MiB respectively. Use distinct listing IDs and whole-second UTC cutoffs, with the end on the chosen grid. `volatility_periods` defaults to one. [How downside deviation is calculated](listing-risk.md#downside-deviation)

Each page echoes the inputs that define the risk windows. It gives `total_windows`, `offset`, `next_offset` and its `rows`. Each row has UTC start and end in Unix seconds, each listing’s available returns and losses, common coverage, volatility, correlation and downside deviation. Volatility and downside deviation are fractional returns. A missing metric is `null`, and a computed zero is numeric zero. Set `limit` from 1 to 1,000, with a default of 200. Pass `next_offset` with the same inputs to continue.

Connect to `/v1/risk/listings/downside/stream` to stream REST-shaped pages. On reconnect, send `next_offset` from the last accepted page. The unary gRPC method `marketweft.research.v1.Research/GetListingDownsideRisk` returns one matching page with optional metrics. Both use the screen credential and the same admission and audit rules as REST. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Portfolio currency conversion

Send `POST /v1/portfolio/fx` with a screen bearer credential. Supply the contents of the FX report in `rates_csv`, the three-letter uppercase `reporting_currency` and exact UTC `effective_at` and `known_at` cutoffs. Use `amounts` to send one `currency` and `subtotal_ticks` object per source currency. Subtotals are signed 128-bit integer millionths sent as decimal strings. The report accepts up to 1 MiB and 10,000 rate observations. [Portfolio FX inputs and rate selection](portfolio-replay.md#portfolio-currency-translation)

Each page echoes the cutoffs and reports the known converted subtotal across all supplied currencies. Rows are sorted by source currency. Each row carries the source subtotal, any converted amount and the exact rate evidence used, including the currency pair, effective and observation times, and reciprocal flag. Money and rates are decimal strings in millionths. Quote times use whole Unix seconds. Identity conversions have a value and a `null` rate. Missing conversions have `null` for both. Use `limit` from 1 to 1,000 with a default of 200. Pass `next_offset` with the same query to continue.

Connect to `/v1/portfolio/fx/stream` with the screen credential and send the REST query as one text frame. Each page matches its REST equivalent. On reconnect, use the last accepted `next_offset` to resume. Use `wss` on the configured private TLS listener. The unary gRPC method `marketweft.research.v1.Research/GetPortfolioFx` uses the same screen credential in `authorization` metadata and preserves absent quotes and converted values through optional fields. The same admission controls, managed quotas and audit receipts apply to all three transports. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Equity concentration

Send `POST /v1/portfolio/equity-concentration` with a screen bearer credential and the membership, holdings and close CSV contents. Supply `effective_at` and `known_at` as exact UTC timestamps. The membership CSV accepts up to 1 MiB, and each holdings or closes CSV accepts up to 2 MiB. Both cutoffs apply before ranking marks by absolute value within the original quote currency. [Equity concentration method and fixture](portfolio-replay.md#equity-concentration)

Each page contains `total_rows`, `offset`, `next_offset`, both cutoffs and its `rows`. A row carries the `listing_id`, quote currency, known gross for that currency, signed share value, rank and weight. The `gross_mark_ticks` and `mark_ticks` values are decimal strings in currency millionths. The `weight_micros` decimal string uses millionths of a percentage point. Unavailable values are `null`. Set `limit` between 1 and 1,000. The default is 200. Continue with the same input and `next_offset` until it is `null`.

Connect to `/v1/portfolio/equity-concentration/stream` with the same screen credential and send one copy of the REST request in a JSON text frame. The socket streams REST-shaped pages and closes after the last. The gRPC method `marketweft.research.v1.Research/GetEquityConcentration` returns one typed page over HTTP/2 and uses the screen bearer token in `authorization` metadata. Shared screen admission, quota and audit rules apply. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## Equity target drift

Send `POST /v1/portfolio/equity-target-drift` with a screen bearer credential. Provide CSV text in `membership_csv`, `holdings_csv`, `prices_csv` and `targets_csv`. Include `terms_csv` if you have delisting terms. Membership and terms each accept up to 1 MiB. Holdings, closes and targets each accept up to 2 MiB. Supply independent `effective_at` and `known_at` timestamps in UTC at whole-second precision. [Equity target inputs and fixture](portfolio-replay.md#equity-allocation-targets)

Each page echoes both cutoffs and carries `total_rows`, `offset`, `next_offset` and `rows` in quote currency and listing order. Each row shows whether the listing is present in the equity report, the available actual weight, the latest visible target and the signed drift. Weights and drift are decimal strings in millionths of a percentage point. A missing mark leaves the actual weight and drift empty. The target evidence carries effective and observation times as Unix seconds. A withdrawal retains both times and has a `null` weight. A zero weight or drift is `"0"`. Set `limit` between 1 and 1,000 (default 200) and pass `next_offset` with the same inputs to continue.

Connect to `/v1/portfolio/equity-target-drift/stream` with the same credential and send one REST-shaped query. The socket streams the pages in offset order. The gRPC method `marketweft.research.v1.Research/GetEquityTargetDrift` returns one typed page. The screen scope, admission and audit rules apply to all three transports. [Research Protobuf schema](../apps/research-service/proto/research.proto)

## WebSocket streaming

Connect to `ws://127.0.0.1:4174/v1/formula/stream` or `ws://127.0.0.1:4174/v1/universe/screen/stream`, using the port printed by the service. Use a client that can set the `Authorization: Bearer <token>` header on the upgrade request. Each path requires the same scope as its REST equivalent. Option snapshots also have a stream at `/v1/options/snapshot/stream` under the options scope. The Host and Origin checks apply to the upgrade.

Send one JSON text message using the corresponding REST request fields. The service evaluates the query once and streams ascending offsets in text messages. Each message has `type: "page"` and a `page` object shaped like the REST response. A failure after upgrade has `type: "error"` with numeric `status` and a string `error`.

Keep the `next_offset` from the last fully received and accepted page. If the connection ends before the terminal page, reconnect with the same query, CSV data and cutoffs. Set `offset` to that saved `next_offset`. The new connection recomputes the results from those inputs. A null `next_offset` marks completion.

Send the query within five seconds. The message limit is 16 MiB and delivery has a 30-second deadline after the query arrives.

### Stream rank comparisons

Connect to `/v1/universe/rank-comparison/stream` on the configured WebSocket listener with the same screen credential used for REST. Use `wss` on the TLS listener and provide its exact origin if your client sends an Origin header. After upgrade, send the same JSON body as the [REST rank comparison](#compare-universe-ranks) in one text message.

The service computes both rankings once and sends a `type: "page"` message for each page in listing ID order. Its `page` object matches REST, including exact prices and both membership observations. Reconnect with the same query and the last received `next_offset` as `offset` to continue after a disconnect. If a query is invalid, the server sends an error frame and closes the connection. You can reconnect with corrected fields.

## gRPC research

Use a Protobuf client over HTTP/2 at the printed service address. The default loopback listener uses plaintext HTTP/2. Generate the client from `apps/research-service/proto/research.proto` in the repository or `proto/research.proto` in the Linux archive.

| Unary method in `marketweft.research.v1.Research` | Required scope |
| --- | --- |
| `EvaluateFormula` | `MARKETWEFT_FORMULA_TOKEN` |
| `GetMonthlyReturns` | `MARKETWEFT_FORMULA_TOKEN` |
| `GetMacroCalendar` | `MARKETWEFT_FORMULA_TOKEN` |
| `ScreenUniverse` | `MARKETWEFT_SCREEN_TOKEN` |
| `CompareUniverseRanks` | `MARKETWEFT_SCREEN_TOKEN` |
| `GetPortfolioScenarios` | `MARKETWEFT_SCREEN_TOKEN` |
| `GetPortfolioFx` | `MARKETWEFT_SCREEN_TOKEN` |
| `GetEquityConcentration` | `MARKETWEFT_SCREEN_TOKEN` |
| `SnapshotOptions` | `MARKETWEFT_OPTIONS_TOKEN` |
| `ValueAmericanOption` | `MARKETWEFT_OPTIONS_TOKEN` |

Send the bearer token as `authorization` metadata. Reuse the same query and its data and cutoffs with `offset` set to the previous page’s `next_offset`. An absent `next_offset` marks the last page. The schema uses optional fields for unavailable formula values, ranks and close observations, and strings for exact ticks and returns. The server caps each Protobuf message at 16 MiB and applies a 15-second deadline to each call.

### Rank comparisons over gRPC

Call `CompareUniverseRanks` with a `RankComparisonQuery` using the same screen credential and cutoff fields as REST. The service returns a `RankComparisonPage` and projects the same independently ranked snapshots to each page. Both leg messages are present on each row. An unavailable membership field, rank, price or rank movement is absent. Prices and returns keep exact decimal text, including returns beyond the signed 64-bit range.

Use the returned `next_offset` to request another page with the same data and cutoffs. The max page size is 1,000 and the max offset is 5,000. Use HTTP/2 over TLS with the configured certificate trust and a managed screen credential on private deployments. [Protobuf schema](../apps/research-service/proto/research.proto) · [REST rank comparison](#compare-universe-ranks).

## SQLite audit receipts

To enable the audit trail, set `MARKETWEFT_RESEARCH_AUDIT_DB` to a database file in a private local directory before starting the service. On first use, the service creates and versions the database. Start with the same path to retain the receipt history across restarts.

Each admitted research request records only its receipt ID, transport, formula, screen or options scope, UTC timestamps and outcome. Authentication and capacity checks precede admission. The service records the admission before evaluating the query. A receipt with an empty outcome and finish time identifies an admission without a recorded conclusion, such as one interrupted by a process exit. A WebSocket receipt covers the stream until it closes.

Open the ledger with the SQLite command-line tool to read the receipts.

```sh
sqlite3 -readonly "$MARKETWEFT_RESEARCH_AUDIT_DB" 'SELECT receipt_id, transport, scope, started_at, finished_at, outcome FROM research_receipts ORDER BY receipt_id;'
```

If SQLite cannot write a receipt, REST and WebSocket upgrades return HTTP 503 and gRPC returns `Unavailable`. An upgraded WebSocket returns an error frame when finalizing its receipt fails. An interrupted admission keeps its original receipt ID.

## Audit backup and recovery

Use the standalone service executable to snapshot a running ledger and restore it to a fresh path.

```sh
./marketweft-research-service audit backup research-audit.sqlite snapshot.sqlite
./marketweft-research-service audit restore snapshot.sqlite recovered-audit.sqlite
```

Both commands report the verified receipt and unfinished counts. SQLite reads a consistent snapshot of committed data, verifies the destination and publishes a single file. Choose unused destination paths, including their SQLite sidecar names. To resume service with recovered data, start it with `MARKETWEFT_RESEARCH_AUDIT_DB` set to the recovered file. The next receipt follows the restored sequence.

## Concurrency and retries

The service shares two active research slots across REST, WebSocket and gRPC by default. Set `MARKETWEFT_RESEARCH_SLOTS` from 1 to 8 to change the local limit. A slot covers request intake and computation or delivery, including any enabled audit receipt.

When all slots are occupied, REST requests and WebSocket upgrades receive HTTP 429 with `Retry-After: 1`, and gRPC calls receive `ResourceExhausted`. Retry the same query after capacity returns. Preserve the original datasets, time cutoffs and last accepted `next_offset` when resuming a page.

## Managed research credentials

An operator can issue an individual `formula` or `screen` credential from the standalone executable. Supply a lifetime from one to 86,400 seconds.

```sh
./marketweft-research-service credential issue research-credentials.sqlite formula 3600
export MARKETWEFT_RESEARCH_CREDENTIALS_DB="$PWD/research-credentials.sqlite"
./marketweft-research-service
```

The issue command accepts the `formula`, `screen` and `options` scopes. It prints the bearer token once with its credential ID, scope and expiration as JSON. Transfer the token to the authorized client. The SQLite database stores its SHA-256 digest and lifecycle fields. The service opens the database read-only and can use managed credentials alone or alongside static tokens. An administrative issue or revoke operation upgrades a version 1 store to version 2 in a transaction and preserves the existing credentials. Keep the credential store in a private local directory.

Set `CREDENTIAL_ID` to the issued ID to revoke it while the service is running.

```sh
./marketweft-research-service credential revoke research-credentials.sqlite "$CREDENTIAL_ID"
```

Expiration and revocation take effect on the next REST or gRPC call or WebSocket upgrade. An admitted WebSocket stream has the normal query and delivery deadlines.

## Durable research quotas

Set `MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE` to an integer from 1 to 100,000 to enable a limit per managed credential each UTC minute. Use only managed credentials and supply an on-disk `MARKETWEFT_RESEARCH_AUDIT_DB`. REST requests, accepted WebSocket upgrades and gRPC calls share the same budget for that credential. Each new UTC minute starts a new allowance. A backward clock step retains the recorded window.

```sh
export MARKETWEFT_RESEARCH_CREDENTIALS_DB="$PWD/research-credentials.sqlite"
export MARKETWEFT_RESEARCH_AUDIT_DB="$PWD/research-audit.sqlite"
export MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE=30
./marketweft-research-service
```

The audit transaction reserves an admission and writes its receipt together. An admitted request spends one credit even when the computation rejects it, times out or disconnects. Exhausted calls return HTTP 429 with `Retry-After`, or gRPC `ResourceExhausted` with `retry-after` metadata. The retry delay is in seconds. The operations listener counts quota denials separately from busy workers and audit errors.

Quota state lives in the audit database and follows its snapshot and restore workflow. Multiple service processes using the same audit database share the same allowance. Meter rows contain the public credential ID, the current UTC minute and the admission count. Audit receipts retain the transport, scope and outcome.

### Enable quotas in private deployments

For the supplied Compose layout, export the quota before updating the research service. An unset or empty value leaves the quota disabled.

```sh
export MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE=30
docker compose -f apps/research-service/deploy/compose.yaml up -d --wait research
```

For the supplied Kubernetes layout, create or update the optional `research-admission` ConfigMap, then restart the deployment to read the new value.

```sh
kubectl -n marketweft-research create configmap research-admission \
  --from-literal=quota-per-minute=30 --dry-run=client -o yaml \
  | kubectl -n marketweft-research apply -f -
kubectl -n marketweft-research rollout restart deployment/marketweft-research
kubectl -n marketweft-research rollout status deployment/marketweft-research
```

The quota uses the existing writable audit volume and read-only credential volume. Clients continue to connect through the private TLS listener. A direct quota check can use two credentials for the same scope. After the first spends its allowance, it receives 429 with a retry delay while the second can still query.

## Localhost TLS

Set `MARKETWEFT_RESEARCH_TLS_CERT` to a PEM certificate chain and `MARKETWEFT_RESEARCH_TLS_KEY` to its matching PEM private key. Supply both paths before starting the service. Use a certificate valid for `127.0.0.1` and configure clients to trust its issuing CA.

The service prints the HTTPS address it bound. Use that authority for REST and gRPC, and use `wss://` for WebSocket. Supply the HTTPS origin when a client sends an Origin header. The same scopes, admission limits and audit settings apply.

## Private-interface research

To serve a separate client on a private network, set `MARKETWEFT_RESEARCH_BIND_IP` to a specific private IPv4 address assigned to the server. Set `MARKETWEFT_RESEARCH_AUTHORITY` to the lower-case name or that same private address, with the configured research port. Use port 443 for the default HTTPS authority without a port suffix.

Private-interface operation requires the TLS certificate and key and a managed credential database. The certificate must cover the advertised host, and each client must trust its issuing CA. Use managed credentials for the formula, screen and options scopes. Static environment tokens are for loopback listeners.

The server prints the advertised HTTPS address and only listens on the selected interface. Clients must use its authority and scheme. Optional SQLite audit receipts record admitted research on the private listener.

## Research OCI image

Download the `research-oci-linux-x64-attempt-N` GitHub Actions artifact and extract its OCI archive. Import it with `docker load --input "$OCI_ARCHIVE"`. The imported tag is `marketweft-research:<version>`. The archive uses a pinned Debian base and includes the service license, dependency notices and Protobuf schema.

Run the service as its configured UID and GID 65532. Use a read-only root filesystem, drop Linux capabilities and set `no-new-privileges`. Mount the managed database read-only at `/var/lib/marketweft/credentials` and give the service a separate writable audit volume at `/var/lib/marketweft/audit`. Issue or revoke credentials with a separate invocation that can write to the credentials volume. For private-interface service, mount the certificate and key read-only and configure the advertised authority as described above.

The default listener is localhost inside the container. Use the private bind settings to reach it from a separate client on a private container network.

## Private Docker Compose deployment

The source includes `apps/research-service/deploy/compose.yaml`. It binds research to a fixed IPv4 address on an internal network and applies the OCI image's non-root runtime settings. A separate operator service can write the credential volume with networking disabled. The running service reads that volume and writes receipts to its distinct audit volume.

Set `MARKETWEFT_RESEARCH_IMAGE` to the imported image tag. Select an available private CIDR in `MARKETWEFT_RESEARCH_SUBNET`, an address within it in `MARKETWEFT_RESEARCH_BIND_IP` and the certificate's DNS name in `MARKETWEFT_RESEARCH_HOST`. Set `MARKETWEFT_RESEARCH_TLS_DIRECTORY` to an existing host directory containing `tls.crt` and `tls.key`, readable by the service user. The port defaults to 4174.

From the repository root, issue a credential and start the service.

```sh
docker compose -f apps/research-service/deploy/compose.yaml run --rm credential-admin credential issue /var/lib/marketweft/credentials/credentials.sqlite formula 3600
docker compose -f apps/research-service/deploy/compose.yaml up -d --wait research
```

Connect a client to the project's internal network. Trust the configured CA and use the HTTPS authority printed by the service. To snapshot the audit ledger into its persistent volume, run the following command.

```sh
docker compose -f apps/research-service/deploy/compose.yaml exec research marketweft-research-service audit backup /var/lib/marketweft/audit/audit.sqlite /var/lib/marketweft/audit/snapshot.sqlite
```

Restore to a fresh filename in that volume and recreate the research container with the restored file.

```sh
docker compose -f apps/research-service/deploy/compose.yaml exec research marketweft-research-service audit restore /var/lib/marketweft/audit/snapshot.sqlite /var/lib/marketweft/audit/recovered.sqlite
export MARKETWEFT_RESEARCH_AUDIT_FILE=recovered.sqlite
docker compose -f apps/research-service/deploy/compose.yaml up -d --wait research
```

## Private Kubernetes deployment

Render `apps/research-service/deploy/kubernetes` with `kubectl kustomize`. The base uses one Linux x64 research replica, a ClusterIP service, separate credential and audit claims, and a policy that admits only authorized client pods in the same namespace. Use a CNI that enforces Kubernetes NetworkPolicy.

Set `KUBE_CONTEXT` to your private cluster context. The manifest imports no image over the network. Load the matching OCI image on each eligible Linux x64 worker, or use a Kustomize overlay that supplies a private registry image and pull policy. Use a storage class suitable for SQLite with ReadWriteOnce volumes.

Create the namespace, storage claims and TLS secret before starting the deployment.

```sh
layout=apps/research-service/deploy/kubernetes
kubectl --context "$KUBE_CONTEXT" apply -f "$layout/namespace.yaml"
kubectl --context "$KUBE_CONTEXT" -n marketweft-research apply -f "$layout/storage.yaml"
kubectl --context "$KUBE_CONTEXT" -n marketweft-research create secret tls research-tls --cert=tls.crt --key=tls.key
```

Use a certificate valid for `marketweft-research.marketweft-research.svc.cluster.local`. For a cluster with a custom DNS suffix, patch the advertised authority and certificate together. Mount the `research-credentials` claim in a short-lived operator pod and run `marketweft-research-service credential issue` to create `credentials.sqlite` at the root of that volume. Mount the claim read-write for the operator and run the operator process as UID and GID 65532. Delete the operator pod when credentials are provisioned. The research pod reads this claim and writes its audit ledger to a separate claim.

```sh
kubectl --context "$KUBE_CONTEXT" apply -k "$layout"
kubectl --context "$KUBE_CONTEXT" -n marketweft-research rollout status deployment/marketweft-research
```

Connect from a same-namespace client pod labeled `marketweft-research-access=authorized`. Use the service DNS authority, trust the certificate issuer and send a managed formula or screen token. Restrict who can create or relabel pods in this namespace.

Run the audit backup and restore commands in the research pod using fresh destination paths on the audit volume. Then change the Deployment to use the recovered file and wait for the rollout. Persist the environment change in your overlay before applying it again.

```sh
kubectl --context "$KUBE_CONTEXT" -n marketweft-research exec deployment/marketweft-research -- marketweft-research-service audit backup /var/lib/marketweft/audit/audit.sqlite /var/lib/marketweft/audit/snapshot.sqlite
kubectl --context "$KUBE_CONTEXT" -n marketweft-research exec deployment/marketweft-research -- marketweft-research-service audit restore /var/lib/marketweft/audit/snapshot.sqlite /var/lib/marketweft/audit/recovered.sqlite
kubectl --context "$KUBE_CONTEXT" -n marketweft-research set env deployment/marketweft-research MARKETWEFT_RESEARCH_AUDIT_DB=/var/lib/marketweft/audit/recovered.sqlite
kubectl --context "$KUBE_CONTEXT" -n marketweft-research rollout status deployment/marketweft-research
```

## Loopback health and metrics

Set `MARKETWEFT_RESEARCH_OPERATIONS_PORT` to enable a separate HTTP listener on `127.0.0.1`. The default leaves the listener disabled. With Docker Compose or Kubernetes, set the variable in the research process environment and access the port from its container or pod network namespace.

```sh
export MARKETWEFT_RESEARCH_OPERATIONS_PORT=4175
curl --fail http://127.0.0.1:4175/healthz
curl --fail http://127.0.0.1:4175/metrics
```

`/healthz` returns `ok` when the operations listener is responding. It checks process liveness. Research can still return overload or storage errors while the process is alive.

`/metrics` reports nine Prometheus counters. `admitted` counts research requests accepted across REST, WebSocket and gRPC. `busy` counts rejections at a full admission limit. `quota_denied` counts requests refused after exhausting a credential's allowance. `audit_errors` counts failures when starting or finishing a receipt. The other counters report completed, rejected, timed out, interrupted and failed admitted requests. A failed audit write at completion counts as a failed admission outcome. Counter names start with `marketweft_research_` and end with `_total`.

The response contains aggregate counts without request values, identities or credential material. Counters reset when the process restarts. SQLite audit receipts retain their existing persistence behavior.

## Controlled shutdown

On Unix, SIGTERM or SIGINT starts a controlled shutdown. On Windows, Ctrl+C or Ctrl+Break starts the same process. MarketWeft closes admission immediately. REST and WebSocket upgrades return HTTP 503 while draining, and gRPC reports `Unavailable`.

Admitted work retains its slot and may finish during the drain. The default deadline is five seconds. Set `MARKETWEFT_RESEARCH_SHUTDOWN_SECONDS` from 1 to 30 to change it. The supplied Compose and Kubernetes manifests allow 35 seconds for the process to exit.

Audit updates committed before exit survive a restart. A receipt whose outcome was still pending at exit remains unfinished for inspection in the ledger.

## Recover audit in a separate Compose project

Make a verified SQLite snapshot in the source project and copy the file to a private transfer directory. Set `SOURCE_PROJECT` to the source Compose project name.

```sh
layout=apps/research-service/deploy/compose.yaml
docker compose -p "$SOURCE_PROJECT" -f "$layout" exec research marketweft-research-service audit backup /var/lib/marketweft/audit/audit.sqlite /var/lib/marketweft/audit/transfer.sqlite
docker compose -p "$SOURCE_PROJECT" -f "$layout" cp research:/var/lib/marketweft/audit/transfer.sqlite ./transfer.sqlite
```

Configure the destination project's certificate, private address and managed credentials independently. Give it a new Compose project name in `RECOVERY_PROJECT`. If both projects run on the same Docker host, assign them distinct private subnets. Make the snapshot readable by UID 65532 for the restore.

Before starting the destination service, restore the snapshot to the new audit volume. The operator container has networking disabled. The restore verifies the receipt count and requires a fresh destination path. Start research with the restored file selected.

```sh
docker compose -p "$RECOVERY_PROJECT" -f "$layout" run --rm --no-deps --volume "$PWD/transfer.sqlite:/transfer/snapshot.sqlite:ro" audit-admin audit restore /transfer/snapshot.sqlite /var/lib/marketweft/audit/audit.sqlite
export MARKETWEFT_RESEARCH_AUDIT_FILE=audit.sqlite
docker compose -p "$RECOVERY_PROJECT" -f "$layout" up -d --wait research
```

The destination continues the receipt sequence from the snapshot.

## Verify a portable audit snapshot

Run `audit verify` on the single SQLite file produced by `audit backup`. The command checks the application ID, audit schema version and SQLite integrity. Versions 1, 2 and 3 can be verified or copied. Starting the service upgrades an older audit database to version 3 and preserves receipt IDs and their sequence. Version 3 includes the quota usage table. The verification command prints the exact file length, SHA-256 digest, total receipt count and unfinished count as JSON.

```sh
./marketweft-research-service audit verify ./transfer.sqlite
```

Compare the digest with a trusted value recorded at the source. Verification reads the original file and uses a private temporary copy so the digest describes the bytes that passed the database checks. Provide temporary disk space for a copy of the snapshot. A live WAL database, a snapshot with SQLite sidecars and an invalid audit database fail verification.

In the destination Compose project, run the same check on the read-only transfer mount before restoring.

```sh
docker compose -p "$RECOVERY_PROJECT" -f "$layout" run --rm --no-deps --volume "$PWD/transfer.sqlite:/transfer/snapshot.sqlite:ro" audit-admin audit verify /transfer/snapshot.sqlite
```

## Restore with a trusted SHA-256 digest

Set `EXPECTED_SHA256` to the digest recorded when the source snapshot was verified. Append `--sha256` to the restore command to require that exact digest before the destination file is created.

```sh
./marketweft-research-service audit restore ./transfer.sqlite ./recovered.sqlite --sha256 "$EXPECTED_SHA256"
```

The command restores from the private copy it verified. A valid SQLite file with a different digest fails without creating the destination or its sidecars. Supply a fresh destination and temporary disk space for the verified copy.

## Research readiness

On the optional operations listener, `/readyz` reports whether admission has capacity at the time of the check. It returns HTTP 200 with `ready` while the process is accepting research, a worker slot is free and the configured audit store can acquire its SQLite write lock.

```sh
curl -i http://127.0.0.1:4175/readyz
```

The route returns HTTP 503 with `busy`, `draining`, `audit unavailable` or `audit probe busy`. The audit check allows one probe at a time and rolls back without adding a receipt. `/healthz` continues to report process liveness. `/readyz` reflects the current state and reserves no worker slot.


## Option chain snapshots

Post JSON to `/v1/options/snapshot` with the bearer token for the `options` scope. For loopback, set `MARKETWEFT_OPTIONS_TOKEN` to a separate token before starting the process. For a private TLS deployment, issue an `options` credential against the service's credential database.

Send `underlying_csv` and `quotes_csv` as UTF-8 file contents and supply independent `effective_at` and `known_at` UTC timestamps. Each CSV is limited to 2 MiB. `max_age` is a whole number of seconds and defaults to 300 for both underlying and option quotes. Use `limit` and `offset` to page the visible contracts. The default is 200 contracts and the maximum page is 1,000. Repeat the same inputs with the returned `next_offset` for the next page.

The response provides both cutoffs, the instrument and currency, the selected underlying, and the visible option rows. Quotes carry exact tick amounts as strings, UTC quote and observation times, exercise style and a model status. An eligible European quote has analytics. A missing bid or ask and unavailable analytics are represented by `null`. Use the bundled option fixture to see the underlying move from USD 100 to USD 100.50 after its report appears, with the delayed American call visible at later knowledge cutoffs. [Option CSV formats and cutoffs](option-chain.md).


## American option valuations

Post the query to `/v1/options/american/valuation` under the `options` scope. Supply `underlying_csv`, `quotes_csv`, `contract_id`, `effective_at` and `known_at`. The maximum age `max_age` defaults to 300 seconds. The lattice size is set by `steps`, which accepts 1–256 and defaults to 128.

Supply `volatility` as an annual fraction to price the contract. An absent or null volatility solves the observed bid–ask midpoint. Supply `cash_dividends_csv` with up to 1 MiB of UTF-8 reports to apply distributions known by the cutoff with ex-dates after the effective time and at or before expiry. The response identifies both cutoffs, model status, currency, price, volatility and the reports used. Each report includes exact integer millionths per share as a decimal string and its announcement, ex-date, pay date and observation time in UTC seconds. An unavailable model has a status and null price and volatility.

With the sample April American 90-strike call, the 14:06 UTC revision carries USD 1 and USD 9 per share and gives 32.53% IV for the USD 16.234568 midpoint. Direct pricing at 25% gives USD 14.171952 at the same cutoffs. [Example inputs and replay cutoffs](option-chain.md#cash-dividend-implied-volatility).


## Option snapshots over WebSocket

Connect to `ws://127.0.0.1:4174/v1/options/snapshot/stream` with an `options` bearer token and send one text message containing the same JSON as the REST snapshot request. On a configured private TLS listener, use its advertised `wss://` URL and an issued options credential.

Each text response has a `type` of `page` and a `page` object with the same shape as REST. The connection closes after the last page. If it closes before you have received every page, reconnect and repeat the same CSVs, cutoffs, quote age and page size. Send the last received `next_offset` as `offset` to resume. When `next_offset` is null, the snapshot is complete. [REST snapshot schema and inputs](#option-chain-snapshots).


## Option snapshots over gRPC

Call the unary `SnapshotOptions` method with the `options` scope. Supply the underlying and quote CSV contents and independent effective and known UTC cutoffs. The response preserves quote and observation times, option analytics and precise decimal tick strings. Optional bids and asks distinguish an absent quote from zero. An unavailable model has an absent `analytics` message and a status code.

Omit `max_age` to accept quotes up to 300 seconds old. Send an explicit zero to require current quotes. Use each returned `next_offset` with the same data, cutoffs, maximum age and limit to retrieve the next page. An absent cursor marks the last page. [REST inputs and page fields](#option-chain-snapshots) · [Protobuf contract](../apps/research-service/proto/research.proto).


## American valuations over gRPC

Call the unary `ValueAmericanOption` method with the `options` scope. Supply the contract ID, underlying and option quote CSV contents, and the independent effective and known UTC cutoffs. Include cash-dividend CSV contents to apply dated reports. Omit `steps` to use 128 lattice steps, and omit `max_age` to use 300 seconds.

Omit `volatility` to solve the observed midpoint or set it explicitly to price the option at that annualized volatility, including zero. An unavailable model reports its status with absent `price` and `volatility`. Each applied dividend carries the source observation time, ex-date, payment date, currency and exact decimal amount per share. [REST model inputs and results](#american-option-valuations) · [Protobuf contract](../apps/research-service/proto/research.proto).
