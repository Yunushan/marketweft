import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "crates/core/tests/fixtures"
UNDERLYING = (FIXTURES / "synthetic-option-underlying.csv").read_text(encoding="utf-8")
QUOTES = (FIXTURES / "synthetic-option-exercise-quotes.csv").read_text(encoding="utf-8")
DEFAULT_BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / DEFAULT_BINARY))


def utc(time):
    return f"2025-04-03T{time}Z"


def contracts(snapshot):
    return {row.contract_id: row for row in snapshot.options}


class OptionSnapshotTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known, at="14:00:00", max_age=300, quotes=QUOTES):
        return self.engine.option_snapshot(
            UNDERLYING, quotes, effective_at=utc(at), known_at=utc(known), max_age=max_age,
        )

    def test_native_quotes_and_analytics_match_the_replay_cutoffs(self):
        initial = self.query("14:00:00")
        self.assertEqual((initial.instrument, initial.currency), ("DEMO:OPT", "USD"))
        self.assertEqual(initial.underlying.spot_ticks, 100_000_000)
        initial_rows = contracts(initial)
        self.assertNotIn("APR-AM-C90", initial_rows)
        call = initial_rows["APR-C100"]
        self.assertEqual((call.strike_ticks, call.bid_ticks, call.ask_ticks), (100_000_000, 8_807_321, 8_847_321))
        self.assertEqual((call.side, call.exercise_style, call.status), ("call", "european", "ok"))
        self.assertAlmostEqual(call.analytics.price, 8.827321)
        self.assertAlmostEqual(call.analytics.volatility, 0.2, places=6)
        self.assertGreater(call.analytics.delta, 0)
        self.assertGreater(call.analytics.gamma, 0)

        late = self.query("14:02:00")
        american = contracts(late)["APR-AM-C90"]
        self.assertEqual(american.exercise_style, "american")
        self.assertEqual(american.bid_ticks, 16_214_568)
        self.assertGreater(american.observed_at, american.quote_at)
        self.assertEqual(american.status, "american-volatility-required")
        self.assertIsNone(american.analytics)
        revised = self.query("14:03:00")
        self.assertEqual(revised.underlying.spot_ticks, 100_500_000)
        self.assertNotEqual(contracts(revised)["APR-C100"].analytics, call.analytics)
        self.assertEqual(self.query("14:05:00").underlying.spot_ticks, 100_500_000)
        self.assertEqual(self.query("14:05:00", at="14:01:00").underlying.spot_ticks, 101_000_000)
        self.assertEqual(self.query("14:00:00"), initial)

    def test_quote_statuses_and_empty_snapshot(self):
        initial = contracts(self.query("14:00:00"))
        self.assertEqual(initial["APR-C105"].status, "missing-bid-ask")
        self.assertIsNone(initial["APR-C105"].bid_ticks)
        self.assertEqual(initial["APR-P110"].status, "crossed")
        self.assertEqual(initial["APR-C120"].status, "stale-option")
        self.assertEqual(initial["APR-P75"].status, "price-bounds")
        self.assertEqual(contracts(self.query("14:04:00"))["APR-P110"].status, "ok")
        empty = self.query("13:00:00", at="13:00:00")
        self.assertIsNone(empty.underlying)
        self.assertEqual(empty.options, ())

    def test_invalid_query_or_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "maximum quote age"):
            self.query("14:00:00", max_age=True)
        with self.assertRaisesRegex(ResearchError, "UTC timestamps"):
            self.query("14:60:00")
        with self.assertRaises(ResearchError):
            self.query("14:00:00", quotes=QUOTES.replace(",USD,", ",EUR,"))
        row = b"Q\tAPR-C100\t10\t100\tcall\t1\t1\t1\t1\tok\tnan\t1\t1\t1\t1\t1\t1\teuropean\n"
        with patch.object(self.engine, "_invoke", return_value=b"marketweft-options\t1\tDEMO:OPT,USD\n" + row):
            with self.assertRaisesRegex(ResearchError, "Nonfinite option analytics"):
                self.query("14:00:00")
