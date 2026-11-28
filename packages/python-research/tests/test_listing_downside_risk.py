import math
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
MEMBERSHIP = (FIXTURES / "synthetic-listing-risk-membership.csv").read_text(encoding="utf-8")
PRICES = (FIXTURES / "synthetic-listing-risk-prices.csv").read_text(encoding="utf-8")
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))


def utc(minute):
    return f"2025-06-02T14:0{minute}:00Z"


class ListingDownsideRiskTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def request(self, known=6, **overrides):
        options = dict(from_at=utc(0), through_at=utc(6), known_at=utc(known), interval_seconds=60, window_periods=3)
        options.update(overrides)
        return self.engine.listing_downside_risk_as_of(MEMBERSHIP, PRICES, "A", "B", **options)

    def test_installed_engine_reproduces_window_coverage_and_cutoff_rewind(self):
        early = self.request()
        self.assertEqual((early.left_listing_id, early.right_listing_id, early.from_at, early.through_at, early.known_at),
                         ("A", "B", 1748872800, 1748873160, 1748873160))
        first = early.rows[0]
        self.assertEqual((first.paired_returns, first.left_loss_returns, first.right_loss_returns), (1, 0, 1))
        self.assertEqual(first.left_downside, 0.0)
        self.assertAlmostEqual(first.right_downside, 0.1, places=14)
        self.assertEqual(first.right_volatility, None)
        complete = self.request(7).rows[0]
        self.assertEqual((complete.right_returns, complete.right_loss_returns), (3, 2))
        self.assertAlmostEqual(complete.right_downside, 0.1 * math.sqrt(2 / 3), places=14)
        self.assertAlmostEqual(self.request(7, volatility_periods=4).rows[0].right_downside,
                               2 * complete.right_downside, places=14)
        self.assertEqual(self.request(8).rows[-1].left_returns, 1)
        self.assertTrue(all(row.left_downside is None and row.right_downside is None for row in self.request(0).rows))
        self.assertEqual(self.request(), early)
        self.assertEqual(self.request(through_at=utc(1)).rows, ())

    def test_rejects_invalid_queries_and_inconsistent_return_evidence(self):
        for field, value in (("window_periods", 1), ("interval_seconds", 70), ("volatility_periods", True),
                             ("known_at", "2025-02-29T14:00:00Z")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.request(**{field: value})
        header = b"marketweft-listing-downside-risk\t1\t1\nH\t1748872800\t1748872980\t1748873160\tA\tB\t60\t3\t1\n"
        record = b"R\t1748872800\t1748872980\t3\t3\t1\t1\t0\t1\t0.0577350269189626\t\t\t0\t0.1\n"
        for changed, message in (
            (header.replace(b"\tA\tB\t", b"\tB\tA\t") + record, "requested cutoffs"),
            (header + record.replace(b"\t1748872980\t", b"\t1748872920\t"), "window bounds"),
            (header + record.replace(b"\t0.1\n", b"\tinf\n"), "available returns"),
            (header + record.replace(b"\t0.1\n", b"\t0\n"), "losses or pairs"),
        ):
            with patch.object(self.engine, "_invoke", return_value=changed), self.assertRaisesRegex(ResearchError, message):
                self.request(through_at=utc(3))
