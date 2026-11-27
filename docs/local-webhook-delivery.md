# Local webhook delivery

Build the standalone research-service binary and run its explicit delivery command.

```text
marketweft-research-service webhook deliver config.json event.json signing-key.txt receipt.json
```

The receiver URL must use HTTP with a numeric loopback address and explicit port. The key file contains 32 bytes encoded as 64 hexadecimal digits. The destination names the key separately so the receiver can select its corresponding secret.

```json
{"endpoint":"http://127.0.0.1:8082/alerts","key_id":"local-alerts"}
```

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
