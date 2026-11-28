# Local MCP research

MarketWeft exposes historical formulas, point-in-time universe screening and rank comparisons, monthly returns, economic releases, portfolio scenarios, minimum-variance allocation, FX conversion, equity concentration, equity target drift, financial snapshots and option-chain snapshots through a local Model Context Protocol server. Install the Python SDK and configure your MCP client to start the server with the native research executable for your system. The subprocess communicates over standard input and output. [Python SDK](../packages/python-research/README.md) · [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

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

Call `compare_universe_ranks_as_of` to compare two snapshots using a shared baseline and independent effective and known cutoffs. Each page retains membership and close evidence for both snapshots and gives rank movement when both ranks are available. [Rank comparison arguments and pagination](research-universe-screen.md#compare-rank-snapshots).

The server negotiates protocol revision 2025-11-25 during initialization. A malformed RPC request returns a protocol error. A rejected tool query leaves the connection ready for another request. [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).

## Monthly returns

Call the read-only `monthly_returns_as_of` tool with `history_csv`, `first_year`, `last_year` and an inclusive `observed_through` in `YYYY-MM-DDTHH:MM:SSZ` format. Supply up to 8 MiB of UTF-8 OHLCV and a range of up to 30 consecutive UTC years. The native engine applies the same close selection and return calculation as the browser calendar. [Monthly returns calendar](chart-workspace.md#monthly-returns-calendar).

Each row includes the year, month, UTC window state, preceding close, current close and return. A close carries its UTC second as an integer and its price ticks as an exact decimal string. `percent_micros` is a decimal string in millionths of a percentage point. Unavailable closes and returns are `null`. Each response includes the applied years and cutoff, and the compatibility text carries the same data as the structured response. [MCP structured tool output](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

The default page contains up to 60 months. Set `limit` from 1 to 120, or pass `next_offset` as `offset` with the same source, years and cutoff. A `null` offset marks the last page. Rewind the cutoff to recover the original visible prices and return values.

## Economic releases

Call the read-only `macro_calendar_as_of` tool with the contents of an authorized economic calendar CSV in `csv`, plus `published_through` and `known_at` in exact `YYYY-MM-DDTHH:MM:SSZ` form. Each cutoff is inclusive. The native engine accepts up to 1 MiB and 10,000 source reports. [Economic calendar input and cutoff rules](macro-calendar.md)

The response echoes the cutoffs and includes `total_releases`, `total_rows`, `offset`, `next_offset` and `rows`. Each row carries the release, series and record IDs, unit, reference date, record kind, publication time, observation time and predecessor ID when available. Scheduled time is present on schedule rows. The numeric `value_ticks` field uses a signed decimal string in integer millionths or `null`. UTC fields in rows use whole Unix seconds.

Rows follow the calendar's release order. Within each release, the visible schedule and forecast precede its actual and revisions. Set `limit` from 1 to 250 evidence rows. The default is 100. Pass `next_offset` as `offset` with the same CSV and cutoffs to continue, including when a revision chain spans pages. A `null` offset marks the end. At the synthetic inflation release's 14:52 UTC observation cutoff, the revisions link `CPI-A0`, `CPI-A1` and `CPI-A2`, while the earlier 14:31:59 UTC cutoff has the schedule and forecast available. [Synthetic economic calendar](../crates/core/tests/fixtures/synthetic-macro-calendar.csv)

## Portfolio scenarios

Call the read-only `portfolio_scenarios_as_of` tool with `membership_csv` and `prices_csv` contents, plus `from_at`, `through_at`, and `known_at` as exact UTC timestamps. Set `allocations` to stable listing IDs and their weights in basis points. Send `interval_seconds`, `starting_value` as a decimal string, `fee_basis_points`, `seed` as an unsigned 64-bit decimal string, `paths`, and `horizon`. Omit `block_size` for independent moves or set it up to the number of moves per path. [Portfolio scenario inputs and sampling rules](portfolio-scenarios.md).

Each page echoes the dates, seed, horizon and block size. It reports complete return vectors, eligible blocks, listing coverage, loss paths and the 5th, 50th and 95th percentiles across all paths. Ending value and fees use decimal strings in millionths of portfolio currency. Drawdown uses decimal strings in millionths of the portfolio's peak value.

Path numbers start at 1. Use `limit` from 1 to 250, with a default of 100. Pass `next_offset` as `offset` with identical inputs to fetch the next page. A `null` offset marks the last page. The synthetic pair's three-move blocks give one eligible block at 14:06 UTC, four when the late close becomes known at 14:07, and two after the membership removal becomes known at 14:08. [Portfolio scenario fixture and cutoff example](portfolio-scenarios.md#research-sdks).

## Portfolio allocation

Call the read-only `portfolio_allocation_as_of` tool. Supply the contents of the membership and prices CSVs, a list of 2–16 stable IDs in `listing_ids`, exact UTC `from_at`, `through_at` and `known_at` cutoffs, and a whole positive `interval_seconds`. The result uses the same fields as the research service.

The tool returns common and per-listing coverage at every cutoff. With at least two common returns, it includes the sample metrics and weights as integer basis points. A missing sample or weight is `null`, and a computed zero is `0`. [Portfolio allocation service](local-rest-research.md#portfolio-allocation)

Pass the optional integer `maximum_weight_basis_points` to bound each listing's weight. The tool echoes the supplied ceiling, including on a coverage-only result.

## Portfolio currency conversion

Call the read-only `portfolio_fx_as_of` tool with `rates_csv` contents, a three-letter uppercase `reporting_currency`, and exact UTC `effective_at` and `known_at` cutoffs. Supply `amounts` as an array of source currency and `subtotal_ticks` objects. Send each currency once and use signed decimal strings in integer millionths for subtotals. The FX CSV accepts up to 1 MiB of UTF-8 data. [Portfolio FX inputs and rate selection](portfolio-replay.md#portfolio-currency-translation)

Every page echoes both cutoffs and shows the known converted subtotal across all currencies. Each row keeps the original subtotal, a converted amount when available, and the quote pair, source and observation times, rate and reciprocal flag when a supporting rate was used. Amounts and rates are decimal strings in millionths. Quote times use whole Unix seconds. An identity conversion has a converted amount and `null` rate. A missing conversion has `null` for both.

Set `limit` from 1 to 1,000 rows. The default is 200. Pass `next_offset` as `offset` with the same CSV, amounts and cutoffs until the offset is `null`. The sample FX report and subtotals of 70 USD and 225 EUR give a known subtotal of 70, 340 and 362.5 USD at 14:45, 14:46 and 14:49 UTC on 2025-06-02, with the effective cutoff fixed at 14:45. [Synthetic FX report](../crates/core/tests/fixtures/synthetic-portfolio-fx.csv)

## Equity concentration

Call the read-only `equity_concentration_as_of` tool with the contents of `membership_csv`, `holdings_csv` and `prices_csv`. Supply the two exact UTC cutoffs as `effective_at` and `known_at`. Use the returned `next_offset` with the same CSVs and cutoffs. `limit` ranges from 1 to 1,000 and defaults to 200. A `null` offset marks the final page.

Rows give the original quote currency, its known gross mark, the listing ID, signed share value, rank and weight. Amounts and weights use decimal strings in integer millionths. The tool preserves `null` for unavailable values and uses the same page fields as the research service. [Equity concentration service](local-rest-research.md#equity-concentration)

## Equity target drift

Call the read-only `equity_target_drift_as_of` tool with the membership, holdings, prices and targets CSV contents, optional `terms_csv`, and independent `effective_at` and `known_at` UTC cutoffs. Set `limit` from 1 to 1,000 (default 200) and reuse the same inputs with `next_offset` as `offset` until `next_offset` is `null`.

Each page uses the research service response fields. A row carries the stable listing ID and quote currency, equity presence, known actual weight, target evidence and signed drift. Weights and drift use exact decimal strings in millionths of a percentage point. The target report retains its two Unix-second timestamps when a withdrawal leaves its weight `null`. [Equity target service](local-rest-research.md#equity-target-drift)

## Financial snapshots

Use the read-only `financial_snapshot_as_of` tool. Supply `filings_csv`, the `issuer`, and independent `valuation_at` and `known_at` cutoffs in exact UTC. You can also supply `capitalization_csv`. Each CSV argument contains the file contents and is limited to 1 MiB of UTF-8 data.

The response contains the applied cutoffs, annual filing, exact capitalization observation, up to four selected quarters, trailing coverage and both sets of valuation multiples. Money and multiples are exact decimal strings representing integer millionths. Missing amounts are `null`. When trailing coverage is incomplete, the earnings and sales multiples are `null` and `trailing.kind` gives the reason. The latest known quarterly book value can still support P/B. [Financial statements and example cutoffs](financial-statements.md).


## Option chain snapshots

Call the read-only `option_snapshot_as_of` tool with `underlying_csv`, `quotes_csv`, `effective_at` and `known_at`. Send the CSV contents and exact UTC times. Each CSV can contain up to 2 MiB of UTF-8 data. `max_age` sets the quote age in seconds and defaults to 300 for both option and underlying quotes.

The response includes the applied cutoffs, underlying quote and a page of contracts. Quote and observation times are integer UTC seconds. Spot, strike, bid, ask, rate and yield are decimal strings representing exact millionths. A missing bid or ask is `null`. Options with no eligible quote at the cutoffs are absent. Visible contracts retain exercise style, source times and a status. The `analytics` object contains the European model values when available and is `null` otherwise.

Set `limit` for a page of 1–1,000 contracts. The default is 200. To continue, pass `next_offset` as `offset` with the same CSVs, cutoffs and quote age. With the example option cutoffs, the first underlying is USD 100, the delayed American call appears at 14:02 UTC, and the underlying becomes USD 100.50 at 14:03 UTC. [Option CSV inputs and demo cutoffs](option-chain.md).


## American option valuations

Call the read-only `american_option_valuation_as_of` tool with `underlying_csv`, `quotes_csv`, `contract_id`, `effective_at` and `known_at`. The optional `max_age` is in seconds and defaults to 300. The optional `steps` ranges from 1 to 256 and defaults to 128. Supply an annual `volatility` fraction to price the contract. Omit it to solve the observed bid–ask midpoint. For example, send `0.25` for 25% annual volatility.

Pass `cash_dividends_csv` to apply dividends known by the cutoff with an ex-date after the effective cutoff and at or before expiry. The cash CSV accepts up to 1 MiB of UTF-8 data. The response contains both cutoffs, the currency, model price, annual volatility and the applied cash reports. The report amounts are exact decimal strings representing millionths per share. Each report carries its announcement, ex-date, pay date and observation time in whole UTC seconds. An unavailable option has a status and `null` model values.

For the example April American 90-strike call, the USD 16.234568 midpoint yields 31.18% at the 14:04 UTC report and 32.53% after the 14:06 UTC revision. The revised result carries USD 1 and USD 9 cash reports. At 14:07 UTC only the USD 9 report remains. [Cash-dividend option fixtures and replay](option-chain.md#discrete-cash-dividends).
