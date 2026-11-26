# Local MCP research

MarketWeft exposes historical formula evaluation through a local Model Context Protocol server. Install the Python SDK and configure your MCP client to start the server with the native research executable for your system. The subprocess communicates over standard input and output. [Python SDK](../packages/python-research/README.md) · [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

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

The server advertises a single read-only tool named `evaluate_historical_formula`. Supply the CSV contents as `history_csv` and the formula as `formula`. To reproduce a cutoff, pass an inclusive UTC timestamp in seconds as `observed_through`. The optional `functions` field accepts ordered custom definitions. Tool arguments contain the supplied history, and the configured native executable performs the calculations. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Results include formula language version, total observed rows and a page of timestamped exact values. Each `value_ticks` is a decimal string denoting integer millionths, or `null` when unavailable. Reuse the same formula, inputs and cutoff with the returned `next_offset` to request another page. The default page contains at most 200 rows, with a maximum of 1,000. Requests are capped at 16 MiB per message. The formula and CSV keep their existing 2,048-byte and 8 MiB limits. The CLI accepts `--timeout` to set the native calculation deadline in seconds.

The server negotiates protocol revision 2025-11-25 during initialization. A malformed RPC request returns a protocol error. A rejected formula returns a tool error and leaves the connection ready for another request. [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).
