# Local MCP research

MarketWeft exposes historical formulas, point-in-time universe screening, financial snapshots and option-chain snapshots through a local Model Context Protocol server. Install the Python SDK and configure your MCP client to start the server with the native research executable for your system. The subprocess communicates over standard input and output. [Python SDK](../packages/python-research/README.md) · [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

```json
{
  "mcpServers": {
    "marketweft": {
      "command": "python",
      "args": [
        "-m", "marketweft_research.mcp",
        "--engine", "/absolute/path/to/marketweft-research"
      ]
    }
  }
}
```

On Windows, use the absolute path to `marketweft-research.exe`. The configuration shown uses the common `mcpServers` format. Apply the same command and arguments in clients that use a different configuration format.

The read-only `evaluate_historical_formula` tool accepts CSV contents as `history_csv` and an expression as `formula`. To reproduce a cutoff, pass an inclusive UTC timestamp in seconds as `observed_through`. The optional `functions` field accepts ordered custom definitions. Tool arguments contain the supplied history, and the configured native executable performs the calculations. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Results include formula language version, total observed rows and a page of timestamped exact values. Each `value_ticks` is a decimal string denoting integer millionths, or `null` when unavailable. Reuse the same formula, inputs and cutoff with the returned `next_offset` to request another page. The default page contains at most 200 rows, with a maximum of 1,000. Requests are capped at 16 MiB per message. The formula and CSV keep their existing 2,048-byte and 8 MiB limits. The CLI accepts `--timeout` to set the native calculation deadline in seconds.

The read-only `screen_universe_as_of` tool accepts membership and price CSV contents and separate baseline, effective and known cutoffs. It returns the ordered members, selected close provenance and missing endpoints. [Universe screening through the research interfaces](research-universe-screen.md).

The server negotiates protocol revision 2025-11-25 during initialization. A malformed RPC request returns a protocol error. A rejected tool query leaves the connection ready for another request. [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).

## Financial snapshots

Use the read-only `financial_snapshot_as_of` tool. Supply `filings_csv`, the `issuer`, and independent `valuation_at` and `known_at` cutoffs in exact UTC. You can also supply `capitalization_csv`. Each CSV argument contains the file contents and is limited to 1 MiB of UTF-8 data.

The response contains the applied cutoffs, annual filing, exact capitalization observation, up to four selected quarters, trailing coverage and both sets of valuation multiples. Money and multiples are exact decimal strings representing integer millionths. Missing amounts are `null`. When trailing coverage is incomplete, the earnings and sales multiples are `null` and `trailing.kind` gives the reason. The latest known quarterly book value can still support P/B. [Financial statements and example cutoffs](financial-statements.md).


## Option chain snapshots

Call the read-only `option_snapshot_as_of` tool with `underlying_csv`, `quotes_csv`, `effective_at` and `known_at`. Send the CSV contents and exact UTC times. Each CSV can contain up to 2 MiB of UTF-8 data. `max_age` sets the quote age in seconds and defaults to 300 for both option and underlying quotes.

The response includes the applied cutoffs, underlying quote and a page of contracts. Quote and observation times are integer UTC seconds. Spot, strike, bid, ask, rate and yield are decimal strings representing exact millionths. A missing bid or ask is `null`. Options with no eligible quote at the cutoffs are absent. Visible contracts retain exercise style, source times and a status. The `analytics` object contains the European model values when available and is `null` otherwise.

Set `limit` for a page of 1–1,000 contracts. The default is 200. To continue, pass `next_offset` as `offset` with the same CSVs, cutoffs and quote age. With the example option cutoffs, the first underlying is USD 100, the delayed American call appears at 14:02 UTC, and the underlying becomes USD 100.50 at 14:03 UTC. [Option CSV inputs and demo cutoffs](option-chain.md).
