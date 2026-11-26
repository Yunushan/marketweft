"""Check whether SIGTERM drains admitted work and respects the exit deadline."""
from base64 import b64encode
from contextlib import contextmanager
import json
from pathlib import Path
import secrets
import socket
import sqlite3
import struct
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from loopback_smoke import fixture, research_process


@contextmanager
def admitted_stream(origin, token):
    address = urlsplit(origin)
    with socket.create_connection((address.hostname, address.port), timeout=5) as stream:
        upgrade = (
            "GET /v1/formula/stream HTTP/1.1\r\n"
            f"Host: {address.netloc}\r\nAuthorization: Bearer {token}\r\n"
            "Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n"
            f"Sec-WebSocket-Key: {b64encode(secrets.token_bytes(16)).decode()}\r\n\r\n"
        )
        stream.sendall(upgrade.encode())
        with stream.makefile("rb") as response:
            assert response.readline().startswith(b"HTTP/1.1 101 ")
            for line in response:
                if line == b"\r\n":
                    break
            yield stream, response


def send_query(stream, response):
    payload = json.dumps({
        "formula": "close + 0.000001",
        "history_csv": fixture("synthetic-formula-bars.csv"),
        "limit": 1,
    }).encode()
    mask = secrets.token_bytes(4)
    frame = struct.pack("!BBH", 0x81, 0xFE, len(payload))
    stream.sendall(frame + mask + bytes(value ^ mask[index % 4] for index, value in enumerate(payload)))
    kind, size = struct.unpack("!BB", response.read(2))
    assert kind == 0x81 and size <= 126
    if size == 126:
        size, = struct.unpack("!H", response.read(2))
    data = json.loads(response.read(size))
    assert data["type"] == "page" and data["page"]["rows"][0]["value_ticks"] == "10000001"


def wait_for_closed_admission(origin, token):
    opener = build_opener(ProxyHandler({}))
    request = Request(origin + "/v1/formula", b"{}", {
        "Authorization": f"Bearer {token}", "Content-Type": "application/json",
    })
    deadline = time.monotonic() + 2
    while True:
        try:
            with opener.open(request, timeout=1) as response:
                raise AssertionError(f"unexpected response {response.status}")
        except HTTPError as response:
            with response:
                if response.code == 503:
                    assert json.load(response)["error"] == "Research service is shutting down."
                    return
                assert response.code == 429, response.code
        assert time.monotonic() < deadline
        time.sleep(0.01)


def exercise(executable, database):
    formula, screen = secrets.token_hex(32), secrets.token_hex(32)
    settings = {
        "MARKETWEFT_RESEARCH_AUDIT_DB": str(database),
        "MARKETWEFT_RESEARCH_SLOTS": "1",
        "MARKETWEFT_RESEARCH_SHUTDOWN_SECONDS": "5",
        "MARKETWEFT_RESEARCH_OPERATIONS_PORT": "0",
    }
    with research_process(executable, formula, screen, **settings) as (process, origin, operations):
        with admitted_stream(origin, formula) as (socket, reply):
            process.terminate()
            wait_for_closed_admission(origin, formula)
            monitor = build_opener(ProxyHandler({}))
            try:
                monitor.open(operations + "/readyz", timeout=2).close()
            except HTTPError as error:
                with error:
                    assert error.code == 503 and error.read() == b"draining\n"
            else:
                raise AssertionError("A draining service reported ready.")
            with monitor.open(operations + "/healthz", timeout=2) as health:
                assert health.status == 200
            send_query(socket, reply)
            assert process.wait(timeout=4) == 0
    settings["MARKETWEFT_RESEARCH_SHUTDOWN_SECONDS"] = "1"
    with research_process(executable, formula, screen, **settings) as (process, origin, _):
        with admitted_stream(origin, formula):
            before = time.monotonic()
            process.terminate()
            assert process.wait(timeout=4) == 0
            assert time.monotonic() - before >= 0.8
    with sqlite3.connect(database) as ledger:
        rows = ledger.execute(
            "SELECT outcome, finished_at IS NOT NULL FROM research_receipts ORDER BY receipt_id"
        ).fetchall()
        assert rows == [("completed", 1), (None, 0)], rows
        assert ledger.execute("PRAGMA integrity_check").fetchone() == ("ok",)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="marketweft-shutdown-") as directory:
        exercise(sys.argv[1], Path(directory) / "audit.sqlite")
    print("Verified SIGTERM changes readiness, closes admission and preserves completed and unfinished receipts.")
