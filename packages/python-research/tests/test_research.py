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
