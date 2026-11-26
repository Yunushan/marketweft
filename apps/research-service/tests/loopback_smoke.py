"""Verify the standalone research process over a real loopback connection."""
import json
import os
from pathlib import Path
from queue import Queue
import secrets
import subprocess
import sys
from threading import Thread
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener


FIXTURES = Path(__file__).resolve().parents[3] / "crates/core/tests/fixtures"


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def verify(origin, formula_token, screen_token):
    assert origin.startswith("http://127.0.0.1:"), origin
    opener = build_opener(ProxyHandler({}))

    def post(path, token, payload):
        request = Request(
            origin + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with opener.open(request, timeout=6) as reply:
                return reply.status, json.load(reply)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

    formula = {
        "formula": "close + 0.000001",
        "history_csv": fixture("synthetic-formula-bars.csv"),
        "limit": 1,
    }
    status, result = post("/v1/formula", formula_token, formula)
    assert status == 200 and result["rows"][0]["value_ticks"] == "10000001", result
    assert post("/v1/formula", screen_token, formula)[0] == 403

    query = {
        "membership_csv": fixture("synthetic-universe.csv"),
        "prices_csv": fixture("synthetic-universe-prices.csv"),
        "baseline_at": "2025-06-02T14:00:00Z",
    }

    def ranks(effective, known):
        status, result = post("/v1/universe/screen", screen_token, dict(
            query, effective_at=f"2025-06-02T{effective}:00Z", known_at=f"2025-06-02T{known}:00Z",
        ))
        assert status == 200, result
        return [(row["listing_id"], row["rank"], row["return_units"]) for row in result["rows"]]

    assert ranks("14:05", "14:05") == [("ALFA-001", 1, "10000")]
    assert ranks("14:10", "14:10") == [("ALFA-001", 1, "20000"), ("BETA-001", None, None)]
    assert ranks("14:10", "14:12") == [("BETA-001", 1, "120000"), ("ALFA-001", 2, "20000")]
    assert ranks("14:20", "14:20") == [("BETA-001", 1, "80000"), ("ALFA-001", 2, "40000")]
    assert ranks("14:20", "14:25") == [("BETA-001", 1, "80000")]


def main(executable):
    formula_token, screen_token = secrets.token_hex(32), secrets.token_hex(32)
    settings = dict(
        os.environ,
        MARKETWEFT_RESEARCH_PORT="0",
        MARKETWEFT_FORMULA_TOKEN=formula_token,
        MARKETWEFT_SCREEN_TOKEN=screen_token,
    )
    settings.pop("MARKETWEFT_RESEARCH_AUDIT_DB", None)
    with subprocess.Popen(
        [str(Path(executable).resolve())], env=settings, text=True, stdout=subprocess.PIPE,
    ) as process:
        ready = Queue()
        reader = Thread(target=lambda: ready.put(process.stdout.readline().strip()), daemon=True)
        reader.start()
        try:
            verify(ready.get(timeout=15), formula_token, screen_token)
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            reader.join(timeout=5)
    print("Verified scope separation, exact formula ticks and point-in-time ranks over loopback TCP.")


if __name__ == "__main__":
    main(sys.argv[1])
