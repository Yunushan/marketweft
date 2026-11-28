import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import FormulaFunction, ResearchEngine, ResearchError, ScalarPluginPoint


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "crates/core/tests/fixtures/synthetic-formula-bars.csv"
CSV = FIXTURE.read_text(encoding="utf-8")
EXPRESSION = "ema(if(close == 11, close / 0, close), 2)"
EXPECTED = (None, 11000000, None, None, 14500000, 16833333)
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))
PLUGIN_FIXTURE = FIXTURE.parent / "scalar-plugins.txt"
PLUGIN_HEX = dict(line.split() for line in PLUGIN_FIXTURE.read_text(encoding="utf-8").splitlines()
                  if not line.startswith("#"))
PLUGIN_CLOSES = (
    "time,open,high,low,close,volume\n"
    "60,-0.000005,-0.000005,-0.000005,-0.000005,1\n"
    "180,0.000003,0.000003,0.000003,0.000003,1\n"
    "240,-0.000001,-0.000001,-0.000001,-0.000001,1\n"
)


def plugin(name):
    return bytes.fromhex(PLUGIN_HEX[name])


class ResearchTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def test_every_observed_prefix_matches_the_rust_and_wasm_fixture(self):
        full = self.engine.evaluate_formula(EXPRESSION, CSV)
        self.assertEqual(full.version, 1)
        self.assertEqual(tuple(row.value for row in full.rows), EXPECTED)
        self.assertEqual(self.engine.evaluate_formula(EXPRESSION, CSV, observed_through=0).rows, ())
        for index, row in enumerate(full.rows):
            prefix = self.engine.evaluate_formula(EXPRESSION, CSV, observed_through=row.observed_at)
            self.assertEqual(prefix.rows, full.rows[:index + 1])

    def test_scoped_libraries_preserve_missing_values_and_do_not_leak_between_calls(self):
        functions = (
            FormulaFunction("gap", ("x",), "if(x == 11, x / 0,\n x)"),
            FormulaFunction("smooth", ("x",), "ema(gap(x), 2)"),
        )
        scoped = self.engine.evaluate_formula("smooth(close)", CSV, functions=functions)
        self.assertEqual(tuple(row.value for row in scoped.rows), EXPECTED)
        with self.assertRaisesRegex(ResearchError, "Unknown formula field or function"):
            self.engine.evaluate_formula("smooth(close)", CSV)
        with self.assertRaisesRegex(ResearchError, "explicit parameter"):
            self.engine.evaluate_formula("gap(close)", CSV, functions=(FormulaFunction("gap", ("x",), "x + high"),))
        self.assertEqual(self.engine.evaluate_formula("smooth(close)", CSV, functions=functions), scoped)

    def test_scalar_plugins_match_the_rust_and_wasm_fixture(self):
        evaluate = self.engine.evaluate_scalar_plugin
        self.assertEqual(evaluate(plugin("increment"), -123456789), -123456788)
        self.assertEqual(evaluate(plugin("increment"), -(1 << 63)), -(1 << 63) + 1)
        self.assertEqual(evaluate(plugin("state"), 80), 1)
        self.assertEqual(evaluate(plugin("state"), 80), 1)
        with self.assertRaisesRegex(ResearchError, "cannot import"):
            evaluate(plugin("import"), 0)
        with self.assertRaisesRegex(ResearchError, "exhausted its execution budget"):
            evaluate(plugin("fuel"), 0)
        self.assertEqual(evaluate(plugin("increment"), 0), 1)

    def test_scalar_plugin_series_preserves_exact_cutoffs_and_fresh_state(self):
        def evaluate(name, start, end):
            return self.engine.evaluate_scalar_plugin_series(
                plugin(name), PLUGIN_CLOSES, from_second=start, through_second=end,
            )

        self.assertEqual(evaluate("increment", 0, 59), ())
        first = (ScalarPluginPoint(60, -5, -4),)
        self.assertEqual(evaluate("increment", 60, 60), first)
        self.assertEqual(evaluate("increment", 60, 180), first + (ScalarPluginPoint(180, 3, 4),))
        self.assertEqual(evaluate("increment", 60, 60), first)
        self.assertEqual(tuple(row.value for row in evaluate("state", 0, 240)), (1, 1, 1))
        with self.assertRaisesRegex(ValueError, "ordered UTC range"):
            evaluate("increment", 180, 60)
        with self.assertRaisesRegex(ResearchError, "execution budget"):
            evaluate("fuel", 60, 240)
        window = "time,open,high,low,close,volume\n" + "".join(f"{time},1,1,1,1,1\n" for time in range(256))
        with self.assertRaisesRegex(ResearchError, "execution budget"):
            self.engine.evaluate_scalar_plugin_series(plugin("counted"), window, from_second=0, through_second=255)
        self.assertEqual(evaluate("increment", 240, 240), (ScalarPluginPoint(240, -1, 0),))

    def test_scalar_plugin_series_rejects_malformed_frames_and_responses(self):
        for frame, message in (
            (b"marketweft-scalar-series\t2\t0\t0\t60\n", b"protocol version"),
            (b"marketweft-scalar-series\t1\t65537\t0\t60\n", b"module length"),
            (b"marketweft-scalar-series\t1\t4\t0\t60\nx", b"Truncated"),
        ):
            with self.subTest(frame=frame):
                result = subprocess.run([EXECUTABLE, "scalar-plugin-series"], input=frame, capture_output=True, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")
                self.assertIn(message, result.stderr)
        for response, message in (
            (b"2\n60\t1\t2\n", "row count"),
            (b"1\n61\t1\t2\n", "ordered within"),
            (b"2\n60\t1\t2\n60\t2\t3\n", "ordered within"),
            (b"1\n60\t1\t9223372036854775808\n", "signed 64-bit"),
        ):
            with self.subTest(response=response):
                with patch.object(self.engine, "_invoke", return_value=b"marketweft-scalar-series\t1\t" + response):
                    with self.assertRaisesRegex(ResearchError, message):
                        self.engine.evaluate_scalar_plugin_series(
                            plugin("increment"), PLUGIN_CLOSES, from_second=0, through_second=60,
                        )

    def test_scalar_plugin_wire_and_input_limits(self):
        evaluate = self.engine.evaluate_scalar_plugin
        with self.assertRaisesRegex(TypeError, "bytes"):
            evaluate("module.wasm", 0)
        with self.assertRaisesRegex(ValueError, "64 KiB"):
            evaluate(bytes(65537), 0)
        for ticks in (True, 1.5, 1 << 63, -(1 << 63) - 1):
            with self.subTest(ticks=ticks), self.assertRaisesRegex(ValueError, "signed 64-bit"):
                evaluate(b"", ticks)
        for frame, message in (
            (b"marketweft-scalar-plugin\t2\t0\nmodule", b"protocol version"),
            (b"marketweft-scalar-plugin\t1\t9223372036854775808\nmodule", b"signed 64-bit"),
            (b"unsplit", b"Missing scalar plugin request header"),
            (b"marketweft-scalar-plugin\t1\t0\nmodule", b"Invalid scalar plugin"),
        ):
            with self.subTest(frame=frame):
                result = subprocess.run([EXECUTABLE, "scalar-plugin"], input=frame, capture_output=True, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")
                self.assertIn(message, result.stderr)

    def test_rejects_lookahead_and_invalid_protocol_frames(self):
        with self.assertRaisesRegex(ResearchError, "literal window or lag"):
            self.engine.evaluate_formula("lag(close, -1)", CSV)
        with self.assertRaisesRegex(ValueError, "UTC second"):
            self.engine.evaluate_formula("close", CSV, observed_through=True)
        reply = subprocess.run(
            [EXECUTABLE], input=b"marketweft-research\t2\t5\t0\t\nclose",
            capture_output=True, check=False,
        )
        self.assertNotEqual(reply.returncode, 0)
        self.assertEqual(reply.stdout, b"")
        self.assertIn(b"protocol version", reply.stderr)


if __name__ == "__main__":
    unittest.main()
