from pathlib import Path
import os
from unittest import TestCase
from unittest.mock import patch

from marketweft_research import DividendLedgerSnapshot, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))
FIXTURES = ROOT / "crates/core/tests/fixtures"
INSTRUMENT = "DEMO:DIVIDEND"
REPORTS = (FIXTURES / "synthetic-dividend-withholding.csv").read_text(encoding="utf-8")
POSITIONS = (
    "instrument,effective_at,observed_at,shares\n"
    "DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-03T13:55:00Z,100\n"
    "DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-04T14:30:00Z,120\n"
)


class DividendLedgerTests(TestCase):
    def test_fixed_cutoffs_currency_reversal_and_rewind(self):
        engine = ResearchEngine(EXECUTABLE)

        def at(known):
            return engine.dividend_ledger(INSTRUMENT, REPORTS, shares=100, known_at=known)

        self.assertEqual(at("2025-06-02T14:04:59Z").events, ())
        ex = at("2025-06-03T14:00:00Z").events[-1]
        self.assertEqual((ex.kind, ex.entitled_shares, ex.movements[0].receivable), ("ex", 100, 50_000_000))
        pay = at("2025-06-04T14:00:00Z")
        self.assertIsInstance(pay, DividendLedgerSnapshot)
        self.assertEqual((pay.fixed_shares, pay.events[-1].kind), (100, "pay"))
        paid = pay.events[-1].movements[0]
        self.assertEqual((paid.cash, paid.withholding), (40_000_000, 10_000_000))
        correction = at("2025-06-04T14:40:00Z").events[-1]
        self.assertEqual([(row.currency, row.cash_delta, row.withholding_delta) for row in correction.movements],
                         [("USD", -43_000_000, -7_000_000), ("CAD", 48_000_000, 12_000_000)])
        cancelled = at("2025-06-04T15:15:00Z").events[-1].movements[0]
        self.assertEqual((cancelled.cash_delta, cancelled.withholding_delta), (0, -60_000_000))
        self.assertEqual(at("2025-06-04T14:00:00Z"), pay)

    def test_dated_entitlement_legacy_and_invalid_evidence(self):
        engine = ResearchEngine(EXECUTABLE)
        dated = engine.dividend_ledger(INSTRUMENT, REPORTS, positions_csv=POSITIONS, known_at="2025-06-04T14:30:00Z")
        self.assertIsNone(dated.fixed_shares)
        self.assertIsNone(dated.events[0].entitled_shares)
        late = dated.events[-1]
        self.assertEqual((late.kind, late.entitled_shares, late.withholding_per_share), ("entitlement", 120, 70_000))
        self.assertEqual((late.movements[0].cash_delta, late.movements[0].withholding_delta), (8_600_000, 1_400_000))
        legacy = (FIXTURES / "synthetic-cash-dividends.csv").read_text(encoding="utf-8")
        snapshot = engine.dividend_ledger(INSTRUMENT, legacy, shares=100)
        self.assertTrue(all(event.withholding_per_share is None for event in snapshot.events))
        self.assertTrue(all(row.withholding is None for event in snapshot.events for row in event.movements))
        for invalid in ({}, {"shares": True}, {"shares": 100, "positions_csv": POSITIONS},
                        {"shares": 0, "known_at": "2025-02-29T14:40:00Z"}):
            with self.assertRaises(ValueError):
                engine.dividend_ledger(INSTRUMENT, REPORTS, **invalid)
        wire = engine._invoke(
            f"marketweft-dividend-ledger\t1\tfixed\t{len(REPORTS)}\n{INSTRUMENT}\n\n100\n{REPORTS}".encode(),
            "dividend-ledger",
        )
        corrupt = wire.replace(b",40000000,10000000,10000000\n", b",40000000,10000000,10000001\n", 1)
        self.assertNotEqual(corrupt, wire)
        with patch.object(engine, "_invoke", return_value=corrupt):
            with self.assertRaisesRegex(ResearchError, "does not reconcile"):
                engine.dividend_ledger(INSTRUMENT, REPORTS, shares=100)
