from datetime import datetime
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from marketweft_research import FxAmount, FxCurrencyValue, FxRateEvidence, ResearchEngine, ResearchError


ROOT = Path(__file__).resolve().parents[3]
RATES = (ROOT / "crates/core/tests/fixtures/synthetic-portfolio-fx.csv").read_text(encoding="utf-8")
EXECUTABLE = os.environ.get("MARKETWEFT_RESEARCH_BIN", str(
    ROOT / "target/release" / ("marketweft-research.exe" if os.name == "nt" else "marketweft-research")))
AMOUNTS = (FxAmount("USD", 70_000_000), FxAmount("EUR", 225_000_000), FxAmount("JPY", -1))


def utc(minute):
    return f"2025-06-02T14:{minute:02}:00Z"


class PortfolioFxTest(unittest.TestCase):
    def setUp(self):
        self.engine = ResearchEngine(EXECUTABLE)

    def query(self, known, *, reporting="USD", effective=45, rates=RATES, amounts=AMOUNTS):
        return self.engine.portfolio_fx_as_of(
            rates, amounts, reporting_currency=reporting, effective_at=utc(effective), known_at=utc(known),
        )

    def test_original_revised_reciprocal_and_missing_amounts_keep_exact_evidence(self):
        early = self.query(45)
        self.assertEqual(early.known_subtotal, 70_000_000)
        self.assertEqual(early.rows, (
            FxCurrencyValue("EUR", 225_000_000, None, None),
            FxCurrencyValue("JPY", -1, None, None),
            FxCurrencyValue("USD", 70_000_000, 70_000_000, None),
        ))
        self.assertEqual(self.query(46).known_subtotal, 340_000_000)
        revised = self.query(49)
        self.assertEqual(revised.known_subtotal, 362_500_000)
        self.assertEqual(self.query(50), revised)
        self.assertEqual(self.query(49, effective=46).known_subtotal, 351_250_000)
        self.assertEqual(self.query(45), early)
        inverse = self.query(49, reporting="EUR")
        self.assertEqual(inverse.known_subtotal, 278_846_154)
        self.assertEqual(inverse.rows[2].rate, FxRateEvidence(
            "EUR", "USD", int(datetime.fromisoformat(utc(40)[:-1] + "+00:00").timestamp()),
            int(datetime.fromisoformat(utc(49)[:-1] + "+00:00").timestamp()), 1_300_000, True,
        ))
        self.assertIsNone(self.query(49, reporting="CAD").known_subtotal)
        self.assertEqual(self.query(49, amounts=()).rows, ())

    def test_signed_wide_values_and_malformed_native_protocol(self):
        positive = (1 << 127) - 1
        negative = -(1 << 127)
        for subtotal in (positive, negative):
            amounts = (FxAmount("EUR", subtotal),)
            self.assertEqual(self.query(46, amounts=amounts, rates=RATES.replace("1.2\n", "1\n")).known_subtotal, subtotal)
        with self.assertRaisesRegex(ResearchError, "exceeds the supported fixed-point range"):
            self.query(46, amounts=(FxAmount("EUR", positive),))
        with self.assertRaisesRegex(ValueError, "exact signed 128-bit"):
            self.query(46, amounts=(FxAmount("EUR", positive + 1),))

        request = "\n".join(("marketweft-portfolio-fx\t1", utc(45), utc(49), "USD",
                             "USD=70000000\tEUR=225000000\tJPY=-1", RATES)).encode()
        command = [EXECUTABLE, "portfolio-fx"]
        response = subprocess.run(command, input=request, capture_output=True, check=True).stdout
        self.assertTrue(response.startswith(b"marketweft-portfolio-fx\t1\t3\nH\tUSD\t362500000\n"))
        malformed_requests = (
            request.replace(b"\t1\n", b"\t2\n", 1), b"\xff", request.replace(b"JPY=-1", b"JPY=g"),
        )
        for malformed in malformed_requests:
            result = subprocess.run(command, input=malformed, capture_output=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, b"")
        with patch.object(self.engine, "_invoke", return_value=response.replace(b"362500000", b"362500001")):
            with self.assertRaisesRegex(ResearchError, "does not match the converted"):
                self.query(49)
        with patch.object(self.engine, "_invoke", return_value=response.replace(b"\t1300000\t0", b"\t1300000\t1")):
            with self.assertRaisesRegex(ResearchError, "quote orientation"):
                self.query(49)
