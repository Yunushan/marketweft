import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import FinancialMultiple, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
FILINGS = (FIXTURES / "synthetic-financial-periods.csv").read_text(encoding="utf-8")
CAPS = (FIXTURES / "synthetic-financial-market-caps.csv").read_text(encoding="utf-8")
LEGACY = (FIXTURES / "synthetic-financial-filings.csv").read_text(encoding="utf-8")
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))


def utc(time: str) -> str:
    return f"2025-04-03T{time}Z"


class FinancialTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known, filings=FILINGS, caps=CAPS, at="14:00:00", issuer="DEMO-ALFA"):
        return self.engine.financial_snapshot(
            filings, caps, issuer=issuer, valuation_at=utc(at), known_at=utc(known),
        )

    def test_late_quarter_and_restatement_reproduce_the_terminal(self):
        early = self.query("14:04:59")
        self.assertEqual(early.issuer, "DEMO-ALFA")
        self.assertEqual(early.filing.source_id, "ALFA-FY24")
        self.assertEqual(early.market_cap.ticks, 12_000_000_000_000_000)
        self.assertEqual(tuple(row.source_id for row in early.quarters), ("ALFA-Q1", "ALFA-Q3", "ALFA-Q4"))
        self.assertEqual(early.trailing.kind, "insufficient-quarters")
        self.assertIsNone(early.quarterly_valuation.price_earnings)
        self.assertEqual(early.quarterly_valuation.price_book, FinancialMultiple("value", 4_000_000))
        complete = self.query("14:05:00")
        self.assertEqual(complete.quarters[1].source_id, "ALFA-Q2")
        self.assertEqual(complete.trailing.revenue, 6_000_000_000_000_010)
        self.assertEqual(complete.trailing.operating_cash_flow, 700_000_000_000_003)
        self.assertEqual(complete.quarterly_valuation.price_sales, FinancialMultiple("value", 2_000_000))
        revised = self.query("14:22:00")
        self.assertEqual(revised.quarters[-1].source_id, "ALFA-Q4-A1")
        self.assertEqual(revised.filing.source_id, "ALFA-FY24-A1")
        self.assertEqual(revised.trailing.revenue, 8_000_000_000_000_010)
        self.assertEqual(revised.trailing.operating_cash_flow, -250_000_000_000_005)
        self.assertIsNone(revised.trailing.common_net_income)
        self.assertEqual(revised.annual_valuation.price_earnings, FinancialMultiple("value", 15_000_000))
        self.assertEqual(revised.quarterly_valuation.price_sales, FinancialMultiple("value", 1_500_000))
        self.assertEqual(revised.quarterly_valuation.price_book.kind, "missing-denominator")
        self.assertEqual(self.query("14:05:00"), complete)

    def test_exact_wide_totals_and_unavailable_statuses(self):
        large = FILINGS.replace("1000000000.000001", "100000000000000000000.000001")
        self.assertEqual(self.query("14:05:00", large).trailing.revenue, 100_000_000_005_000_000_000_000_010)
        legacy = self.query("14:05:00", LEGACY, caps=None)
        self.assertEqual(legacy.quarters, ())
        self.assertIsNone(legacy.market_cap)
        self.assertEqual(legacy.annual_valuation.price_earnings.kind, "missing-cap")
        foreign = FILINGS.replace("14:05:00Z,USD", "14:05:00Z,EUR")
        mixed = self.query("14:05:00", foreign)
        self.assertEqual(mixed.trailing.kind, "currency")
        self.assertIsNone(mixed.quarterly_valuation.price_sales)
        self.assertEqual(mixed.quarterly_valuation.price_book, FinancialMultiple("value", 4_000_000))
        gap = FILINGS.replace("2024-04-01,2024-06-30", "2024-04-02,2024-06-30")
        self.assertEqual(self.query("14:05:00", gap).trailing.kind, "noncontiguous")
        self.assertEqual(self.query("14:35:00", at="14:30:00").quarterly_valuation.price_sales.kind, "currency")

    def test_rejects_invalid_queries_and_bad_engine_responses(self):
        with self.assertRaisesRegex(ValueError, "ASCII issuer"):
            self.query("14:05:00", issuer="bad\tissuer")
        with self.assertRaisesRegex(ResearchError, "UTC timestamps"):
            self.query("14:65:00")
        with self.assertRaisesRegex(ResearchError, "Select an issuer"):
            self.query("14:05:00", issuer="UNKNOWN")
        with patch.object(self.engine, "_invoke", return_value=b"marketweft-financial\t1\tOTHER\n"):
            with self.assertRaisesRegex(ResearchError, "Unexpected issuer"):
                self.query("14:05:00")
        with patch.object(self.engine, "_invoke", return_value=b"marketweft-financial\t1\tDEMO-ALFA\n"):
            with self.assertRaisesRegex(ResearchError, "Incomplete financial"):
                self.query("14:05:00")
