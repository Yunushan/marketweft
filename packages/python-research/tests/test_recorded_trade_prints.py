import os
from pathlib import Path
import unittest
from unittest.mock import patch

from marketweft_research import RecordedTradePrint, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
SOURCE = (ROOT / "crates/core/tests/fixtures/synthetic-recorded-prints.csv").read_text(encoding="utf-8")
BINARY = "marketweft-research.exe" if os.name == "nt" else "marketweft-research"
EXECUTABLE = Path(os.environ.get("MARKETWEFT_RESEARCH_BIN", ROOT / "target/release" / BINARY))


class RecordedTradePrintsTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def at(self, cutoff=None, source=SOURCE):
        return self.engine.recorded_trade_prints("NASDAQ:NVDA", source, known_at=cutoff)

    def test_prints_use_observation_cutoff_and_preserve_full_capture_order(self):
        self.assertEqual(self.at("2025-06-02T13:59:59Z").prints, ())
        early = self.at("2025-06-02T14:00:00Z")
        self.assertEqual((early.instrument, early.known_at), ("NASDAQ:NVDA", 1748872800))
        self.assertEqual(early.prints, (
            RecordedTradePrint(1748872798, 1748872800, 9007199254740993, -2000001, 1000001, "buy"),
            RecordedTradePrint(1748872799, 1748872800, 9007199254740994, 0, 250000, "unknown"),
        ))
        late = self.at("2025-06-02T14:00:02Z").prints
        self.assertEqual(late[:2], early.prints)
        self.assertEqual(late[-1], RecordedTradePrint(1748872797, 1748872802, 9007199254740995, 3000000, 1000000, "sell"))
        self.assertEqual(self.at().prints[-1].sequence, (1 << 64) - 1)
        self.assertEqual(self.at("2025-06-02T14:00:00Z"), early)

    def test_print_reader_rejects_malformed_query_and_untrusted_native_results(self):
        with self.assertRaisesRegex(ValueError, "valid UTC"):
            self.at("2025-02-29T14:00:00Z")
        with self.assertRaisesRegex(ValueError, "canonical"):
            self.engine.recorded_trade_prints("nasdaq:nvda", SOURCE)
        with self.assertRaisesRegex(ValueError, "8 MiB"):
            self.at(source="é" * (4 * 1024 * 1024 + 1))
        header = b"marketweft-recorded-trade-prints\t1\t2\nT\tNASDAQ:NVDA\t1748872800\n"
        first = b"1748872798\t1748872800\t9007199254740993\t-2000001\t1000001\tbuy\n"
        second = b"1748872799\t1748872800\t9007199254740994\t0\t250000\tunknown\n"
        for response, expected in (
            (header.replace(b"NASDAQ:NVDA", b"NASDAQ:MSFT") + first + second, "settings differ"),
            (header + first, "print count"),
            (header + first + first, "inconsistent"),
            (header + first + second.replace(b"1748872800", b"1748872801"), "inconsistent"),
            (header + first + second.replace(b"9007199254740994", b"18446744073709551616"), "inconsistent"),
            (header + first + second.replace(b"unknown", b"inferred"), "inconsistent"),
        ):
            with patch.object(self.engine, "_invoke", return_value=response), self.assertRaisesRegex(ResearchError, expected):
                self.at("2025-06-02T14:00:00Z")
