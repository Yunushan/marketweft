# Signed webhook delivery

Build the standalone research-service binary and run its explicit delivery command.

```text
marketweft-research-service webhook deliver config.json event.json signing-key.txt receipt.json
```

For HTTP, use a numeric loopback address and explicit port. For HTTPS, supply an explicit PEM trust bundle in `ca_certificate`. The key file contains 32 bytes encoded as 64 hexadecimal digits. The destination names the key separately so the receiver can select its corresponding secret.

```json
{"endpoint":"http://127.0.0.1:8082/alerts","key_id":"local-alerts"}
```

```json
{"endpoint":"https://alerts.example.test/marketweft","key_id":"office-alerts","ca_certificate":"receiver-ca.pem"}
```

A relative trust-bundle path resolves beside the configuration file. The client requires the receiver certificate to chain to the supplied trust anchor and match the hostname or IP in the URL. Certificate rejection produces a terminal `tls-rejected` receipt and sends no HTTP request body.

Supply the event as an explicit JSON file containing data you are authorized to deliver. Use distinct stable event IDs and UTC observation times.

```json
{
  "id": "demo:observed-candle:2026-01-12T14:01:00Z",
  "kind": "candlestick",
  "observed_at": "2026-01-12T14:02:00Z",
  "data": {"close_ticks": 6000000}
}
```

The request body is a JSON object with `version: 1` and an `event` object. The `X-MarketWeft-Key-Id` header identifies the key. Verify `X-MarketWeft-Signature` by computing HMAC-SHA-256 over the exact body bytes and comparing with the hexadecimal tag after `v1=`. Require the `Idempotency-Key` header to match the authenticated event ID. The receiver can use that ID to suppress duplicate deliveries after timeouts.

The command creates and flushes the requested receipt before the first network attempt. Choose a fresh receipt path for every explicit invocation. The receipt records each HTTP status, timeout or transport failure and omits URL query parameters, request data and signing keys. A 2xx status completes delivery. A 408, 429, 5xx, timeout or transport failure can be retried up to a total of three attempts. The sender sends the same body, signature and event ID each time. Other statuses end the attempt sequence. A terminal delivery failure returns a nonzero exit code.

The research HTTP server has no delivery route. Use the operator command to choose a destination and a single event.

## Resume a pending delivery

```text
marketweft-research-service webhook resume config.json event.json signing-key.txt receipt.json
```

The sender reserves each attempt in a version 2 receipt before sending. If the process stops during an attempt, `resume` records that attempt as interrupted and keeps it within the original three-attempt budget. An interrupted send may have reached the receiver. Use the authenticated event ID to suppress duplicates.

Pass the original event, destination, trust bundle and signing key. The sender checks the delivery digest before any connection. Both commands hold an exclusive lock beside the receipt while they run. A terminal receipt or an older version 1 receipt cannot be resumed.
