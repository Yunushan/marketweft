from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from marketweft_research import ResearchEngine
from marketweft_research import mcp


ROOT = Path(__file__).resolve().parents[3]
CSV = (ROOT / "crates/core/tests/fixtures/synthetic-formula-bars.csv").read_text(encoding="utf-8")
EXPRESSION = "ema(if(close == 11, close / 0, close), 2)"
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))
INITIALIZE = {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {"name": "marketweft-test", "version": "1"},
}


def rpc(method: str, request_id=None, params=None) -> dict:
    request = {"jsonrpc": "2.0", "method": method}
    if request_id is not None:
        request["id"] = request_id
    if params is not None:
        request["params"] = params
    return request


def call(request_id, **arguments) -> dict:
    return rpc("tools/call", request_id, {
        "name": mcp.TOOL_NAME,
        "arguments": {"formula": EXPRESSION, "history_csv": CSV, **arguments},
    })


def wire(*requests: dict) -> bytes:
    return b"".join(json.dumps(request).encode("utf-8") + b"\n" for request in requests)


class McpTest(unittest.TestCase):
    def test_subprocess_negotiates_protocol_and_pages_exact_cutoff_results(self):
        end = 1743689040
        source = wire(
            rpc("tools/list", 0),
            rpc("initialize", "init", INITIALIZE),
            rpc("notifications/initialized"),
            rpc("tools/list", 1),
            call(2, observed_through=end, limit=2),
            call(3, observed_through=end, offset=2, limit=2),
            call(4, observed_through=end, offset=4, limit=2),
            rpc("ping", 5),
        )
        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=source, timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual([item["id"] for item in replies], [0, "init", 1, 2, 3, 4, 5])
        self.assertEqual(replies[0]["error"]["code"], -32002)
        self.assertEqual(replies[1]["result"]["protocolVersion"], "2025-11-25")
        tools = replies[2]["result"]["tools"]
        self.assertEqual([item["name"] for item in tools],
                         [mcp.TOOL_NAME, mcp.SCREEN_TOOL_NAME, mcp.FINANCIAL_TOOL_NAME, mcp.OPTION_SNAPSHOT_TOOL_NAME])
        self.assertTrue(tools[0]["annotations"]["readOnlyHint"])
        self.assertIn("outputSchema", tools[0])
        pages = [message["result"]["structuredContent"] for message in replies[3:6]]
        self.assertEqual([page["next_offset"] for page in pages], [2, 4, None])
        self.assertEqual([page["total_rows"] for page in pages], [5, 5, 5])
        rows = [row for page in pages for row in page["rows"]]
        self.assertEqual([row["value_ticks"] for row in rows], [None, "11000000", None, None, "14500000"])
        self.assertEqual(rows[-1]["observed_at"], end)
        self.assertEqual(json.loads(replies[5]["result"]["content"][0]["text"]), pages[-1])
        self.assertEqual(replies[6]["result"], {})

    def test_tool_and_protocol_errors_preserve_the_session(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))
        result = server.handle(call(2, formula="lag(close, -1)"))["result"]
        self.assertTrue(result["isError"])
        self.assertIn("literal window or lag", result["content"][0]["text"])
        self.assertEqual(server.handle(call(3, history_path="history.csv"))["error"]["code"], -32602)
        self.assertEqual(server.handle(call(4, limit=True))["error"]["code"], -32602)
        self.assertEqual(server.handle(rpc("resources/read", 5, {"uri": "file:///history.csv"}))["error"]["code"], -32601)
        definitions = [{"name": "plus", "parameters": ["x"], "body": "x + 0.000001"}]
        rows = server.handle(call(6, formula="plus(close)", functions=definitions, limit=1))
        self.assertEqual(rows["result"]["structuredContent"]["rows"][0]["value_ticks"], "10000001")
        self.assertTrue(server.handle(call(7, formula="plus(close)"))["result"]["isError"])

    def test_invalid_json_recovers_and_an_oversize_frame_ends_the_transport(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        read = BytesIO(b'{"x":NaN}\n' + wire(rpc("ping", 1)) + b"x" * 256 + b"\n" + wire(rpc("ping", 2)))
        write = BytesIO()
        with patch.object(mcp, "MAX_FRAME_BYTES", 128):
            mcp.run(server, read, write)
        replies = [json.loads(line) for line in write.getvalue().splitlines()]
        self.assertEqual([item["id"] for item in replies], [None, 1, None])
        self.assertEqual(replies[0]["error"]["code"], -32700)
        self.assertEqual(replies[2]["error"]["code"], -32600)

    def test_universe_tool_pages_missing_prices_and_reranks_at_later_knowledge(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))
        fixtures = ROOT / "crates/core/tests/fixtures"
        arguments = {
            "membership_csv": (fixtures / "synthetic-universe.csv").read_text(encoding="utf-8"),
            "prices_csv": (fixtures / "synthetic-universe-prices.csv").read_text(encoding="utf-8"),
            "baseline_at": "2025-06-02T14:00:00Z",
            "effective_at": "2025-06-02T14:10:00Z",
            "known_at": "2025-06-02T14:10:00Z",
        }

        def screen(request_id, **changes):
            request = rpc("tools/call", request_id, {"name": mcp.SCREEN_TOOL_NAME,
                                                    "arguments": {**arguments, **changes}})
            return server.handle(request)

        first = screen(2, limit=1)["result"]["structuredContent"]
        self.assertEqual(first["next_offset"], 1)
        self.assertEqual(first["rows"][0]["listing_id"], "ALFA-001")
        self.assertEqual(first["rows"][0]["return_units"], "20000")
        second = screen(3, limit=1, offset=1)["result"]["structuredContent"]
        self.assertIsNone(second["next_offset"])
        pending, = second["rows"]
        self.assertEqual(pending["listing_id"], "BETA-001")
        self.assertIsNone(pending["rank"])
        self.assertIsNone(pending["current"])
        self.assertEqual(pending["baseline"]["ticks"], "50000000")
        known = screen(4, known_at="2025-06-02T14:12:00Z")["result"]["structuredContent"]
        self.assertEqual([(row["listing_id"], row["rank"]) for row in known["rows"]],
                         [("BETA-001", 1), ("ALFA-001", 2)])
        removed = screen(5, effective_at="2025-06-02T14:20:00Z",
                         known_at="2025-06-02T14:25:00Z")["result"]["structuredContent"]
        self.assertEqual([row["listing_id"] for row in removed["rows"]], ["BETA-001"])
        self.assertEqual(screen(6, prices_file="local.csv")["error"]["code"], -32602)

    def test_financial_tool_returns_exact_cutoff_evidence_and_rejects_file_paths(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))
        fixtures = ROOT / "crates/core/tests/fixtures"
        arguments = {
            "filings_csv": (fixtures / "synthetic-financial-periods.csv").read_text(encoding="utf-8"),
            "capitalization_csv": (fixtures / "synthetic-financial-market-caps.csv").read_text(encoding="utf-8"),
            "issuer": "DEMO-ALFA", "valuation_at": "2025-04-03T14:00:00Z",
        }

        def financial(time, **changes):
            params = {"name": mcp.FINANCIAL_TOOL_NAME, "arguments": {
                **arguments, "known_at": f"2025-04-03T{time}Z", **changes,
            }}
            return server.handle(rpc("tools/call", 2, params))

        initial = financial("14:04:59")["result"]["structuredContent"]
        self.assertEqual(len(initial["quarters"]), 3)
        self.assertEqual(initial["trailing"]["kind"], "insufficient-quarters")
        self.assertIsNone(initial["quarterly_valuation"]["price_earnings"])
        self.assertEqual(initial["quarterly_valuation"]["price_book"], {"kind": "value", "units": "4000000"})
        ready = financial("14:05:00")["result"]["structuredContent"]
        self.assertEqual(ready["trailing"]["revenue"], "6000000000000010")
        self.assertEqual(ready["market_cap"]["ticks"], "12000000000000000")
        result = financial("14:22:00")["result"]
        revised = result["structuredContent"]
        self.assertEqual(json.loads(result["content"][0]["text"]), revised)
        self.assertEqual(revised["filing"]["source_id"], "ALFA-FY24-A1")
        self.assertEqual(revised["quarters"][-1]["source_id"], "ALFA-Q4-A1")
        self.assertEqual(revised["trailing"]["operating_cash_flow"], "-250000000000005")
        self.assertEqual(revised["quarterly_valuation"]["price_book"],
                         {"kind": "missing-denominator", "units": None})
        self.assertEqual(financial("14:05:00", filings_path="local.csv")["error"]["code"], -32602)
        self.assertEqual(financial("14:05:00", capitalization_csv=None)["error"]["code"], -32602)
        self.assertTrue(financial("14:61:00")["result"]["isError"])
        self.assertEqual(financial("14:05:00")["result"]["structuredContent"], ready)


    def test_option_snapshot_pages_exact_quotes_and_replays_both_cutoffs(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))
        fixture = ROOT / "crates/core/tests/fixtures"
        arguments = {
            "underlying_csv": (fixture / "synthetic-option-underlying.csv").read_text(encoding="utf-8"),
            "quotes_csv": (fixture / "synthetic-option-exercise-quotes.csv").read_text(encoding="utf-8"),
            "effective_at": "2025-04-03T14:00:00Z", "known_at": "2025-04-03T14:00:00Z",
        }

        def options(**changes):
            return server.handle(rpc("tools/call", 2, {
                "name": mcp.OPTION_SNAPSHOT_TOOL_NAME, "arguments": {**arguments, **changes},
            }))

        tools = server.handle(rpc("tools/list", 3))["result"]["tools"]
        tool = next(tool for tool in tools if tool["name"] == mcp.OPTION_SNAPSHOT_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertEqual(tool["outputSchema"]["properties"]["rows"]["items"]["properties"]["strike_ticks"]["type"], "string")

        init_payload = options()["result"]
        initial = init_payload["structuredContent"]
        self.assertEqual(json.loads(init_payload["content"][0]["text"]), initial)
        self.assertEqual((initial["instrument"], initial["currency"]), ("DEMO:OPT", "USD"))
        self.assertEqual(initial["underlying"]["spot_ticks"], "100000000")
        original = {row["contract_id"]: row for row in initial["rows"]}
        self.assertNotIn("APR-AM-C90", original)
        self.assertAlmostEqual(original["APR-C100"]["analytics"]["volatility"], .2, places=6)
        self.assertEqual(original["APR-C100"]["strike_ticks"], "100000000")
        self.assertEqual(original["APR-C100"]["bid_ticks"], "8807321")
        self.assertEqual(original["APR-P110"]["status"], "crossed")
        self.assertIsNone(original["APR-C105"]["bid_ticks"])
        self.assertIsNone(original["APR-C105"]["analytics"])

        all_rows = []
        offset = 0
        while offset is not None:
            page = options(offset=offset, limit=2)["result"]["structuredContent"]
            self.assertEqual(page["total_rows"], initial["total_rows"])
            self.assertEqual(page["underlying"], initial["underlying"])
            all_rows.extend(page["rows"])
            offset = page["next_offset"]
        self.assertEqual(all_rows, initial["rows"])

        late = options(known_at="2025-04-03T14:04:00Z")["result"]["structuredContent"]
        self.assertEqual(late["effective_at"], arguments["effective_at"])
        self.assertEqual(late["known_at"], "2025-04-03T14:04:00Z")
        self.assertEqual(late["underlying"]["spot_ticks"], "100500000")
        contracts = {row["contract_id"]: row for row in late["rows"]}
        self.assertEqual(contracts["APR-AM-C90"]["status"], "american-volatility-required")
        self.assertEqual(contracts["APR-AM-C90"]["exercise_style"], "american")
        self.assertGreater(contracts["APR-AM-C90"]["observed_at"], contracts["APR-AM-C90"]["quote_at"])
        self.assertEqual(contracts["APR-P110"]["status"], "ok")
        self.assertEqual(options(underlying_path="quotes.csv")["error"]["code"], -32602)
        self.assertEqual(options(max_age=True)["error"]["code"], -32602)
        self.assertTrue(options(known_at="2025-04-03T14:60:00Z")["result"]["isError"])
        self.assertEqual(options()["result"]["structuredContent"], initial)


if __name__ == "__main__":
    unittest.main()
