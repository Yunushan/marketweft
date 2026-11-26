import os
from pathlib import Path
import unittest

from marketweft_research import ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
MEMBERSHIP = (FIXTURES / "synthetic-universe.csv").read_text(encoding="utf-8")
PRICES = (FIXTURES / "synthetic-universe-prices.csv").read_text(encoding="utf-8")
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))


def utc(time: str) -> str:
    return f"2025-06-02T{time}Z"


def ranks(rows):
    return [(row.listing_id, row.rank, row.return_units) for row in rows]


class ScreenTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, effective, known, prices=PRICES):
        return self.engine.screen_universe(MEMBERSHIP, prices, baseline_at=utc("14:00:00"),
                                            effective_at=utc(effective), known_at=utc(known))

    def test_membership_addition_removal_late_prices_and_revision_match_the_terminal(self):
        self.assertEqual(ranks(self.query("14:05:00", "14:05:00").rows), [("ALFA-001", 1, 10_000)])
        added = self.query("14:10:00", "14:10:00")
        self.assertEqual(added.universe, "DEMO-BASKET")
        self.assertEqual(ranks(added.rows), [("ALFA-001", 1, 20_000), ("BETA-001", None, None)])
        self.assertEqual(added.rows[1].baseline.ticks, 50_000_000)
        self.assertIsNone(added.rows[1].current)
        self.assertEqual(added.rows[1].membership_change_id, "BETA-JOIN")
        self.assertLess(added.rows[1].membership_observed_at, added.rows[1].membership_effective_at)
        observed = self.query("14:10:00", "14:12:00")
        self.assertEqual(ranks(observed.rows), [("BETA-001", 1, 120_000), ("ALFA-001", 2, 20_000)])
        revised = self.query("14:10:00", "14:16:00")
        self.assertEqual(ranks(revised.rows), [("ALFA-001", 1, 20_000), ("BETA-001", 2, 10_000)])
        self.assertEqual(revised.rows[1].current.ticks, 50_500_000)
        self.assertGreater(revised.rows[1].current.observed_at, observed.rows[0].current.observed_at)
        self.assertEqual(ranks(self.query("14:20:00", "14:24:59").rows),
                         [("BETA-001", 1, 80_000), ("ALFA-001", 2, 40_000)])
        self.assertEqual(ranks(self.query("14:20:00", "14:25:00").rows), [("BETA-001", 1, 80_000)])
        self.assertEqual(self.query("14:35:00", "14:35:00").rows, ())
        relisted = self.query("14:45:00", "14:45:00")
        self.assertEqual(ranks(relisted.rows), [("BETA-002", None, None)])
        self.assertIsNone(relisted.rows[0].baseline)
        self.assertEqual(relisted.rows[0].current.ticks, 75_000_000)
        self.assertEqual(self.query("14:10:00", "14:10:00"), added)

    def test_large_return_survives_the_native_protocol_exactly(self):
        prices = (
            "universe,listing_id,price_at,observed_at,close\n"
            "DEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,0.000001\n"
            "DEMO-BASKET,ALFA-001,2025-06-02T14:05:00Z,2025-06-02T14:05:00Z,2000000000\n"
        )
        row, = self.query("14:05:00", "14:05:00", prices).rows
        self.assertEqual(row.baseline.ticks, 1)
        self.assertEqual(row.return_units, (2_000_000_000_000_000 - 1) * 1_000_000)

    def test_rejects_invalid_cutoffs_and_foreign_price_reports(self):
        with self.assertRaisesRegex(ResearchError, "Screen times require"):
            self.query("14:61:00", "14:10:00")
        with self.assertRaisesRegex(ResearchError, "universe IDs must match"):
            self.query("14:10:00", "14:10:00", PRICES.replace("DEMO-BASKET", "FOREIGN"))


if __name__ == "__main__":
    unittest.main()
