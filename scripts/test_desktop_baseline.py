from email.message import Message
import hashlib
from io import BytesIO
import json
from pathlib import Path
import socket
import ssl
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, call, patch
from urllib.error import HTTPError, URLError
from zipfile import ZipFile

import download_desktop_baseline as baseline


COMMIT = "1" * 40
FILENAME = "MarketWeft-desktop-0.215.0-macos-arm64.zip"
LOCATION = "https://artifacts.example.invalid/baseline.zip"


def http_status(status, **headers):
    metadata = Message()
    for key, value in headers.items():
        metadata[key.replace("_", "-")] = value
    return HTTPError("https://api.github.com/test", status, "test", metadata, BytesIO())


class PartialRead(BytesIO):
    def read(self, size=-1):
        if self.tell() == 0:
            return super().read(17)
        raise ConnectionResetError("transfer interrupted")


class DesktopBaselineTest(unittest.TestCase):
    def test_retries_dns_and_timeout_but_stops_at_the_third_attempt(self):
        failure = URLError(socket.gaierror(socket.EAI_NONAME, "temporary DNS failure"))
        operation = Mock(side_effect=[failure, TimeoutError("connection timed out"), b"ok"])
        with patch.object(baseline.time, "sleep") as sleep:
            self.assertEqual(baseline.retry_network(operation), b"ok")
        self.assertEqual(operation.call_count, 3)
        self.assertEqual(sleep.call_args_list, [call(1), call(2)])

        operation = Mock(side_effect=failure)
        with patch.object(baseline.time, "sleep") as sleep, self.assertRaises(URLError):
            baseline.retry_network(operation)
        self.assertEqual(operation.call_count, 3)
        self.assertEqual(sleep.call_args_list, [call(1), call(2)])

    def test_honors_short_retry_after_and_does_not_repeat_permanent_failures(self):
        operation = Mock(side_effect=[http_status(429, Retry_After="3"), b"ok"])
        with patch.object(baseline.time, "sleep") as sleep:
            self.assertEqual(baseline.retry_network(operation), b"ok")
        sleep.assert_called_once_with(3)

        operation = Mock(side_effect=[http_status(503), b"ok"])
        with patch.object(baseline.time, "sleep") as sleep:
            self.assertEqual(baseline.retry_network(operation), b"ok")
        sleep.assert_called_once_with(1)

        for failure in (http_status(429), http_status(429, Retry_After="60"), http_status(403),
                        http_status(404), http_status(302, Location=LOCATION),
                        URLError(ssl.SSLCertVerificationError("invalid certificate"))):
            operation = Mock(side_effect=failure)
            with self.subTest(error=failure), patch.object(baseline.time, "sleep") as sleep:
                with self.assertRaises(type(failure)):
                    baseline.retry_network(operation)
                if isinstance(failure, HTTPError):
                    failure.close()
                sleep.assert_not_called()
            operation.assert_called_once_with()

    def test_fetch_restarts_partial_transfer_and_verifies_the_completed_archive(self):
        package = b"synthetic macOS package"
        manifest = hashlib.sha256(package).hexdigest() + "  " + FILENAME + "\n"
        memory = BytesIO()
        with ZipFile(memory, "w") as archive:
            archive.writestr(FILENAME, package)
            archive.writestr(FILENAME + ".sha256", manifest)
        blob = memory.getvalue()
        run = {"head_sha": COMMIT, "path": ".github/workflows/verify.yml", "event": "push",
               "status": "completed", "conclusion": "success", "run_attempt": 1,
               "head_repository": {"full_name": "Yunushan/marketweft"}}
        artifact = {"name": "macos-desktop-arm64-attempt-1", "id": 4, "expired": False,
                    "size_in_bytes": len(blob), "digest": "sha256:" + hashlib.sha256(blob).hexdigest()}
        responses = [
            URLError(socket.gaierror(socket.EAI_NONAME, "temporary DNS failure")),
            BytesIO(json.dumps(run).encode()), BytesIO(json.dumps({"artifacts": [artifact]}).encode()),
            http_status(302, Location=LOCATION),
        ]
        api = Mock()
        api.open.side_effect = responses
        download = Mock()
        download.open.side_effect = [PartialRead(blob), BytesIO(blob)]
        with TemporaryDirectory() as scratch, patch.object(baseline.time, "sleep") as sleep, \
                patch.object(baseline, "build_opener", side_effect=[api, download]):
            path = baseline.fetch(3, COMMIT, "0.215.0", "arm64", Path(scratch), "fixture-token", "macos")
            self.assertEqual(path.name, FILENAME)
            self.assertEqual(path.read_bytes(), package)
            self.assertEqual(path.with_name(FILENAME + ".sha256").read_bytes(), manifest.encode())
        self.assertEqual(sleep.call_args_list, [call(1), call(1)])
        self.assertEqual(download.open.call_args_list, [call(LOCATION, timeout=40)] * 2)
        self.assertTrue(all(request.args[0].get_header("Authorization") == "Bearer fixture-token"
                            for request in api.open.call_args_list))

        artifact["digest"] = "sha256:" + "0" * 64
        api.open.side_effect = [BytesIO(json.dumps(run).encode()),
                                BytesIO(json.dumps({"artifacts": [artifact]}).encode()),
                                http_status(302, Location=LOCATION)]
        download.open.reset_mock(side_effect=True)
        download.open.return_value = BytesIO(blob)
        with TemporaryDirectory() as scratch, patch.object(baseline.time, "sleep") as sleep, \
                patch.object(baseline, "build_opener", side_effect=[api, download]):
            existing = Path(scratch) / FILENAME
            existing.write_bytes(b"verified previous file")
            with self.assertRaisesRegex(ValueError, "recorded digest"):
                baseline.fetch(3, COMMIT, "0.215.0", "arm64", Path(scratch), "fixture-token", "macos")
            self.assertEqual(existing.read_bytes(), b"verified previous file")
            sleep.assert_not_called()
        download.open.assert_called_once_with(LOCATION, timeout=40)


if __name__ == "__main__":
    unittest.main()
