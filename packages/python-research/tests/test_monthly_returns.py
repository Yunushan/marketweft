import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import MonthlyClose, MonthlyReturn, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
HISTORY = (ROOT / "crates/core/tests/fixtures/synthetic-monthly-returns.csv").read_text(encoding="utf-8")
EXECUTABLE = os.environ.get("MARKETWEFT_RESEARCH_BIN", str(
    ROOT / "target/release" / ("marketweft-research.exe" if os.name == "nt" else "marketweft-research")))
PROTOCOL = "marketweft-monthly-returns"
EARLY = "2024-01-15T16:00:00Z"
LATE = "2024-12-31T23:59:59Z"


def request(cutoff):
    return f"{PROTOCOL}\t1\t2024\t2024\t{cutoff}\n{HISTORY}".encode()


class MonthlyReturnsTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, cutoff=EARLY):
        return self.engine.monthly_returns(HISTORY, first_year=2024, last_year=2024, observed_through=cutoff)

    def test_historical_cutoffs_match_the_browser_fixture(self):
        early = self.query()
        self.assertEqual(len(early), 12)
        self.assertEqual(early[0], MonthlyReturn(2024, 1, "month-to-date",
            MonthlyClose(1703865600, 80_000_000), MonthlyClose(1705334400, 90_000_000), 12_500_000))
        self.assertEqual(early[1], MonthlyReturn(2024, 2, "future", None, None, None))
        late = self.query(LATE)
        self.assertEqual(tuple(row.percent_micros for row in late), (
            25_000_000, -25_000_000, None, None, -100_000_000, None, 0, -200_000_000, 100_000_000, None, None, None))
        self.assertIsNone(late[2].current)
        self.assertIsNone(late[3].prior)
        self.assertEqual(late[5].prior.ticks, 0)
        self.assertEqual(self.query(), early)

    def test_cli_rejects_malformed_requests_and_keeps_exact_integer_output(self):
        command = [EXECUTABLE, "monthly-returns"]
        valid = subprocess.run(command, input=request(EARLY), capture_output=True, check=True)
        self.assertEqual(valid.stdout.splitlines()[1], b"2024\t1\tmonth-to-date\t1703865600\t80000000\t1705334400\t90000000\t12500000")
        for bad in (request(EARLY).replace(b"\t1\t", b"\t2\t", 1), request("2024-02-30T16:00:00Z"),
                    request(EARLY).replace(b"\t2024\t", b"\t1900\t", 1), b"\xff\n", b"missing header"):
            with self.subTest(request=bad[:48]):
                result = subprocess.run(command, input=bad, capture_output=True, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")

    def test_reader_rejects_incomplete_or_inconsistent_month_evidence(self):
        original = subprocess.run([EXECUTABLE, "monthly-returns"], input=request(LATE),
                                  capture_output=True, check=True).stdout
        corruptions = (
            original.replace(b"\t12\n", b"\t11\n", 1), original[:-1],
            original.replace(b"2024\t1\tcomplete", b"2024\t1\tfuture", 1),
            original.replace(b"\t1703865600\t", b"\t1705334400\t", 1),
            original.replace(b"\t25000000\n", b"\t\n", 1),
            original.replace(b"\t25000000\n", b"\t1844674407370955161618446744073709551616\n", 1),
        )
        for output in corruptions:
            with patch.object(self.engine, "_invoke", return_value=output), self.assertRaises(ResearchError):
                self.query(LATE)

    def test_calendar_boundaries_and_wide_exact_percentage(self):
        header = "time,open,high,low,close,volume\n"
        wide = header + "2023-12-01,0.000001,0.000001,0.000001,0.000001,0\n2024-01-01,2000000000,2000000000,2000000000,2000000000,0\n"
        result = self.engine.monthly_returns(wide, first_year=2024, last_year=2024, observed_through=LATE)
        self.assertEqual(result[0].percent_micros, 199999999999999900000000)
        earliest = self.engine.monthly_returns(header + "0001-01-01,1,1,1,1,0\n", first_year=1,
                                                last_year=1, observed_through="0001-01-01T00:00:00Z")
        self.assertEqual(earliest[0].current, MonthlyClose(-62135596800, 1000000))
        latest = self.engine.monthly_returns(header + "9999-12-31,1,1,1,1,0\n", first_year=9999,
                                              last_year=9999, observed_through="9999-12-31T23:59:59Z")
        self.assertEqual(latest[11].window, "complete")
        self.assertEqual(latest[11].current, MonthlyClose(253402214400, 1000000))
        with self.assertRaises(ValueError):
            self.engine.monthly_returns(HISTORY, first_year=2024, last_year=2054, observed_through=EARLY)
        with self.assertRaises(ValueError):
            self.query("2025-02-29T00:00:00Z")
