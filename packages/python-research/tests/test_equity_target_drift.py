import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import EquityTargetReport, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
REPORTS = tuple(
    (FIXTURES / f"synthetic-{name}.csv").read_text(encoding="utf-8")
    for name in ("universe", "portfolio-holdings", "universe-prices", "delisting-terms", "equity-targets")
)
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))


def utc(minute: int) -> str:
    return f"2025-06-02T14:{minute:02}:00Z"


class EquityTargetDriftTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known: int, effective: int = 10):
        return self.engine.equity_target_drift_as_of(*REPORTS, effective_at=utc(effective), known_at=utc(known))

    def test_original_revised_and_withdrawn_targets_match_browser_values(self):
        early = self.query(11)
        self.assertEqual((early.effective_at, early.known_at), (1748873400, 1748873460))
        self.assertTrue(early.rows[1].in_equity)
        self.assertIsNone(early.rows[1].actual_weight_micros)
        self.assertEqual(early.rows[1].target, EquityTargetReport(1748872800, 1748873460, 60_000_000))
        self.assertIsNone(early.rows[1].drift_micros)
        original = self.query(12)
        self.assertEqual(original.rows[1].drift_micros, 13_298_429)
        self.assertEqual(self.query(16).rows[1].drift_micros, 1_227_080)
        self.assertEqual(self.query(12), original)
        successor, explicit_zero, withdrawn = self.query(45, 45).rows
        self.assertEqual((successor.currency, successor.listing_id, successor.drift_micros), ("EUR", "BETA-002", 0))
        self.assertEqual(explicit_zero.target.weight_micros, 0)
        self.assertFalse(withdrawn.in_equity)
        self.assertEqual(withdrawn.target, EquityTargetReport(1748874900, 1748874900, None))

    def test_rejects_invalid_source_bounds_and_inconsistent_native_responses(self):
        membership, holdings, prices, terms, targets = REPORTS
        with self.assertRaisesRegex(ValueError, "byte limit"):
            self.engine.equity_target_drift_as_of(membership, holdings, prices, "x" * (1024 * 1024 + 1), targets,
                                                  effective_at=utc(10), known_at=utc(10))
        with self.assertRaisesRegex(ValueError, "valid UTC"):
            self.engine.equity_target_drift_as_of(membership, holdings, prices, terms, targets,
                                                  effective_at="2025-02-29T00:00:00Z", known_at=utc(10))
        forged = (b"marketweft-equity-target-drift\t1\t1\nH\t1748873400\t1748873520\n"
                  b"USD\tBETA-001\t1\t73298429\t1748872800\t1748873460\t60000000\t0\n")
        with patch.object(self.engine, "_invoke", return_value=forged):
            with self.assertRaisesRegex(ResearchError, "does not match"):
                self.query(12)
        with patch.object(self.engine, "_invoke", return_value=forged.replace(b"1748873460", b"1748873580")):
            with self.assertRaisesRegex(ResearchError, "target report evidence"):
                self.query(12)
