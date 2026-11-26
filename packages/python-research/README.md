# MarketWeft Python research SDK

Evaluate local OHLCV formulas with the native MarketWeft Rust engine. The Python client uses the standard library and starts a caller-selected engine executable for each request. The same wheel provides a read-only MCP server. [Local MCP research](../../docs/local-mcp-research.md).

Download the wheel from `python-research-sdk-attempt-N` and the engine executable for your OS and architecture from a matching `python-research-engine-*` artifact. Extract both archives. On Linux and macOS, run `chmod +x marketweft-research` after extraction. [GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml).

```sh
python -m pip install --no-index --no-deps ./marketweft_research-0.5.0-py3-none-any.whl
```

To use a source checkout, build the engine and install the Python client with Python 3.10 or later.

```sh
cargo build --locked --release -p marketweft-core --bin marketweft-research
python -m pip install ./packages/python-research
```

```python
from pathlib import Path
from marketweft_research import ResearchEngine

engine = ResearchEngine("./marketweft-research")
history = Path("history.csv").read_text(encoding="utf-8")
result = engine.evaluate_formula("close - sma(close, 3)", history)
for row in result.rows:
    print(row.observed_at, row.value)
```

On Windows, select `marketweft-research.exe`. A source build places the executable in `target/release`. The CSV header is `time,open,high,low,close,volume`. Each observation is labeled with the supplied bar timestamp in UTC seconds. Each value is an integer number of millionths or `None` when unavailable.

Pass `observed_through` as an inclusive UTC second to reproduce a prefix. Pass an ordered sequence of `FormulaFunction` definitions to scope custom names to one evaluation. The Rust engine validates recursive, future-looking and out-of-scope expressions and enforces formula and history limits. [Formula language](../../docs/time-series-language.md).

Call `screen_universe` with membership and prices CSV strings and exact baseline, effective and known UTC times. Each result retains membership and close provenance, with `None` for unavailable closes, ranks and returns. [Universe screening](../../docs/research-universe-screen.md).

## Financial snapshots

Call `financial_snapshot` with annual or mixed-period filings and an optional capitalization CSV. Supply an issuer and independent exact UTC valuation and knowledge timestamps.

```python
from pathlib import Path
from marketweft_research import ResearchEngine

engine = ResearchEngine("./marketweft-research")
snapshot = engine.financial_snapshot(
    Path("filings.csv").read_text(encoding="utf-8"),
    Path("capitalization.csv").read_text(encoding="utf-8"),
    issuer="DEMO-ALFA",
    valuation_at="2025-04-03T14:00:00Z",
    known_at="2025-04-03T14:22:00Z",
)
print(snapshot.trailing.revenue, snapshot.quarterly_valuation.price_sales)
```

Amounts and valuation multiples are integer millionths. Timestamps are whole UTC seconds. The snapshot carries the annual filing, exact capitalization, up to four known quarterly vintages, trailing flow values and both valuation bases. Each multiple reports a status when its denominator or capitalization is unavailable. Trailing flow multiples are `None` when the quarter set is incomplete, has a gap or overlaps, or mixes currencies. The coverage reason appears in `trailing.kind`. [Financial CSV formats and cutoffs](../../docs/financial-statements.md).

MCP clients can call the same calculation through the local `financial_snapshot_as_of` tool. [MCP financial snapshots](../../docs/local-mcp-research.md#financial-snapshots).

## Native protocol

`marketweft-research --version` prints the process protocol version. An evaluation sends one UTF-8 request to standard input. The first line contains these tab-separated fields in order.

| Field | Value |
| --- | --- |
| Identifier | `marketweft-research` |
| Protocol | `1` |
| Formula size | UTF-8 byte length of the expression |
| Library size | UTF-8 byte length of the optional function library |
| Cutoff | Signed whole UTC seconds or an empty field |

The next bytes contain the expression, the optional library and the CSV in that order. Each library function consists of a header with a name, comma-separated parameter names and a body byte length, separated by tabs and terminated by a newline. The exact body bytes follow that header. Functions can call definitions that appear earlier in the same library.

A successful response starts with the identifier, protocol version and formula language version separated by tabs. Each result line contains a UTC timestamp and an integer tick value separated by a tab. An empty value denotes an unavailable result. Response lines end with a newline. On failure, the executable exits with an error message on standard error.

### Financial snapshot protocol

Run `marketweft-research financial` with a UTF-8 request on standard input. The LF-terminated header contains `marketweft-financial`, `1`, the filing CSV byte length, the issuer ID, the valuation timestamp and the knowledge timestamp, all separated by tabs. Append the exact filing and capitalization CSV bytes consecutively. Supply the capitalization header alone when no capitalizations are available. Each CSV is limited to 1 MiB.

The response starts with `marketweft-financial`, protocol `1` and the issuer ID, then emits tab-delimited rows.

| Tag | Contents |
| --- | --- |
| `F`, `Q` | Annual and quarterly filings with source ID, fiscal start and end, publication and observation times, currency, revenue, common net income, common equity and operating cash flow. |
| `C` | Capitalization source ID, valuation time, observation time, currency and amount. |
| `R`, `U` | Annual and quarterly P/E, P/S and P/B in that order. A row contains `value` and its exact integer units or a status. |
| `T` | Trailing coverage. If `available`, the row includes the currency, revenue, common net income and operating cash flow. |

Blank amount fields denote missing amounts. Coverage statuses are `insufficient-quarters`, `noncontiguous` and `currency`. Multiple statuses are `missing-filing`, `missing-cap`, `currency`, `missing-denominator` and `nonpositive-denominator`. The two trailing flow multiples use `missing-quarters` whenever trailing coverage is unavailable. Every response row ends in LF.
