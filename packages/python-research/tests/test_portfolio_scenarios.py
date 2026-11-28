import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import PortfolioScenarioPath, ResearchEngine, ResearchError, ScenarioAllocation


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
MEMBERSHIP = (FIXTURES / "synthetic-listing-risk-membership.csv").read_text(encoding="utf-8")
PRICES = (FIXTURES / "synthetic-listing-risk-prices.csv").read_text(encoding="utf-8")
EXECUTABLE = os.environ.get("MARKETWEFT_RESEARCH_BIN", str(
    ROOT / "target/release" / ("marketweft-research.exe" if os.name == "nt" else "marketweft-research")))
ALLOCATIONS = (ScenarioAllocation("B", 5000), ScenarioAllocation("A", 5000))


def utc(minute):
    return f"2025-06-02T14:{minute:02}:00Z"


class PortfolioScenariosTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, minute=6, **changes):
        settings = dict(from_at=utc(0), through_at=utc(6), known_at=utc(minute),
                        interval_seconds=60, starting_value="100", fee_basis_points=100,
                        seed=9007199254740993, paths=5, horizon=4, block_size=3)
        return self.engine.portfolio_scenarios(MEMBERSHIP, PRICES, ALLOCATIONS, **(settings | changes))

    def test_block_coverage_and_exact_paths_follow_observation_cutoffs(self):
        early = self.query()
        self.assertEqual((early.eligible_vectors, early.block_size, early.eligible_blocks), (4, 3, 1))
        self.assertEqual(early.paths, (PortfolioScenarioPath(99950000, 500, 50000),) * 5)
        self.assertEqual(early.ending_value, (99950000,) * 3)
        self.assertEqual([(row.listing_id, row.known_returns) for row in early.coverage], [("A", 6), ("B", 4)])
        self.assertEqual(self.query(7).eligible_blocks, 4)
        self.assertEqual(self.query(8).eligible_blocks, 2)
        self.assertEqual(self.query(), early)
        independent = self.query(block_size=1)
        self.assertEqual((independent.block_size, independent.eligible_blocks), (1, 4))
        with self.assertRaisesRegex(ResearchError, "No complete return block"):
            self.query(block_size=4)
        with self.assertRaisesRegex(ValueError, "unsigned 64-bit"):
            self.query(seed=1 << 64)
        with self.assertRaisesRegex(ValueError, "starting value"):
            self.query(starting_value="1\n100")

    def test_native_and_sdk_check_protocol_lengths_and_result_rows(self):
        membership = MEMBERSHIP.encode()
        command = [EXECUTABLE, "portfolio-scenarios"]
        header = f"marketweft-portfolio-scenarios\t1\t{len(membership)}\n"
        request = ("\n".join((header.rstrip("\n"), utc(0), utc(6), utc(6), "60", "100", "100",
                              "9007199254740993", "5", "4:3", "B=5000\tA=5000", "")).encode()
                   + membership + PRICES.encode())
        response = subprocess.run(command, input=request, capture_output=True, check=True).stdout
        self.assertTrue(response.startswith(b"marketweft-portfolio-scenarios\t1\t5\nH\t6\t4\t5\t3\t1\n"))
        self.assertTrue(response.endswith(b"P\t99950000\t500\t50000\n"))
        for malformed in (request.replace(b"\t1\t", b"\t2\t", 1), b"\xff",
                          request.replace(header.encode(), b"marketweft-portfolio-scenarios\t1\t99999999\n")):
            result = subprocess.run(command, input=malformed, capture_output=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, b"")
        with patch.object(self.engine, "_invoke", return_value=response.replace(b"A\tA\t5000", b"A\tB\t5000", 1)):
            with self.assertRaisesRegex(ResearchError, "match the requested allocations"):
                self.query()
        with patch.object(self.engine, "_invoke", return_value=response[:-1]):
            with self.assertRaisesRegex(ResearchError, "Incomplete research result"):
                self.query()
