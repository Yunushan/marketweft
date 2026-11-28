import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import NotionalBar, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
CSV = (ROOT / "crates/core/tests/fixtures/synthetic-notional-trades.csv").read_text(encoding="utf-8")
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))


class RecordedNotionalBarsTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def at(self, cutoff=None, source=CSV, target=5_000_000):
        return self.engine.recorded_notional_bars("NASDAQ:NVDA", source, target, known_at=cutoff)

    def test_native_preserves_exact_records_cutoffs_and_unsigned_sequences(self):
        self.assertEqual(self.at("2025-06-02T13:59:59Z").bars, ())
        early = self.at("2025-06-02T14:00:01Z")
        self.assertEqual((early.instrument, early.target_notional_ticks, early.known_at),
                         ("NASDAQ:NVDA", 5_000_000, 1748872801))
        self.assertEqual(early.bars, (NotionalBar(
            1748872800, 1748872800, 9_007_199_254_740_993, 9_007_199_254_740_994, 2,
            False, 2_000_003_000_001, -2_000_001, 0, -2_000_001, 0, 1_250_001,
        ),))
        full = self.at()
        self.assertIsNone(full.known_at)
        self.assertEqual([(bar.complete, bar.gross_notional_trillionths) for bar in full.bars],
                         [(True, 5_000_003_000_001), (True, 5_000_000_000_000),
                          (True, 5_250_000_500_000), (False, 800_000_800_000)])
        self.assertEqual(self.at("2025-06-02T14:00:02Z").bars, full.bars[:1])
        self.assertEqual(self.at("2025-06-02T14:00:01Z"), early)
        wide = CSV.splitlines()[0] + "\nNASDAQ:NVDA,1748872800,1748872800,18446744073709551615,-2000000000,2000000000\n"
        bar = self.at(source=wide, target=1).bars[0]
        self.assertEqual(bar.first_sequence, (1 << 64) - 1)
        self.assertEqual(bar.gross_notional_trillionths, 2_000_000_000_000_000 ** 2)

    def test_rejects_bad_settings_and_inconsistent_native_evidence(self):
        for target in (0, True, 5.1, 2_000_000_000_000_001):
            with self.assertRaisesRegex(ValueError, "whole millionths"):
                self.at(target=target)
        with self.assertRaisesRegex(ValueError, "valid UTC"):
            self.at("2025-02-29T14:00:01Z")
        with self.assertRaisesRegex(ValueError, "8 MiB"):
            self.at(source="é" * (4 * 1024 * 1024 + 1))
        native = (
            b"marketweft-notional-bars\t1\t1\nT\tNASDAQ:NVDA\t5000000\t1748872801\n"
            b"1748872800\t1748872800\t9007199254740993\t9007199254740994\t2\t0"
            b"\t2000003000001\t-2000001\t0\t-2000001\t0\t1250001\n"
        )
        for response, phrase in (
            (native.replace(b"\t5000000\t", b"\t6000000\t"), "settings differ"),
            (native.replace(b"\t2\t0\t", b"\t2\t1\t"), "inconsistent"),
            (native.replace(b"\t9007199254740994\t", b"\t18446744073709551616\t"), "inconsistent"),
            (native.replace(b"\t1748872800\t900", b"\t1748872802\t900"), "inconsistent"),
        ):
            with patch.object(self.engine, "_invoke", return_value=response):
                with self.assertRaisesRegex(ResearchError, phrase):
                    self.at("2025-06-02T14:00:01Z")
