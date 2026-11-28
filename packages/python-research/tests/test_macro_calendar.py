import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import MacroRecord, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
REPORTS = (ROOT / "crates/core/tests/fixtures/synthetic-macro-calendar.csv").read_text(encoding="utf-8")
EXECUTABLE = os.environ.get("MARKETWEFT_RESEARCH_BIN", str(
    ROOT / "target/release" / ("marketweft-research.exe" if os.name == "nt" else "marketweft-research")))


def utc(time):
    return f"2025-04-03T{time}Z"


def request(published="14:50:00", known="14:52:00"):
    return f"marketweft-macro-calendar\t1\t{utc(published)}\t{utc(known)}\n{REPORTS}".encode()


class MacroCalendarTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, published, known, reports=REPORTS):
        return self.engine.macro_as_of(reports, published_through=utc(published), known_at=utc(known))

    def test_schedule_forecast_and_actual_have_independent_evidence(self):
        self.assertEqual(self.query("12:00:00", "14:52:00"), ())
        self.assertEqual(self.query("14:08:00", "14:08:00")[0].schedule.record_id, "CPI-S1")
        self.assertEqual(self.query("14:08:00", "14:09:00")[0].schedule.record_id, "CPI-S2")
        self.assertEqual(self.query("14:29:59", "14:32:00")[0].actual_history, ())
        self.assertEqual(self.query("14:30:00", "14:31:59")[0].actual_history, ())
        original = self.query("14:30:00", "14:32:00")
        self.assertEqual((original[0].release_id, original[0].series_id, original[0].reference_date, original[0].unit),
                         ("INFLATION-MAR", "DEMO.CPI", 1740787200, "percent"))
        self.assertEqual(original[0].actual_history, (MacroRecord("CPI-A0", 1743690600, 1743690720, None, 2700000, None),))
        self.assertEqual(original[0].forecast.record_id, "CPI-F2")
        self.assertIsNone(original[1].forecast)
        revised = self.query("14:50:00", "14:52:00")[0]
        self.assertEqual(revised.forecast, original[0].forecast)
        self.assertEqual([(r.record_id, r.value, r.supersedes) for r in revised.actual_history], [
            ("CPI-A0", 2700000, None), ("CPI-A1", 2600000, "CPI-A0"), ("CPI-A2", 2800000, "CPI-A1"),
        ])
        self.assertEqual(self.query("14:30:00", "14:32:00"), original)

    def test_late_predecessor_and_wide_signed_amounts_keep_their_exact_evidence(self):
        late = REPORTS.replace("14:32:00Z,,2.7", "14:49:00Z,,2.7")
        self.assertEqual(self.query("14:45:00", "14:48:00", late)[0].actual_history, ())
        self.assertEqual(len(self.query("14:45:00", "14:49:00", late)[0].actual_history), 2)
        wide = REPORTS.replace("2.8,CPI-A1", "-9007199254.740993,CPI-A1")
        self.assertEqual(self.query("14:50:00", "14:52:00", wide)[0].actual_history[-1].value, -9007199254740993)
        with self.assertRaisesRegex(ValueError, "valid UTC macro calendar"):
            self.engine.macro_as_of(REPORTS, published_through="2025-02-29T14:30:00Z", known_at=utc("14:32:00"))

    def test_native_and_sdk_reject_bad_protocol_and_incomplete_evidence(self):
        command = [EXECUTABLE, "macro-calendar"]
        response = subprocess.run(command, input=request(), capture_output=True, check=True).stdout
        self.assertTrue(response.startswith(b"marketweft-macro-calendar\t1\t2\n"))
        self.assertIn(b"R\tCPI-A2\t1743691800\t1743691920\t\t2800000\tCPI-A1\n", response)
        for malformed in (request().replace(b"\t1\t", b"\t2\t", 1), b"\xff", b"missing header"):
            result = subprocess.run(command, input=malformed, capture_output=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b"")
        for malformed in (
            response[:-1], response.replace(b"\t2\n", b"\t3\n", 1),
            response.replace(b"\tCPI-A1\n", b"\tCPI-A0\n", 1),
            response.replace(b"\t1743691920\t", b"\t1743691921\t", 1),
        ):
            with patch.object(self.engine, "_invoke", return_value=malformed), self.assertRaises(ResearchError):
                self.query("14:50:00", "14:52:00")
