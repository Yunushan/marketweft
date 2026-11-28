import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))
FIXTURES = ROOT / "crates/core/tests/fixtures"
CALENDAR = (FIXTURES / "synthetic-session-volume-calendar.csv").read_text(encoding="utf-8")
BARS = (FIXTURES / "synthetic-session-volume-bars.csv").read_text(encoding="utf-8")


class SessionRelativeVolumeTests(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def run_volume(self, known_at, lookback=2):
        return self.engine.session_relative_volume(
            CALENDAR, BARS, interval_seconds=60, lookback_sessions=lookback, known_at=known_at,
        )

    def test_exact_cutoffs_and_source_evidence(self):
        self.assertEqual(self.run_volume("2025-10-31T13:30:59Z").rows, ())
        at_close = self.run_volume("2025-11-05T14:31:00Z")
        self.assertEqual(self.run_volume("2025-11-05T14:30:59Z").rows, at_close.rows[:-1])
        point = at_close.rows[-1]
        self.assertEqual((point.previous_sessions, point.contributing_sessions), (2, 2))
        self.assertEqual((point.volume_ticks, point.baseline_sum_ticks, point.average_ticks, point.relative_ticks),
                         (450_000_000, 300_000_000, 150_000_000, 3_000_000))
        rest = self.run_volume("2025-11-05T14:33:00Z")
        self.assertEqual(rest.rows[:8], at_close.rows)
        self.assertEqual((rest.rows[6].duration_seconds, rest.rows[6].average_ticks), (30, None))
        self.assertEqual([(p.average_ticks, p.relative_ticks) for p in rest.rows[-2:]],
                         [(None, None), (0, None)])
        self.assertIsNone(self.run_volume("2025-11-05T14:31:00Z", 1).rows[-1].relative_ticks)
        self.assertEqual(self.run_volume("2025-11-07T14:31:00Z").rows[-1].relative_ticks, 700_000)
        self.assertEqual(self.run_volume("2025-11-05T14:31:00Z"), at_close)

    def test_input_and_native_evidence_validation(self):
        for timestamp in ("2025-02-29T00:00:00Z", "2025-11-05T14:31:00+00:00"):
            with self.assertRaises(ValueError):
                self.run_volume(timestamp)
        with self.assertRaises(ValueError):
            self.run_volume("2025-11-05T14:31:00Z", False)
        cutoff = "2025-11-05T14:31:00Z"
        engine_invoke = self.engine._invoke

        def corrupt(request, *arguments):
            return engine_invoke(request, *arguments).replace(b"\t150000000\t3000000\n", b"\t150000000\t3000001\n")

        with patch.object(self.engine, "_invoke", side_effect=corrupt):
            with self.assertRaisesRegex(ResearchError, "does not reconcile"):
                self.run_volume(cutoff)
