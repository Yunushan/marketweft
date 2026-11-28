import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
MEMBERS, PRICES = (
    (FIXTURES / f"synthetic-listing-risk-{name}.csv").read_text(encoding="utf-8")
    for name in ("membership", "prices")
)
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))


def utc(minute: int) -> str:
    return f"2025-06-02T14:{minute:02}:00Z"


class PortfolioAllocationTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known: int, membership=MEMBERS, prices=PRICES, listings=("B", "A"), maximum=None):
        return self.engine.portfolio_allocation_as_of(
            membership, prices, listings, from_at=utc(0), through_at=utc(6), known_at=utc(known), interval_seconds=60,
            maximum_weight_basis_points=maximum,
        )

    def test_native_matches_browser_at_late_and_rewound_samples(self):
        early = self.query(1)
        self.assertEqual((early.expected_returns, early.common_returns), (6, 1))
        self.assertIsNone(early.sample)
        self.assertTrue(all(row.optimized_basis_points is None for row in early.listings))
        original = self.query(6)
        self.assertEqual((original.from_at, original.through_at, original.known_at, original.interval_seconds),
                         (1748872800, 1748873160, 1748873160, 60))
        self.assertEqual(original.common_returns, 4)
        self.assertEqual([(row.listing_id, row.known_returns, row.optimized_basis_points) for row in original.listings],
                         [("A", 6, 5000), ("B", 4, 5000)])
        self.assertEqual(original.sample.optimized_volatility, 0.0)
        self.assertEqual(self.query(7).common_returns, 6)
        self.assertEqual(self.query(6), original)

        membership = MEMBERS + f"RISK,C-ADD,C,DEMO:GAMMA,{utc(0)},{utc(0)},add\n"
        prices = PRICES.replace(",90\n", ",120\n") + "".join(
            f"RISK,C,{utc(at)},{utc(observed)},10\n" for at, observed in ((0, 0), (1, 1), (2, 7))
        )
        three = self.query(7, membership, prices, ("C", "B", "A"))
        self.assertEqual(three.common_returns, 2)
        self.assertEqual([row.optimized_basis_points for row in three.listings], [0, 0, 10_000])
        capped = self.query(7, membership, prices, ("C", "B", "A"), 6000)
        self.assertIsNone(three.maximum_weight_basis_points)
        self.assertEqual(capped.maximum_weight_basis_points, 6000)
        self.assertEqual([row.optimized_basis_points for row in capped.listings], [4000, 0, 6000])
        sparse = self.query(6, membership, prices, ("A", "B", "C"), 6000)
        self.assertEqual((sparse.common_returns, sparse.maximum_weight_basis_points, sparse.sample), (1, 6000, None))
        self.assertEqual(self.query(6, membership, prices, ("C", "A", "B"), 6000), sparse)
        for maximum in (True, 3333, 6000.5, 10_001):
            with self.assertRaisesRegex(ValueError, "fully allocated"):
                self.query(6, membership, prices, ("A", "B", "C"), maximum)

    def test_rejects_invalid_source_bounds_and_inconsistent_native_results(self):
        with self.assertRaisesRegex(ValueError, "distinct"):
            self.query(6, listings=("A", "A"))
        with self.assertRaisesRegex(ValueError, "input limits"):
            self.query(6, membership="é" * (512 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, "grid"):
            self.engine.portfolio_allocation_as_of(
                MEMBERS, PRICES, ("A", "B"), from_at=utc(0), through_at=utc(6), known_at=utc(6), interval_seconds=70,
            )
        valid = (
            b"marketweft-portfolio-allocation\t1\t2\nT\t1748872800\t1748873160\t1748873160\t60\n"
            b"6\t4\n0\t0\t0\t0\t0\t0\nA\t6\t5000\t5000\nB\t4\t5000\t5000\n"
        )
        altered = (
            (valid.replace(b"3160\t60", b"3180\t60"), "cutoffs"),
            (valid.replace(b"B\t4", b"B\t2"), "coverage"),
            (valid.replace(b"B\t4\t5000\t5000", b"B\t4\t5000\t4999"), "sum"),
            (valid.replace(b"0\t0\t0\t0\t0\t0", b"0\t0\t0\tNaN\t0\t0"), "statistics"),
        )
        for response, phrase in altered:
            with patch.object(self.engine, "_invoke", return_value=response):
                with self.assertRaisesRegex(ResearchError, phrase):
                    self.query(6)
        capped = valid.replace(b"\t1\t2\nT", b"\t2\t2\nT").replace(b"3160\t60\n", b"3160\t60\t5000\n")
        for response, phrase in (
            (valid, "protocol version"),
            (capped.replace(b"\t60\t5000\n", b"\t60\t6000\n"), "maximum weight"),
            (capped.replace(b"A\t6\t5000\t5000", b"A\t6\t5000\t5001"), "Invalid portfolio allocation weights"),
        ):
            with patch.object(self.engine, "_invoke", return_value=response):
                with self.assertRaisesRegex(ResearchError, phrase):
                    self.query(6, maximum=5000)
