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
                         [mcp.TOOL_NAME, mcp.SCREEN_TOOL_NAME, mcp.RANK_COMPARISON_TOOL_NAME, mcp.FINANCIAL_TOOL_NAME,
                          mcp.OPTION_SNAPSHOT_TOOL_NAME, mcp.AMERICAN_OPTION_TOOL_NAME, mcp.MONTHLY_RETURNS_TOOL_NAME,
                          mcp.MACRO_CALENDAR_TOOL_NAME, mcp.PORTFOLIO_SCENARIOS_TOOL_NAME, mcp.PORTFOLIO_FX_TOOL_NAME,
                          mcp.EQUITY_CONCENTRATION_TOOL_NAME, mcp.EQUITY_TARGET_TOOL_NAME,
                          mcp.PORTFOLIO_ALLOCATION_TOOL_NAME, mcp.NOTIONAL_BARS_TOOL_NAME,
                          mcp.LISTING_DOWNSIDE_RISK_TOOL_NAME, mcp.RECORDED_TRADE_PRINTS_TOOL_NAME,
                          mcp.DIVIDEND_LEDGER_TOOL_NAME, mcp.SESSION_RELATIVE_VOLUME_TOOL_NAME])
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

    def test_monthly_returns_paging_preserves_signed_evidence_and_historical_cutoffs(self):
        history = (ROOT / "crates/core/tests/fixtures/synthetic-monthly-returns.csv").read_text(encoding="utf-8")
        early = "2024-01-15T16:00:00Z"
        late = "2024-12-31T23:59:59Z"
        arguments = {"history_csv": history, "first_year": 2024, "last_year": 2024,
                     "observed_through": early, "offset": 0, "limit": 2}

        def query(request_id, **overrides):
            return rpc("tools/call", request_id, {"name": mcp.MONTHLY_RETURNS_TOOL_NAME,
                       "arguments": {**arguments, **overrides}})

        wide = ("time,open,high,low,close,volume\n2023-12-01,0.000001,0.000001,0.000001,0.000001,0\n"
                "2024-01-01,2000000000,2000000000,2000000000,2000000000,0\n")
        result = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(rpc("initialize", 1, INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", 2),
                       query(3), query(4, observed_through=late), query(5, observed_through=late, offset=2, limit=4),
                       query(6, observed_through=late, offset=10), query(7), query(8, history_csv=wide),
                       query(9, first_year=True), query(10, limit=121), query(11, history_path="history.csv"),
                       query(12, observed_through="2025-02-29T00:00:00Z"), query(13, offset=360), query(14)),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(result.stderr, b"")
        replies = {message["id"]: message for message in map(json.loads, result.stdout.splitlines())}
        tool = next(item for item in replies[2]["result"]["tools"] if item["name"] == mcp.MONTHLY_RETURNS_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertFalse(tool["annotations"]["openWorldHint"])
        self.assertEqual(tool["inputSchema"]["properties"]["offset"]["maximum"], 360)
        self.assertEqual(tool["outputSchema"]["properties"]["rows"]["maxItems"], 120)
        first, completed, next_rows, last, rewind, large = (
            replies[index]["result"]["structuredContent"] for index in range(3, 9))
        self.assertEqual(first, rewind)
        self.assertEqual(json.loads(replies[3]["result"]["content"][0]["text"]), first)
        self.assertEqual(first["observed_through"], early)
        self.assertEqual([first["total_rows"], first["next_offset"]], [12, 2])
        self.assertEqual(first["rows"][0], {"year": 2024, "month": 1, "window": "month-to-date",
                         "prior": {"at": 1703865600, "ticks": "80000000"},
                         "current": {"at": 1705334400, "ticks": "90000000"}, "percent_micros": "12500000"})
        self.assertEqual(first["rows"][1]["window"], "future")
        self.assertIsNone(first["rows"][1]["current"])
        self.assertEqual([row["percent_micros"] for row in completed["rows"]], ["25000000", "-25000000"])
        self.assertEqual([next_rows["offset"], next_rows["next_offset"]], [2, 6])
        self.assertIsNone(next_rows["rows"][0]["current"])
        self.assertIsNone(next_rows["rows"][1]["prior"])
        self.assertEqual(next_rows["rows"][3]["prior"]["ticks"], "0")
        self.assertIsNone(next_rows["rows"][3]["percent_micros"])
        self.assertEqual([row["month"] for row in last["rows"]], [11, 12])
        self.assertIsNone(last["next_offset"])
        self.assertEqual(large["rows"][0]["percent_micros"], "199999999999999900000000")
        self.assertEqual([replies[index]["error"]["code"] for index in (9, 10, 11)], [-32602] * 3)
        self.assertTrue(replies[12]["result"]["isError"])
        self.assertEqual(replies[13]["result"]["structuredContent"]["rows"], [])
        self.assertEqual(replies[14]["result"]["structuredContent"], first)

    def test_macro_calendar_pages_release_evidence_through_independent_cutoffs(self):
        reports = (ROOT / "crates/core/tests/fixtures/synthetic-macro-calendar.csv").read_text(encoding="utf-8")
        utc = lambda time: f"2025-04-03T{time}Z"
        early, late = utc("14:31:59"), utc("14:52:00")
        wide = reports.replace("2.8,CPI-A1", "-9007199254.740993,CPI-A1")
        delayed = reports.replace("14:32:00Z,,2.7", "14:49:00Z,,2.7")
        arguments = {"csv": reports, "published_through": utc("14:50:00"), "known_at": early, "limit": 2}

        def query(request_id, **overrides):
            return rpc("tools/call", request_id, {"name": mcp.MACRO_CALENDAR_TOOL_NAME,
                       "arguments": {**arguments, **overrides}})

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(rpc("initialize", 1, INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", 2),
                       query(3), query(4, known_at=late), query(5, known_at=late, offset=2),
                       query(6, known_at=late, offset=4), query(7), query(8, csv=wide, known_at=late, offset=4),
                       query(9, csv=delayed, published_through=utc("14:45:00"), known_at=utc("14:48:00")),
                       query(10, published_through=utc("14:29:59"), known_at=late),
                       query(11, offset=True), query(12, limit=251), query(13, csv_path="calendar.csv"),
                       query(14, published_through="2025-02-29T14:32:00Z"), query(15, offset=10_000),
                       query(16, published_through=utc("12:00:00")), query(17)),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = {message["id"]: message for message in map(json.loads, process.stdout.splitlines())}
        tool = next(item for item in replies[2]["result"]["tools"] if item["name"] == "macro_calendar_as_of")
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertFalse(tool["annotations"]["openWorldHint"])
        self.assertEqual(tool["outputSchema"]["properties"]["rows"]["maxItems"], 250)

        def page(index):
            return replies[index]["result"]["structuredContent"]

        first = page(3)
        self.assertEqual(first, page(7))
        self.assertEqual(first, page(17))
        self.assertEqual(json.loads(replies[3]["result"]["content"][0]["text"]), first)
        self.assertEqual((first["known_at"], first["total_releases"], first["total_rows"], first["next_offset"]),
                         (early, 2, 3, 2))
        self.assertEqual(first["rows"][0], {"release_id": "INFLATION-MAR", "series_id": "DEMO.CPI",
            "reference_date": 1740787200, "unit": "percent", "kind": "schedule", "record_id": "CPI-S2",
            "published_at": 1743689280, "observed_at": 1743689340, "scheduled_at": 1743690600,
            "value_ticks": None, "supersedes": None})
        self.assertEqual(first["rows"][1]["record_id"], "CPI-F2")
        self.assertEqual(first["rows"][1]["value_ticks"], "2500000")
        self.assertEqual([page(index)["next_offset"] for index in (4, 5, 6)], [2, 4, None])
        self.assertEqual([page(index)["total_rows"] for index in (4, 5, 6)], [6, 6, 6])
        rows = [row for index in (4, 5, 6) for row in page(index)["rows"]]
        self.assertEqual([(row["record_id"], row["kind"], row["value_ticks"], row["supersedes"]) for row in rows], [
            ("CPI-S2", "schedule", None, None), ("CPI-F2", "forecast", "2500000", None),
            ("CPI-A0", "actual", "2700000", None), ("CPI-A1", "revision", "2600000", "CPI-A0"),
            ("CPI-A2", "revision", "2800000", "CPI-A1"), ("PAY-S1", "schedule", None, None),
        ])
        self.assertEqual(page(8)["rows"][0]["value_ticks"], "-9007199254740993")
        self.assertEqual(page(9)["total_rows"], 3)
        self.assertEqual(page(10)["total_rows"], 3)
        self.assertEqual([replies[index]["error"]["code"] for index in (11, 12, 13)], [-32602] * 3)
        self.assertTrue(replies[14]["result"]["isError"])
        self.assertEqual((page(15)["rows"], page(15)["next_offset"]), ([], None))
        self.assertEqual((page(16)["rows"], page(16)["total_releases"]), ([], 0))

    def test_portfolio_scenarios_paging_preserves_exact_seed_paths_and_rewind(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        arguments = {
            "membership_csv": (fixtures / "synthetic-listing-risk-membership.csv").read_text(encoding="utf-8"),
            "prices_csv": (fixtures / "synthetic-listing-risk-prices.csv").read_text(encoding="utf-8"),
            "from_at": "2025-06-02T14:00:00Z", "through_at": "2025-06-02T14:06:00Z",
            "known_at": "2025-06-02T14:06:00Z", "interval_seconds": 60, "starting_value": "100",
            "fee_basis_points": 100, "seed": "9007199254740993", "paths": 5, "horizon": 4,
            "block_size": 3, "limit": 2,
            "allocations": [{"listing_id": listing, "weight_basis_points": 5000} for listing in ("B", "A")],
        }

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {"name": mcp.PORTFOLIO_SCENARIOS_TOOL_NAME,
                                                "arguments": arguments | changes})

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("first"), query("second", offset=2), query("third", offset=4),
                query("late", known_at="2025-06-02T14:07:00Z"),
                query("removed", known_at="2025-06-02T14:08:00Z"), query("rewind"),
                query("numeric-seed", seed=9007199254740993), query("overflow-seed", seed="18446744073709551616"),
                query("bad-file", membership_path="membership.csv"), query("gap", block_size=4), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in replies["tools"]["result"]["tools"] if tool["name"] == mcp.PORTFOLIO_SCENARIOS_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertEqual(tool["inputSchema"]["properties"]["seed"]["type"], "string")

        def data(request_id):
            result = replies[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        first, second, third = map(data, ("first", "second", "third"))
        self.assertEqual((first["next_offset"], second["next_offset"], third["next_offset"]), (2, 4, None))
        self.assertEqual((first["seed"], first["total_paths"], first["block_size"]), ("9007199254740993", 5, 3))
        self.assertEqual([row["listing_id"] for row in first["coverage"]], ["A", "B"])
        for number, row in enumerate(first["paths"] + second["paths"] + third["paths"], 1):
            self.assertEqual(row, {"path_number": number, "ending_value": "99950000",
                                   "drawdown_millionths": "500", "fees": "50000"})
        self.assertEqual(first["percentiles"]["fees"], ["50000"] * 3)
        self.assertEqual([data(result)["eligible_blocks"] for result in ("first", "late", "removed", "rewind")], [1, 4, 2, 1])
        self.assertEqual(data("rewind"), first)
        for name in ("numeric-seed", "overflow-seed", "bad-file"):
            self.assertEqual(replies[name]["error"]["code"], -32602)
        self.assertTrue(replies["gap"]["result"]["isError"])
        self.assertIn("No complete return block", replies["gap"]["result"]["content"][0]["text"])
        self.assertEqual(replies["ping"]["result"], {})

    def test_portfolio_fx_pages_exact_totals_and_evidence_at_independent_cutoffs(self):
        rates = (ROOT / "crates/core/tests/fixtures/synthetic-portfolio-fx.csv").read_text(encoding="utf-8")
        arguments = {
            "rates_csv": rates, "reporting_currency": "USD",
            "effective_at": "2025-06-02T14:45:00Z", "known_at": "2025-06-02T14:45:00Z",
            "amounts": [{"currency": "USD", "subtotal_ticks": "70000000"},
                        {"currency": "EUR", "subtotal_ticks": "225000000"}],
            "limit": 1,
        }
        wide = str(-(1 << 127))

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.PORTFOLIO_FX_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("missing"), query("identity", offset=1),
                query("original", known_at="2025-06-02T14:46:00Z"),
                query("revised", known_at="2025-06-02T14:49:00Z"),
                query("inverse", known_at="2025-06-02T14:49:00Z", reporting_currency="EUR", offset=1),
                query("later-effective", effective_at="2025-06-02T14:46:00Z", known_at="2025-06-02T14:49:00Z"),
                query("wide", amounts=[{"currency": "USD", "subtotal_ticks": wide}]), query("empty", amounts=[]),
                query("bad-path", rates_path="rates.csv"), query("numeric", amounts=[{"currency": "USD", "subtotal_ticks": 1}]),
                query("overflow", amounts=[{"currency": "USD", "subtotal_ticks": str(1 << 127)}]),
                query("bad-offset", offset=True), query("rewind"), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in replies["tools"]["result"]["tools"] if tool["name"] == mcp.PORTFOLIO_FX_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertFalse(tool["annotations"]["openWorldHint"])
        self.assertEqual(tool["inputSchema"]["properties"]["amounts"]["items"]["properties"]["subtotal_ticks"]["type"], "string")

        def data(request_id):
            result = replies[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        missing, identity = data("missing"), data("identity")
        self.assertEqual((missing["total_rows"], missing["next_offset"], identity["next_offset"]), (2, 1, None))
        self.assertEqual(missing["rows"][0], {"currency": "EUR", "subtotal_ticks": "225000000",
                                             "converted_ticks": None, "rate": None})
        self.assertEqual(identity["rows"][0], {"currency": "USD", "subtotal_ticks": "70000000",
                                              "converted_ticks": "70000000", "rate": None})
        self.assertEqual([data(cutoff)["known_subtotal_ticks"] for cutoff in ("missing", "original", "revised", "rewind")],
                         ["70000000", "340000000", "362500000", "70000000"])
        self.assertEqual(data("rewind"), missing)
        revised_quote = data("revised")["rows"][0]["rate"]
        self.assertEqual(revised_quote, {
            "base_currency": "EUR", "quote_currency": "USD", "rate_at": 1748875200,
            "observed_at": 1748875740, "rate_ticks": "1300000", "inverted": False,
        })
        inverse = data("inverse")
        self.assertEqual((inverse["reporting_currency"], inverse["known_subtotal_ticks"]), ("EUR", "278846154"))
        self.assertEqual(inverse["rows"][0]["rate"], revised_quote | {"inverted": True})
        self.assertEqual(data("later-effective")["known_subtotal_ticks"], "351250000")
        self.assertEqual(data("wide")["known_subtotal_ticks"], wide)
        self.assertEqual((data("empty")["known_subtotal_ticks"], data("empty")["rows"]), (None, []))
        for name in ("bad-path", "numeric", "bad-offset"):
            self.assertEqual(replies[name]["error"]["code"], -32602)
        self.assertTrue(replies["overflow"]["result"]["isError"])
        self.assertEqual(replies["ping"]["result"], {})

    def test_equity_concentration_pages_missing_and_revised_marks_in_quote_currency(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        arguments = {
            field: (fixtures / f"synthetic-{fixture}.csv").read_text(encoding="utf-8")
            for field, fixture in (
                ("membership_csv", "universe"), ("holdings_csv", "portfolio-holdings"), ("prices_csv", "universe-prices"),
            )
        }
        arguments.update(effective_at="2025-06-02T14:10:00Z", known_at="2025-06-02T14:10:00Z", limit=1)

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.EQUITY_CONCENTRATION_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("early"), query("missing", offset=1), query("late", known_at="2025-06-02T14:12:00Z"),
                query("revised", known_at="2025-06-02T14:16:00Z"), query("rewind"),
                query("reused", effective_at="2025-06-02T14:45:00Z", known_at="2025-06-02T14:45:00Z"),
                query("bad-field", prices_path="prices.csv"), query("empty-holdings", holdings_csv=""),
                query("bad-offset", offset=1001), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        messages = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in messages["tools"]["result"]["tools"] if tool["name"] == mcp.EQUITY_CONCENTRATION_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertFalse(tool["annotations"]["openWorldHint"])
        self.assertEqual(tool["outputSchema"]["properties"]["rows"]["items"]["properties"]["rank"]["type"], ["integer", "null"])

        def data(request_id):
            result = messages[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        early, missing = data("early"), data("missing")
        self.assertEqual((early["total_rows"], early["next_offset"], missing["next_offset"]), (2, 1, None))
        self.assertEqual(missing["rows"][0], {
            "currency": "USD", "gross_mark_ticks": "204000000", "listing_id": "BETA-001",
            "mark_ticks": None, "rank": None, "weight_micros": None,
        })
        self.assertEqual([data(key)["rows"][0]["weight_micros"] for key in ("late", "revised")],
                         ["73298429", "71227080"])
        self.assertEqual(data("rewind"), early)
        self.assertEqual(data("reused")["rows"][0], {
            "currency": "EUR", "gross_mark_ticks": "225000000", "listing_id": "BETA-002",
            "mark_ticks": "225000000", "rank": 1, "weight_micros": "100000000",
        })
        for key in ("bad-field", "empty-holdings", "bad-offset"):
            self.assertEqual(messages[key]["error"]["code"], -32602)
        self.assertEqual(messages["ping"]["result"], {})

    def test_equity_target_pages_preserve_missing_marks_revisions_and_withdrawals(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        arguments = {
            field: (fixtures / f"synthetic-{fixture}.csv").read_text(encoding="utf-8")
            for field, fixture in (
                ("membership_csv", "universe"), ("holdings_csv", "portfolio-holdings"),
                ("prices_csv", "universe-prices"), ("targets_csv", "equity-targets"),
            )
        }
        arguments.update(effective_at="2025-06-02T14:10:00Z", known_at="2025-06-02T14:11:00Z", offset=1, limit=1)

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.EQUITY_TARGET_TOOL_NAME, "arguments": arguments | changes,
            })

        successor = {
            "terms_csv": (fixtures / "synthetic-delisting-terms.csv").read_text(encoding="utf-8"),
            "effective_at": "2025-06-02T14:45:00Z", "known_at": "2025-06-02T14:45:00Z", "offset": 0, "limit": 3,
        }
        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("start", offset=0), query("missing"), query("original", known_at="2025-06-02T14:12:00Z"),
                query("revised", known_at="2025-06-02T14:16:00Z"), query("rewind"), query("successor", **successor),
                query("unknown", target_path="targets.csv"), query("terms", terms_csv=None),
                query("bad-offset", offset=11_001), query("bad-csv", targets_csv="malformed"), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        messages = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in messages["tools"]["result"]["tools"] if tool["name"] == mcp.EQUITY_TARGET_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertNotIn("terms_csv", tool["inputSchema"]["required"])

        def data(request_id):
            result = messages[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        earlier = data("missing")
        self.assertEqual((data("start")["next_offset"], earlier["next_offset"]), (1, None))
        self.assertEqual(earlier["rows"][0], {
            "currency": "USD", "listing_id": "BETA-001", "in_equity": True, "actual_weight_micros": None,
            "target": {"effective_at": 1748872800, "observed_at": 1748873460, "weight_micros": "60000000"},
            "drift_micros": None,
        })
        self.assertEqual(data("original")["rows"][0]["drift_micros"], "13298429")
        self.assertEqual(data("revised")["rows"][0]["drift_micros"], "1227080")
        self.assertEqual(data("rewind"), earlier)
        first, second, withdrawn = data("successor")["rows"]
        self.assertEqual((first["listing_id"], first["drift_micros"], second["target"]["weight_micros"]),
                         ("BETA-002", "0", "0"))
        self.assertFalse(withdrawn["in_equity"])
        self.assertEqual(withdrawn["target"], {
            "effective_at": 1748874900, "observed_at": 1748874900, "weight_micros": None,
        })
        for key in ("unknown", "terms", "bad-offset"):
            self.assertEqual(messages[key]["error"]["code"], -32602)
        self.assertTrue(messages["bad-csv"]["result"]["isError"])
        self.assertEqual(messages["ping"]["result"], {})

    def test_portfolio_allocation_preserves_common_returns_and_basis_points(self):
        fixtures = ROOT / "crates/core/tests/fixtures"

        def utc(minute):
            return f"2025-06-02T14:{minute:02}:00Z"

        membership = (fixtures / "synthetic-listing-risk-membership.csv").read_text(encoding="utf-8")
        membership += f"RISK,C-ADD,C,DEMO:GAMMA,{utc(0)},{utc(0)},add\n"
        prices = (fixtures / "synthetic-listing-risk-prices.csv").read_text(encoding="utf-8")
        prices = prices.replace(",90\n", ",120\n") + "".join(
            f"RISK,C,{utc(at)},{utc(observed)},10\n" for at, observed in ((0, 0), (1, 1), (2, 7))
        )
        arguments = {
            "membership_csv": membership, "prices_csv": prices, "listing_ids": ["C", "A", "B"],
            "from_at": utc(0), "through_at": utc(6), "known_at": utc(6), "interval_seconds": 60,
        }

        def query(request_id, **changes):
            return rpc("tools/call", request_id,
                       {"name": mcp.PORTFOLIO_ALLOCATION_TOOL_NAME, "arguments": arguments | changes})

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("early"), query("late", known_at=utc(7)), query("rewind"),
                query("capped-early", maximum_weight_basis_points=6000),
                query("capped-late", known_at=utc(7), maximum_weight_basis_points=6000),
                query("capped-rewind", maximum_weight_basis_points=6000),
                query("bad-cap", maximum_weight_basis_points=3333), query("null-cap", maximum_weight_basis_points=None),
                query("bad-list", listing_ids="ABC"), query("duplicate", listing_ids=["A", "A"]),
                query("bad-interval", interval_seconds=0), query("unknown", price_path="closes.csv"), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        messages = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in messages["tools"]["result"]["tools"] if tool["name"] == mcp.PORTFOLIO_ALLOCATION_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertTrue(tool["inputSchema"]["properties"]["listing_ids"]["uniqueItems"])
        self.assertNotIn("maximum_weight_basis_points", tool["inputSchema"]["required"])

        def data(request_id):
            result = messages[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        earlier = data("early")
        self.assertEqual((earlier["expected_returns"], earlier["common_returns"], earlier["sample"]), (6, 1, None))
        self.assertIsNone(earlier["listings"][2]["optimized_basis_points"])
        later = data("late")
        self.assertEqual((later["from_at"], later["through_at"], later["known_at"]), (utc(0), utc(6), utc(7)))
        self.assertEqual(later["common_returns"], 2)
        self.assertEqual([row["optimized_basis_points"] for row in later["listings"]], [0, 0, 10_000])
        self.assertEqual(later["sample"]["optimized_volatility"], 0)
        self.assertEqual(data("rewind"), earlier)
        self.assertNotIn("maximum_weight_basis_points", earlier)
        self.assertEqual(data("capped-early"), earlier | {"maximum_weight_basis_points": 6000})
        capped = data("capped-late")
        self.assertEqual(capped["maximum_weight_basis_points"], 6000)
        self.assertEqual([row["optimized_basis_points"] for row in capped["listings"]], [4000, 0, 6000])
        self.assertEqual(data("capped-rewind"), data("capped-early"))
        for key in ("bad-list", "bad-interval", "unknown", "null-cap"):
            self.assertEqual(messages[key]["error"]["code"], -32602)
        self.assertTrue(messages["bad-cap"]["result"]["isError"])
        self.assertTrue(messages["duplicate"]["result"]["isError"])
        self.assertEqual(messages["ping"]["result"], {})

    def test_notional_bars_page_exact_evidence_at_independent_cutoffs(self):
        source = (ROOT / "crates/core/tests/fixtures/synthetic-notional-trades.csv").read_text(encoding="utf-8")
        arguments = {"instrument": "NASDAQ:NVDA", "trades_csv": source, "target_notional_ticks": 5_000_000}
        initial, completion = "2025-06-02T14:00:01Z", "2025-06-02T14:00:02Z"
        wide = source.splitlines()[0] + "\nNASDAQ:NVDA,1748872800,1748872800,18446744073709551615,-2000000000,2000000000\n"

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.NOTIONAL_BARS_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("before", known_at="2025-06-02T13:59:59Z"),
                query("first", known_at=initial), query("complete", known_at=completion),
                query("page-1", limit=2), query("page-2", offset=2, limit=2), query("empty", offset=4, limit=2),
                query("wide", trades_csv=wide, target_notional_ticks=1),
                query("null", known_at=None), query("limit", limit=1001), query("offset", offset=100001),
                query("target", target_notional_ticks=True), query("unknown", trade_path="local.csv"),
                query("bad-date", known_at="2025-02-29T14:00:01Z"), query("rewind", known_at=initial),
                rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = {reply["id"]: reply for reply in map(json.loads, process.stdout.splitlines())}
        tool = next(tool for tool in replies["tools"]["result"]["tools"] if tool["name"] == mcp.NOTIONAL_BARS_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertEqual(tool["inputSchema"]["required"], ["instrument", "trades_csv", "target_notional_ticks"])

        def data(request_id):
            result = replies[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        self.assertEqual(data("before")["bars"], [])
        before = data("first")
        self.assertEqual((before["known_at"], before["target_notional_ticks"], before["total_bars"]), (initial, 5_000_000, 1))
        self.assertEqual(before["bars"][0]["first_sequence"], "9007199254740993")
        self.assertEqual(before["bars"][0]["gross_notional_trillionths"], "2000003000001")
        self.assertFalse(before["bars"][0]["complete"])
        finished = data("complete")["bars"][0]
        self.assertTrue(finished["complete"])
        self.assertEqual((finished["gross_notional_trillionths"], finished["last_sequence"]), ("5000003000001", "9007199254740995"))
        pages = [data(request_id) for request_id in ("page-1", "page-2", "empty")]
        self.assertEqual([page["next_offset"] for page in pages], [2, None, None])
        self.assertEqual([page["total_bars"] for page in pages], [4, 4, 4])
        self.assertTrue(all(page["known_at"] is None for page in pages))
        self.assertEqual(pages[0]["bars"][0], finished)
        self.assertEqual(pages[1]["bars"][-1]["gross_notional_trillionths"], "800000800000")
        self.assertEqual(pages[2]["bars"], [])
        large = data("wide")["bars"][0]
        self.assertEqual(large["first_sequence"], str((1 << 64) - 1))
        self.assertEqual(large["gross_notional_trillionths"], str(2_000_000_000_000_000 ** 2))
        for request_id in ("null", "limit", "offset", "target", "unknown"):
            self.assertEqual(replies[request_id]["error"]["code"], -32602)
        self.assertTrue(replies["bad-date"]["result"]["isError"])
        self.assertEqual(data("rewind"), before)
        self.assertEqual(replies["ping"]["result"], {})

    def test_recorded_trade_prints_pages_preserve_cutoff_and_exact_wire_values(self):
        fixture = ROOT / "crates/core/tests/fixtures/synthetic-recorded-prints.csv"
        arguments = {
            "instrument": "NASDAQ:NVDA", "trades_csv": fixture.read_text(encoding="utf-8"),
            "known_at": "2025-06-02T14:00:00Z", "limit": 2,
        }

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.RECORDED_TRADE_PRINTS_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"),
                rpc("tools/list", "tools"), query("early"),
                query("delayed", known_at="2025-06-02T14:00:02Z", offset=2),
                query("full", known_at="2025-06-02T14:00:04Z", offset=2),
                query("invalid", known_at=None), query("over", limit=1001), query("rewind"),
            ), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15,
        )
        replies = {item["id"]: item for item in map(json.loads, process.stdout.splitlines())}
        tool = next(item for item in replies["tools"]["result"]["tools"]
                    if item["name"] == mcp.RECORDED_TRADE_PRINTS_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertEqual(set(tool["inputSchema"]["required"]), {"instrument", "trades_csv"})
        self.assertEqual(tool["outputSchema"]["properties"]["prints"]["items"]["properties"]["sequence"]["type"],
                         "string")
        early = replies["early"]["result"]["structuredContent"]
        self.assertEqual(json.loads(replies["early"]["result"]["content"][0]["text"]), early)
        self.assertEqual(early["total_prints"], 2)
        self.assertIsNone(early["next_offset"])
        self.assertEqual(early["prints"][0], {
            "executed_at": 1748872798, "observed_at": 1748872800, "sequence": "9007199254740993",
            "price_ticks": "-2000001", "size_ticks": "1000001", "reported_side": "buy",
        })
        self.assertEqual(early["prints"][1]["price_ticks"], "0")
        self.assertEqual(early["prints"][1]["reported_side"], "unknown")
        delayed = replies["delayed"]["result"]["structuredContent"]
        self.assertEqual(delayed["total_prints"], 3)
        self.assertEqual((delayed["prints"][0]["executed_at"], delayed["prints"][0]["observed_at"]),
                         (1748872797, 1748872802))
        full = replies["full"]["result"]["structuredContent"]
        self.assertEqual(full["prints"][1]["sequence"], "18446744073709551615")
        self.assertEqual(full["prints"][1]["reported_side"], "sell")
        self.assertEqual(replies["invalid"]["error"]["code"], -32602)
        self.assertEqual(replies["over"]["error"]["code"], -32602)
        self.assertEqual(replies["rewind"]["result"]["structuredContent"], early)

    def test_dividend_ledger_pages_preserve_cutoffs_signed_movements_and_dated_entitlement(self):
        fixture = ROOT / "crates/core/tests/fixtures/synthetic-dividend-withholding.csv"
        arguments = {
            "instrument": "DEMO:DIVIDEND", "dividends_csv": fixture.read_text(encoding="utf-8"),
            "known_at": "2025-06-04T14:00:00Z", "limit": 2,
        }
        positions = (
            "instrument,effective_at,observed_at,shares\n"
            "DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-03T13:55:00Z,100\n"
            "DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-04T14:30:00Z,120\n"
        )

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.DIVIDEND_LEDGER_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"),
                rpc("tools/list", "tools"), query("first", shares=100), query("pay", shares=100, offset=2),
                query("transfer", shares=100, known_at="2025-06-04T14:40:00Z", offset=4),
                query("dated", positions_csv=positions, known_at="2025-06-04T14:30:00Z", offset=4),
                query("ambiguous", shares=100, positions_csv=positions), query("invalid", shares=None),
                query("rewind", shares=100, offset=2),
            ), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15,
        )
        replies = {item["id"]: item for item in map(json.loads, process.stdout.splitlines())}
        tool = next(item for item in replies["tools"]["result"]["tools"] if item["name"] == mcp.DIVIDEND_LEDGER_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertEqual(tool["inputSchema"]["oneOf"], [{"required": ["shares"]}, {"required": ["positions_csv"]}])
        first = replies["first"]["result"]["structuredContent"]
        self.assertEqual(first["next_offset"], 2)
        self.assertEqual(first["events"][1]["movements"][0]["receivable"], "50000000")
        pay = replies["pay"]["result"]["structuredContent"]
        self.assertEqual(json.loads(replies["pay"]["result"]["content"][0]["text"]), pay)
        self.assertEqual(pay["total_events"], 3)
        self.assertIsNone(pay["next_offset"])
        self.assertEqual(pay["events"][0]["movements"][0]["cash"], "40000000")
        self.assertEqual(pay["events"][0]["movements"][0]["withholding"], "10000000")
        transfer = replies["transfer"]["result"]["structuredContent"]["events"][0]["movements"]
        self.assertEqual([(row["currency"], row["cash_delta"], row["withholding_delta"]) for row in transfer],
                         [("USD", "-43000000", "-7000000"), ("CAD", "48000000", "12000000")])
        dated = replies["dated"]["result"]["structuredContent"]
        self.assertIsNone(dated["fixed_shares"])
        self.assertEqual(dated["events"][0]["entitled_shares"], 120)
        self.assertEqual(dated["events"][0]["movements"][0]["withholding_delta"], "1400000")
        self.assertEqual(replies["ambiguous"]["error"]["code"], -32602)
        self.assertEqual(replies["invalid"]["error"]["code"], -32602)
        self.assertEqual(replies["rewind"]["result"]["structuredContent"], pay)

    def test_session_relative_volume_pages_report_exact_cutoff_and_baseline(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        params = {
            "calendar_csv": (fixtures / "synthetic-session-volume-calendar.csv").read_text(encoding="utf-8"),
            "bars_csv": (fixtures / "synthetic-session-volume-bars.csv").read_text(encoding="utf-8"),
            "known_at": "2025-11-05T14:33:00Z", "interval_seconds": 60, "lookback_sessions": 2,
            "offset": 6, "limit": 2,
        }

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.SESSION_RELATIVE_VOLUME_TOOL_NAME, "arguments": params | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"),
                       rpc("tools/list", "tools"), query("early", known_at="2025-11-05T14:30:59Z"),
                       query("first"), query("tail", offset=8), query("invalid", interval_seconds=True),
                       query("rewind")), capture_output=True, check=True, timeout=15,
        )
        replies = {item["id"]: item for item in map(json.loads, process.stdout.splitlines())}
        tool = next(item for item in replies["tools"]["result"]["tools"] if item["name"] == mcp.SESSION_RELATIVE_VOLUME_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        early = replies["early"]["result"]["structuredContent"]
        self.assertEqual(early["total_rows"], 7)
        self.assertEqual(early["rows"][0]["duration_seconds"], 30)
        first = replies["first"]["result"]["structuredContent"]
        self.assertEqual(json.loads(replies["first"]["result"]["content"][0]["text"]), first)
        self.assertEqual(first["next_offset"], 8)
        self.assertEqual(first["rows"][1]["relative_ticks"], "3000000")
        self.assertEqual(first["rows"][1]["baseline_sum_ticks"], "300000000")
        tail = replies["tail"]["result"]["structuredContent"]
        self.assertIsNone(tail["next_offset"])
        self.assertEqual([row["average_ticks"] for row in tail["rows"]], [None, "0"])
        self.assertTrue(all(row["relative_ticks"] is None for row in tail["rows"]))
        self.assertEqual(replies["invalid"]["error"]["code"], -32602)
        self.assertEqual(replies["rewind"]["result"]["structuredContent"], first)

    def test_listing_downside_risk_pages_preserve_losses_and_rewind(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        time = lambda minute: f"2025-06-02T14:0{minute}:00Z"
        arguments = {
            "membership_csv": (fixtures / "synthetic-listing-risk-membership.csv").read_text(encoding="utf-8"),
            "prices_csv": (fixtures / "synthetic-listing-risk-prices.csv").read_text(encoding="utf-8"),
            "left_listing_id": "A", "right_listing_id": "B",
            "from_at": time(0), "through_at": time(6), "known_at": time(6),
            "interval_seconds": 60, "window_periods": 3,
        }

        def query(request_id, **changes):
            return rpc("tools/call", request_id, {
                "name": mcp.LISTING_DOWNSIDE_RISK_TOOL_NAME, "arguments": arguments | changes,
            })

        process = subprocess.run(
            [sys.executable, "-B", "-m", "marketweft_research.mcp", "--engine", str(EXECUTABLE)],
            input=wire(
                rpc("initialize", "init", INITIALIZE), rpc("notifications/initialized"), rpc("tools/list", "tools"),
                query("early", limit=2), query("next", limit=2, offset=2),
                query("late", limit=2, known_at=time(7)), query("missing", known_at=time(0)),
                query("removed", known_at=time(8)), query("overrun", offset=100_000),
                query("invalid-limit", limit=1001), query("null-scale", volatility_periods=None),
                query("unknown", price_path="prices.csv"), query("grid", interval_seconds=70),
                query("rewind", limit=2), rpc("ping", "ping"),
            ),
            timeout=15, capture_output=True, check=True,
        )
        self.assertEqual(process.stderr, b"")
        replies = {item["id"]: item for item in map(json.loads, process.stdout.splitlines())}
        tool = next(item for item in replies["tools"]["result"]["tools"]
                    if item["name"] == mcp.LISTING_DOWNSIDE_RISK_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        self.assertFalse(tool["annotations"]["openWorldHint"])
        self.assertNotIn("volatility_periods", tool["inputSchema"]["required"])

        def data(request_id):
            result = replies[request_id]["result"]
            self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
            return result["structuredContent"]

        first = data("early")
        self.assertEqual((first["known_at"], first["total_windows"], first["next_offset"], first["volatility_periods"]),
                         (time(6), 4, 2, 1))
        self.assertEqual((first["rows"][0]["left_downside"], first["rows"][0]["right_loss_returns"]), (0, 1))
        self.assertAlmostEqual(first["rows"][0]["right_downside"], 0.1, places=14)
        self.assertEqual(data("next")["next_offset"], None)
        self.assertEqual(data("late")["rows"][0]["right_loss_returns"], 2)
        self.assertAlmostEqual(data("late")["rows"][0]["right_downside"], 0.0816496580927726, places=14)
        self.assertIsNone(data("missing")["rows"][0]["left_downside"])
        self.assertEqual(data("removed")["rows"][-1]["left_returns"], 1)
        self.assertEqual(data("overrun")["rows"], [])
        for request_id in ("invalid-limit", "null-scale", "unknown"):
            self.assertEqual(replies[request_id]["error"]["code"], -32602)
        self.assertTrue(replies["grid"]["result"]["isError"])
        self.assertEqual(data("rewind"), first)
        self.assertEqual(replies["ping"]["result"], {})

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

    def test_rank_comparison_pages_and_preserves_native_evidence(self):
        fixtures = ROOT / "crates/core/tests/fixtures"
        params = {
            "membership_csv": (fixtures / "synthetic-universe.csv").read_text(encoding="utf-8"),
            "prices_csv": (fixtures / "synthetic-universe-prices.csv").read_text(encoding="utf-8"),
            "baseline_at": "2025-06-02T14:00:00Z",
            "before_effective_at": "2025-06-02T14:10:00Z", "before_known_at": "2025-06-02T14:12:00Z",
            "after_effective_at": "2025-06-02T14:10:00Z", "after_known_at": "2025-06-02T14:16:00Z",
        }
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))

        def compare(request_id, **changes):
            return server.handle(rpc("tools/call", request_id, {
                "name": mcp.RANK_COMPARISON_TOOL_NAME,
                "arguments": {**params, **changes},
            }))

        first = compare(2, limit=1)["result"]["structuredContent"]
        self.assertEqual(first["next_offset"], 1)
        self.assertEqual(first["rows"][0]["rank_move"], 1)
        second = compare(3, offset=1, limit=1)["result"]["structuredContent"]
        self.assertIsNone(second["next_offset"])
        beta, = second["rows"]
        self.assertEqual(beta["before"]["current"]["ticks"], "56000000")
        self.assertEqual(beta["after"]["current"]["ticks"], "50500000")
        self.assertEqual(beta["after"]["change_id"], "BETA-JOIN")
        self.assertEqual(beta["rank_move"], -1)
        self.assertEqual(second["after_known_at"], params["after_known_at"])
        self.assertTrue(compare(4, before_known_at="2025-06-02")["result"]["isError"])
        self.assertEqual(compare(5, prices_path="prices.csv")["error"]["code"], -32602)
        self.assertEqual(compare(6, offset=2)["result"]["structuredContent"]["rows"], [])

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

    def test_american_option_tool_returns_revision_provenance_and_quote_statuses(self):
        server = mcp.ResearchServer(ResearchEngine(EXECUTABLE))
        server.handle(rpc("initialize", 1, INITIALIZE))
        server.handle(rpc("notifications/initialized"))
        fixture = ROOT / "crates/core/tests/fixtures"
        arguments = {
            "underlying_csv": (fixture / "synthetic-option-underlying.csv").read_text(encoding="utf-8"),
            "quotes_csv": (fixture / "synthetic-option-exercise-quotes.csv").read_text(encoding="utf-8"),
            "cash_dividends_csv": (fixture / "synthetic-option-cash-dividends.csv").read_text(encoding="utf-8"),
            "contract_id": "APR-AM-C90", "effective_at": "2025-04-03T14:00:00Z",
        }

        def query(time, **changes):
            return server.handle(rpc("tools/call", 2, {
                "name": mcp.AMERICAN_OPTION_TOOL_NAME,
                "arguments": {**arguments, "known_at": f"2025-04-03T{time}Z", **changes},
            }))

        tools = server.handle(rpc("tools/list", 3))["result"]["tools"]
        tool = next(tool for tool in tools if tool["name"] == mcp.AMERICAN_OPTION_TOOL_NAME)
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        missing = query("14:01:59")["result"]["structuredContent"]
        self.assertEqual(missing["status"], "missing-contract")
        self.assertIsNone(missing["price"])
        self.assertEqual(missing["dividends"], [])

        first = query("14:04:00")["result"]["structuredContent"]
        self.assertEqual(first["dividends"][0]["amount_per_share_ticks"], "7000000")
        self.assertAlmostEqual(first["price"], 16.234568, places=10)
        replied = query("14:06:00")["result"]
        revised = replied["structuredContent"]
        self.assertEqual(json.loads(replied["content"][0]["text"]), revised)
        self.assertEqual(revised["known_at"], "2025-04-03T14:06:00Z")
        self.assertEqual(revised["effective_at"], "2025-04-03T14:00:00Z")
        self.assertEqual(revised["currency"], "USD")
        self.assertAlmostEqual(revised["volatility"], .3253, places=4)
        self.assertAlmostEqual(revised["price"], first["price"], places=10)
        extra, main = revised["dividends"]
        self.assertEqual((extra["id"], extra["amount_per_share_ticks"]), ("EXTRA", "1000000"))
        self.assertEqual((main["id"], main["amount_per_share_ticks"]), ("MAIN", "9000000"))
        self.assertEqual(main["ex_at"], 1759500000)
        self.assertEqual(main["pay_at"], 1759932000)
        self.assertEqual(main["observed_at"], 1743689160)
        cancelled = query("14:07:00")["result"]["structuredContent"]
        self.assertEqual(cancelled["dividends"], [main])
        priced = query("14:06:00", volatility=.25)["result"]["structuredContent"]
        self.assertAlmostEqual(priced["price"], 14.171952, places=6)
        self.assertEqual(priced["volatility"], .25)
        self.assertEqual(priced["dividends"], revised["dividends"])
        self.assertEqual(query("14:06:00", cash_path="dividends.csv")["error"]["code"], -32602)
        self.assertEqual(query("14:06:00", volatility=True)["error"]["code"], -32602)
        self.assertEqual(query("14:06:00", steps=0)["error"]["code"], -32602)
        self.assertTrue(query("14:66:00")["result"]["isError"])
        self.assertEqual(query("14:04:00")["result"]["structuredContent"], first)


if __name__ == "__main__":
    unittest.main()
