import unittest
from unittest.mock import Mock

from marketweft_research import ResearchEngine, ResearchError, _rank_comparison_result
from marketweft_research import mcp


def wire_result(move="-1"):
    legs = [
        ["0,BETA-JOIN,1748873400,1748873100", "1", "120000", "50000000,1748872800", "56000000,1748873520"],
        ["0,BETA-JOIN,1748873400,1748873100", "2", "10000", "50000000,1748872800", "50500000,1748873760"],
    ]
    return ("marketweft-rank-comparison\t1\tDEMO-BASKET\n" +
            "\t".join(["BETA-001", "DEMO:BETA", *legs[0], *legs[1], move]) + "\n").encode("ascii")


class RankComparisonWireTest(unittest.TestCase):
    def test_exact_native_result_and_reject_inconsistent_movement(self):
        result = _rank_comparison_result(wire_result())
        self.assertEqual(result.universe, "DEMO-BASKET")
        beta, = result.rows
        self.assertEqual(beta.before.current.ticks, 56_000_000)
        self.assertEqual(beta.after.current.observed_at, 1748873760)
        self.assertEqual(beta.rank_move, -1)
        with self.assertRaisesRegex(ResearchError, "Inconsistent membership or movement"):
            _rank_comparison_result(wire_result("1"))

    def test_mcp_lists_read_only_tool_and_pages_the_engine_result(self):
        engine = Mock(spec=ResearchEngine)
        engine.compare_universe_ranks.return_value = _rank_comparison_result(wire_result())
        server = mcp.ResearchServer(engine)

        def send(method, request_id=None, params=None):
            request = {"jsonrpc": "2.0", "method": method}
            if request_id is not None:
                request["id"] = request_id
            if params is not None:
                request["params"] = params
            return server.handle(request)

        send("initialize", 1, {"protocolVersion": "2025-11-25"})
        send("notifications/initialized")
        tools = send("tools/list", 2)["result"]["tools"]
        tool, = [tool for tool in tools if tool["name"] == mcp.RANK_COMPARISON_TOOL_NAME]
        self.assertTrue(tool["annotations"]["readOnlyHint"])
        arguments = {
            "membership_csv": "membership", "prices_csv": "prices",
            "baseline_at": "2025-06-02T14:00:00Z",
            "before_effective_at": "2025-06-02T14:10:00Z", "before_known_at": "2025-06-02T14:12:00Z",
            "after_effective_at": "2025-06-02T14:10:00Z", "after_known_at": "2025-06-02T14:16:00Z",
        }
        params = {"name": mcp.RANK_COMPARISON_TOOL_NAME, "arguments": {**arguments, "limit": 1}}
        result = send("tools/call", 3, params)["result"]["structuredContent"]
        self.assertEqual(result["after_known_at"], arguments["after_known_at"])
        self.assertEqual(result["rows"][0]["after"]["return_units"], "10000")
        self.assertEqual(result["rows"][0]["after"]["current"]["ticks"], "50500000")
        self.assertIsNone(result["next_offset"])
        engine.compare_universe_ranks.assert_called_once_with(**arguments)
        params["arguments"]["offset"] = 1
        self.assertEqual(send("tools/call", 4, params)["result"]["structuredContent"]["rows"], [])
