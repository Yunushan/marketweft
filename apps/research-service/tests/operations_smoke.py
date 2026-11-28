"""Check operations isolation, admission counters and restart on real listeners."""
from base64 import b64encode
import json
from pathlib import Path
import secrets
import socket
import sqlite3
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from loopback_smoke import fixture, research_process


def exercise(executable, database):
    formula_token, screen_token = secrets.token_hex(32), secrets.token_hex(32)
    opener = build_opener(ProxyHandler({}))
    settings = {
        "MARKETWEFT_RESEARCH_OPERATIONS_PORT": "0",
        "MARKETWEFT_RESEARCH_AUDIT_DB": str(database),
        "MARKETWEFT_RESEARCH_SLOTS": "1",
    }

    def send(origin, path, data=None, headers=None):
        try:
            with opener.open(Request(origin + path, data, headers or {}), timeout=6) as response:
                return response.status, response.read().decode()
        except HTTPError as error:
            with error:
                return error.code, error.read().decode()

    def counts(operations):
        status, body = send(operations, "/metrics")
        assert status == 200 and formula_token not in body and screen_token not in body
        assert "synthetic" not in body and "close" not in body
        result = {}
        for line in body.splitlines():
            if not line.startswith("#"):
                metric, value = line.split()
                assert metric.startswith("marketweft_research_") and metric.endswith("_total")
                result[metric.removeprefix("marketweft_research_").removesuffix("_total")] = int(value)
        assert set(result) == {
            "admitted", "busy", "quota_denied", "audit_errors", "completed", "rejected", "timed_out", "interrupted", "failed",
        }
        return result

    valid = json.dumps({
        "formula": "close + 0.000001",
        "history_csv": fixture("synthetic-formula-bars.csv"),
        "limit": 1,
    }).encode()
    authorization = {
        "Authorization": f"Bearer {formula_token}", "Content-Type": "application/json",
    }
    with research_process(executable, formula_token, screen_token) as (_, origin, unavailable):
        assert unavailable == "" and send(origin, "/metrics")[0] == 404
    with research_process(executable, formula_token, screen_token, **settings) as (_, origin, operations):
        assert operations.startswith("http://127.0.0.1:") and operations != origin
        assert send(operations, "/healthz") == (200, "ok\n")
        assert send(operations, "/readyz") == (200, "ready\n")
        assert send(origin, "/readyz")[0] == 404
        assert send(origin, "/metrics")[0] == 404
        assert send(operations, "/metrics", headers={"Host": "wrong.marketweft.test"})[0] == 403
        assert send(operations, "/metrics", headers={"Origin": "https://wrong.marketweft.test"})[0] == 403
        assert send(operations, "/readyz", headers={"Origin": "https://wrong.marketweft.test"})[0] == 403
        assert not any(counts(operations).values())
        status, body = send(origin, "/v1/formula", valid, authorization)
        assert status == 200 and json.loads(body)["rows"][0]["value_ticks"] == "10000001"
        assert send(origin, "/v1/formula", b"{}", authorization)[0] == 400
        assert send(origin, "/v1/formula", valid)[0] == 401
        with sqlite3.connect(database) as lock:
            lock.execute("BEGIN EXCLUSIVE")
            assert send(operations, "/readyz") == (503, "audit unavailable\n")
            assert send(operations, "/healthz") == (200, "ok\n")
            assert send(origin, "/v1/formula", valid, authorization)[0] == 503
            lock.rollback()
        assert send(operations, "/healthz") == (200, "ok\n")
        assert send(operations, "/readyz") == (200, "ready\n")
        address = urlsplit(origin)
        with socket.create_connection((address.hostname, address.port), timeout=5) as stream:
            handshake = (
                "GET /v1/formula/stream HTTP/1.1\r\n"
                f"Host: {address.netloc}\r\nAuthorization: Bearer {formula_token}\r\n"
                "Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n"
                f"Sec-WebSocket-Key: {b64encode(secrets.token_bytes(16)).decode()}\r\n\r\n"
            )
            stream.sendall(handshake.encode())
            with stream.makefile("rb") as response:
                assert response.readline().startswith(b"HTTP/1.1 101 ")
            assert send(operations, "/readyz") == (503, "busy\n")
            assert send(operations, "/healthz") == (200, "ok\n")
            assert send(origin, "/v1/formula", valid, authorization)[0] == 429
        deadline = time.monotonic() + 5
        totals = counts(operations)
        while not totals["interrupted"] and time.monotonic() < deadline:
            time.sleep(0.01)
            totals = counts(operations)
        assert totals == {
            "admitted": 3, "busy": 1, "quota_denied": 0, "audit_errors": 1, "completed": 1,
            "rejected": 1, "timed_out": 0, "interrupted": 1, "failed": 0,
        }, totals
    with research_process(executable, formula_token, screen_token, **settings) as (_, _, operations):
        assert send(operations, "/healthz") == (200, "ok\n")
        assert send(operations, "/readyz") == (200, "ready\n")
        assert not any(counts(operations).values())
        with sqlite3.connect(database) as ledger:
            grouped = ledger.execute("SELECT outcome FROM research_receipts ORDER BY receipt_id").fetchall()
        assert grouped == [("completed",), ("rejected",), ("interrupted",)], grouped


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="marketweft-operations-") as directory:
        exercise(sys.argv[1], Path(directory) / "audit.sqlite")
    print("Verified liveness, readiness, exact outcomes, overload, audit failure and restart.")
