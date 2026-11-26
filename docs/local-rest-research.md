# Local research service

The Rust research service runs on IPv4 loopback and exposes read-only formula and universe screening endpoints over REST, WebSocket and gRPC. It uses the same core that powers the native executable and WebAssembly terminal.

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
| `POST /v1/universe/screen` | `MARKETWEFT_SCREEN_TOKEN` | `membership_csv`, `prices_csv`, `baseline_at`, `effective_at` and `known_at` |

Both endpoints accept `offset` and `limit`. The default page contains up to 200 rows. Pages can contain at most 1,000 rows. Reuse the same query and apply `next_offset` to obtain the next page. A screen ranks the full effective universe before slicing the result.

The response carries exact integer values as decimal strings. Alongside each screen row the service returns the selected membership change and selected close observation timestamps. Missing prices and unavailable returns are `null`. [Research universe screening](research-universe-screen.md) · [Time-series formulas](time-series-language.md).

The service accepts at most 16 MiB per JSON body and reads each body within five seconds. The server returns 401 for missing or invalid tokens, 403 for a different scope or origin, and 422 for inputs rejected by the research engine.

## WebSocket streaming

Connect to `ws://127.0.0.1:4174/v1/formula/stream` or `ws://127.0.0.1:4174/v1/universe/screen/stream`, using the port printed by the service. Use a client that can set the `Authorization: Bearer <token>` header on the upgrade request. Each path requires the same scope as its REST equivalent. The Host and Origin checks apply to the upgrade.

Send one JSON text message using the corresponding REST request fields. The service evaluates the query once and streams ascending offsets in text messages. Each message has `type: "page"` and a `page` object shaped like the REST response. A failure after upgrade has `type: "error"` with numeric `status` and a string `error`.

Keep the `next_offset` from the last fully received and accepted page. If the connection ends before the terminal page, reconnect with the same query, CSV data and cutoffs. Set `offset` to that saved `next_offset`. The new connection recomputes the results from those inputs. A null `next_offset` marks completion.

Send the query within five seconds. The message limit is 16 MiB and delivery has a 30-second deadline after the query arrives.

## gRPC research

Use a Protobuf client over plaintext HTTP/2 at the printed IPv4 loopback address. Generate the client from `apps/research-service/proto/research.proto` in the repository or `proto/research.proto` in the Linux archive.

| Unary method in `marketweft.research.v1.Research` | Required scope |
| --- | --- |
| `EvaluateFormula` | `MARKETWEFT_FORMULA_TOKEN` |
| `ScreenUniverse` | `MARKETWEFT_SCREEN_TOKEN` |

Send the bearer token as `authorization` metadata. Reuse the same query and its data and cutoffs with `offset` set to the previous page’s `next_offset`. An absent `next_offset` marks the last page. The schema uses optional fields for unavailable formula values, ranks and close observations, and strings for exact ticks and returns. The server caps each Protobuf message at 16 MiB and applies a 15-second deadline to each call.

## SQLite audit receipts

To enable the audit trail, set `MARKETWEFT_RESEARCH_AUDIT_DB` to a database file in a private local directory before starting the service. On first use, the service creates and versions the database. Start with the same path to retain the receipt history across restarts.

Each admitted research request records only its receipt ID, transport, formula or screen scope, UTC timestamps and outcome. Authentication and capacity checks precede admission. The service records the admission before evaluating the query. A receipt with an empty outcome and finish time identifies an admission without a recorded conclusion, such as one interrupted by a process exit. A WebSocket receipt covers the stream until it closes.

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

The issue command prints the bearer token once with its credential ID, scope and expiration as JSON. Transfer the token to the authorized client. The SQLite database stores its SHA-256 digest and lifecycle fields. The service opens the database read-only and can use managed credentials alone or alongside static tokens. Keep the credential store in a private local directory.

Set `CREDENTIAL_ID` to the issued ID to revoke it while the service is running.

```sh
./marketweft-research-service credential revoke research-credentials.sqlite "$CREDENTIAL_ID"
```

Expiration and revocation take effect on the next REST or gRPC call or WebSocket upgrade. An admitted WebSocket stream has the normal query and delivery deadlines.
