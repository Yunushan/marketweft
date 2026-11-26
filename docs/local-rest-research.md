# Local research service

The Rust research service defaults to IPv4 loopback and exposes read-only formula and universe screening endpoints over REST, WebSocket and gRPC. It uses the same core that powers the native executable and WebAssembly terminal.

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

Use a Protobuf client over HTTP/2 at the printed service address. The default loopback listener uses plaintext HTTP/2. Generate the client from `apps/research-service/proto/research.proto` in the repository or `proto/research.proto` in the Linux archive.

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

## Localhost TLS

Set `MARKETWEFT_RESEARCH_TLS_CERT` to a PEM certificate chain and `MARKETWEFT_RESEARCH_TLS_KEY` to its matching PEM private key. Supply both paths before starting the service. Use a certificate valid for `127.0.0.1` and configure clients to trust its issuing CA.

The service prints the HTTPS address it bound. Use that authority for REST and gRPC, and use `wss://` for WebSocket. Supply the HTTPS origin when a client sends an Origin header. The same scopes, admission limits and audit settings apply.

## Private-interface research

To serve a separate client on a private network, set `MARKETWEFT_RESEARCH_BIND_IP` to a specific private IPv4 address assigned to the server. Set `MARKETWEFT_RESEARCH_AUTHORITY` to the lower-case name or that same private address, with the configured research port. Use port 443 for the default HTTPS authority without a port suffix.

Private-interface operation requires the TLS certificate and key and a managed credential database. The certificate must cover the advertised host, and each client must trust its issuing CA. Use managed credentials for the formula and screen scopes. Static environment tokens are for loopback listeners.

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

`/metrics` reports eight Prometheus counters. `admitted` counts research requests accepted across REST, WebSocket and gRPC. `busy` counts rejections at a full admission limit. `audit_errors` counts failures when starting or finishing a receipt. The other counters report completed, rejected, timed out, interrupted and failed admitted requests. A failed audit write at completion counts as a failed admission outcome. Counter names start with `marketweft_research_` and end with `_total`.

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

Run `audit verify` on the single SQLite file produced by `audit backup`. The command checks the application ID, audit schema version and SQLite integrity. It prints the exact file length, SHA-256 digest, total receipt count and unfinished count as JSON.

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
