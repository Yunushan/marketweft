# trading-bot observation adapter

`@marketweft/trading-bot` 0.1.0 exposes four GET operations through the TypeScript client `TradingBotObserverV1`. An independently installed trading-bot service supplies the observations. The MarketWeft terminal and its local market data work without that service. The package has no runtime dependencies.

The integration baseline is upstream API 1.0.0 at commit `058d74c404eb119fb2b7a1f798a39a2031ec0608`. The service implements both versioned and legacy routes. The adapter uses the versioned routes exclusively. [Upstream API contract](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/apps/service-api/contracts/service-api-contract.json) · [FastAPI handlers](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/app/service/api/app.py)

| SDK method | Upstream endpoint | Returned observation |
| --- | --- | --- |
| `runtime()` | `/api/v1/runtime` | Service identity, standalone and desktop capability declarations, attached control-plane owner and execution scope |
| `status()` | `/api/v1/status` | Current lifecycle phase, upstream mode, active engine count, connector health and generation time |
| `account()` | `/api/v1/account` | Exchange, account type, total and available balance, reported currency, source and observation time |
| `portfolio()` | `/api/v1/portfolio` | Open positions, open and closed counts, reported balances, margin, P&L, source and observation time |

## Use from Node

From the MarketWeft root, run `npm ci` and `npm run build -w @marketweft/trading-bot`. The workspace package is available to Node and TypeScript consumers. Configure the **service origin** and any reverse-proxy path prefix. The client appends `/api/v1/...`.

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
  timeoutMs: 5000,
});
const { controlPlane } = await observer.runtime();
const snapshot = await observer.account();
console.log(controlPlane.scope, snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

Pass a service bearer token through trusted process configuration when the service requires authentication. The client keeps the token in memory. It rejects embedded URL credentials, query strings, fragments, redirects and remote plaintext HTTP. Browsers require same-origin routing or a separately authorized proxy because upstream declares no CORS origins. The terminal does not require or collect a token.

## Interpret observations

- The default standalone executor advertises `service-lifecycle-heartbeat`, with start and stop support and `trading_execution_supported=false`. In standalone read-only mode the service disables the executor and its control plane reports `intent-only`. With no observation provider, `/readyz` advertises `service-health-only`. Desktop capability flags describe a possible upstream topology. Inspect the attached control plane to establish the serving process's actual scope. [Runtime implementation](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/app/service/runtime.py) · [Read-only and HTTP contract tests](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/tests/test_service_api_http_contract.py)
- Account and portfolio `observedAt` preserve the upstream `generated_at` string, including timezone offset and fractional seconds. An empty string maps to `null`. A successful HTTP read, a healthy service or an empty positions array cannot establish freshness. Use each snapshot's own time to assess age. Separate requests can span account or configuration changes. [Freshness contract](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/apps/service-api/README.md) · [Upstream observation tests](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/tests/test_service_snapshot_observation_freshness.py)
- Unknown amounts remain `null`. Upstream's JSON floats are display observations with the precision supplied by the service. The SDK performs no ledger accounting. The portfolio endpoint supplies position details for open positions and only a count for closed positions. [Account schema](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/app/service/schemas/account.py) · [Portfolio schema](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/Languages/Python/app/service/schemas/positions.py)
- MarketWeft v1 has no order or control operation. The upstream project owns exchange credentials, broker adapters, operational preflight, connector evidence and incident recovery. Future execution work requires its own authorization and deterministic risk enforcement. A capability flag does not confer permission. [Preflight runbook](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/docs/OPERATIONAL_PREFLIGHT_RUNBOOK.md) · [Upstream connector evidence policy](https://github.com/Yunushan/trading-bot/blob/058d74c404eb119fb2b7a1f798a39a2031ec0608/docs/connector-support-matrix.json)

## Run the acceptance tests

`npm test -w @marketweft/trading-bot` builds the package and runs six local HTTP tests covering transport, authentication headers, timeout, schema errors, timestamps and unknown amounts.

The opt-in integration test needs Node 22+, a checkout of the upstream commit above, and a Python environment with the pinned upstream HTTP-service dependencies. The following commands assume a POSIX shell and a separate virtual environment. In PowerShell set the same variables using `$env:NAME = '...'`.

```sh
python -m pip install fastapi==0.143.0 starlette==1.7.0 uvicorn==0.54.0 cryptography==50.0.2
export MARKETWEFT_UPSTREAM_DIR=/absolute/path/to/trading-bot
export MARKETWEFT_UPSTREAM_PYTHON=/absolute/path/to/venv/bin/python
npm run test:upstream -w @marketweft/trading-bot
```

The harness creates a temporary profile, starts the upstream FastAPI application on an ephemeral loopback port with read-only mode enabled, and uses a disposable bearer token. It exercises an empty standalone process and a process containing timestamped synthetic snapshots injected before startup. The HTTP client reads all four endpoints in both cases. The test also checks the upstream local executor's heartbeat descriptor without starting a trading session. External broker connectivity, desktop-hosted accounts and live execution require separate evidence.

On 2026-11-25 all six SDK tests passed with Node 26.8.2 on Windows x64. Both upstream scenarios passed in a Linux x64 container with external networking disabled, read-only source mounts, Node 22.22.0 and Python 3.12.12.
