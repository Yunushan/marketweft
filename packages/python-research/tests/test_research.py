import os
from pathlib import Path
import subprocess
import unittest

from marketweft_research import FormulaFunction, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "crates/core/tests/fixtures/synthetic-formula-bars.csv"
CSV = FIXTURE.read_text(encoding="utf-8")
EXPRESSION = "ema(if(close == 11, close / 0, close), 2)"
EXPECTED = (None, 11000000, None, None, 14500000, 16833333)
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))


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
        fixture = (FIXTURE.parent / "scalar-plugins.txt").read_text(encoding="utf-8")
        binaries = dict(line.split() for line in fixture.splitlines() if not line.startswith("#"))
        modules = {name: bytes.fromhex(value) for name, value in binaries.items()}
        evaluate = self.engine.evaluate_scalar_plugin
        self.assertEqual(evaluate(modules["increment"], -123456789), -123456788)
        self.assertEqual(evaluate(modules["increment"], -(1 << 63)), -(1 << 63) + 1)
        self.assertEqual(evaluate(modules["state"], 80), 1)
        self.assertEqual(evaluate(modules["state"], 80), 1)
        with self.assertRaisesRegex(ResearchError, "cannot import"):
            evaluate(modules["import"], 0)
        with self.assertRaisesRegex(ResearchError, "exhausted its execution budget"):
            evaluate(modules["fuel"], 0)
        self.assertEqual(evaluate(modules["increment"], 0), 1)

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
