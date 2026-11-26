# Local REST research service

The Rust research service runs on IPv4 loopback and exposes two read-only endpoints. It uses the same core that powers the native executable and WebAssembly terminal.

For Ubuntu 24.04 on Linux x64, download the `research-service-linux-x64-attempt-N` artifact from a successful GitHub verification run and unpack its enclosed tar.gz archive. Extract the service with its notices. Start it with `./marketweft-research-service` after configuring its environment as shown below. To build from source, use the same settings from the repository root and run the Cargo command.

Configure a separate random token for each scope you intend to use. At least one scope is required. Each token uses 32 random bytes encoded as 64 hexadecimal characters.

```sh
export MARKETWEFT_FORMULA_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export MARKETWEFT_SCREEN_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
cargo run --locked --manifest-path apps/research-service/Cargo.toml
```

The service prints the bound loopback address. The port defaults to 4174. Set `MARKETWEFT_RESEARCH_PORT` to change it, or use 0 for an automatically assigned port. Send `Authorization: Bearer <token>` and `Content-Type: application/json`. The request host must match the printed `127.0.0.1` authority. Same-origin requests can send that exact origin. The service reads tokens from its process environment.

| Method and path | Required scope | Request |
| --- | --- | --- |
| `POST /v1/formula` | `MARKETWEFT_FORMULA_TOKEN` | `formula`, `history_csv`, optional `observed_through` UTC seconds and ordered `functions` |
| `POST /v1/universe/screen` | `MARKETWEFT_SCREEN_TOKEN` | `membership_csv`, `prices_csv`, `baseline_at`, `effective_at` and `known_at` |

Both endpoints accept `offset` and `limit`. The default page contains up to 200 rows. Pages can contain at most 1,000 rows. Reuse the same query and apply `next_offset` to obtain the next page. A screen ranks the full effective universe before slicing the result.

The response carries exact integer values as decimal strings. Alongside each screen row the service returns the selected membership change and selected close observation timestamps. Missing prices and unavailable returns are `null`. [Research universe screening](research-universe-screen.md) · [Time-series formulas](time-series-language.md).

The service accepts at most 16 MiB per JSON body and reads each body within five seconds. Two requests can hold a research slot simultaneously. The server returns 429 when slots are occupied, 401 for missing or invalid tokens, 403 for a different scope or origin, and 422 for inputs rejected by the research engine.
