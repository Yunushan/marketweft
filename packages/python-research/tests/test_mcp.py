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
        self.assertEqual([item["name"] for item in tools], [mcp.TOOL_NAME, mcp.SCREEN_TOOL_NAME])
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


if __name__ == "__main__":
    unittest.main()
