from datetime import datetime
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import EquityConcentrationPosition, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
REPORTS = tuple((FIXTURES / f"synthetic-{name}.csv").read_text(encoding="utf-8")
                for name in ("universe", "portfolio-holdings", "universe-prices"))
EXECUTABLE = os.environ.get("MARKETWEFT_RESEARCH_BIN", str(
    ROOT / "target/release" / ("marketweft-research.exe" if os.name == "nt" else "marketweft-research")))


def utc(minute):
    return f"2025-06-02T14:{minute:02}:00Z"


class EquityConcentrationTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known, effective=10):
        return self.engine.equity_concentration_as_of(*REPORTS, effective_at=utc(effective), known_at=utc(known))

    def test_cutoffs_match_terminal_for_late_prices_revisions_and_ticker_reuse(self):
        early = self.query(10)
        cutoff = int(datetime.fromisoformat(utc(10)[:-1] + "+00:00").timestamp())
        self.assertEqual((early.effective_at, early.known_at), (cutoff, cutoff))
        self.assertEqual(early.groups[0].positions, (
            EquityConcentrationPosition("ALFA-001", 204_000_000, 1, 100_000_000),
            EquityConcentrationPosition("BETA-001", None, None, None),
        ))
        self.assertEqual([self.query(known).groups[0].gross_mark for known in (10, 12, 16, 10)],
                         [204_000_000, 764_000_000, 709_000_000, 204_000_000])
        self.assertEqual(self.query(12).groups[0].positions[0],
                         EquityConcentrationPosition("BETA-001", 560_000_000, 1, 73_298_429))
        self.assertEqual(self.query(16).groups[0].positions[0].weight_micros, 71_227_080)
        self.assertEqual(self.query(10), early)
        self.assertEqual([(group.currency, group.gross_mark, group.positions[0].listing_id)
                          for group in self.query(45, 45).groups],
                         [("EUR", 225_000_000, "BETA-002"), ("USD", None, "ALFA-001")])
        self.assertIsNone(self.query(6, 6).groups[0].currency)
        self.assertEqual(self.engine.equity_concentration_as_of(
            *REPORTS, effective_at="2025-06-02T13:59:59Z", known_at=utc(0),
        ).groups, ())

    def test_native_length_and_response_validation(self):
        membership, holdings, prices = (report.encode("utf-8") for report in REPORTS)
        prefix = f"marketweft-equity-concentration\t1\t{len(membership)}\t{len(holdings)}"
        request = f"{prefix}\n{utc(10)}\n{utc(12)}\n".encode() + membership + holdings + prices
        command = [EXECUTABLE, "equity-concentration"]
        response = subprocess.run(command, input=request, capture_output=True, check=True).stdout
        self.assertTrue(response.startswith(b"marketweft-equity-concentration\t1\t1\nH\t"))
        self.assertIn(b"G\tUSD\t764000000\nE\tBETA-001\t560000000\t1\t73298429\n", response)
        for malformed in (b"\xff", request.replace(b"\t1\t", b"\t2\t", 1),
                          request.replace(prefix.encode(), b"marketweft-equity-concentration\t1\t9999999\t1")):
            result = subprocess.run(command, input=malformed, capture_output=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, b"")
        for corrupted in (response[:-1], response.replace(b"73298429", b"73298428"),
                          response.replace(b"764000000", b"764000001"),
                          response.replace(b"ALFA-001", b"BETA-001")):
            with patch.object(self.engine, "_invoke", return_value=corrupted):
                with self.assertRaises(ResearchError):
                    self.query(12)
        with self.assertRaisesRegex(ValueError, "valid UTC"):
            self.engine.equity_concentration_as_of(*REPORTS, effective_at="2025-02-29T00:00:00Z", known_at=utc(0))
        with self.assertRaisesRegex(ValueError, "byte limit"):
            self.engine.equity_concentration_as_of("x" * (1024 * 1024 + 1), REPORTS[1], REPORTS[2],
                                                   effective_at=utc(10), known_at=utc(12))
