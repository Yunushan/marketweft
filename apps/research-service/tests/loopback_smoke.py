"""Verify the standalone research process over a real loopback connection."""
from contextlib import contextmanager
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


def verify(origin, formula_token, screen_token, options_token):
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


    option_input = {
        "underlying_csv": fixture("synthetic-option-underlying.csv"),
        "quotes_csv": fixture("synthetic-option-exercise-quotes.csv"),
        "effective_at": "2025-04-03T14:00:00Z",
    }

    def options(known_at):
        payload = dict(option_input, known_at=f"2025-04-03T{known_at}Z")
        assert post("/v1/options/snapshot", screen_token, payload)[0] == 403
        status, result = post("/v1/options/snapshot", options_token, payload)
        assert status == 200, result
        return result, {row["contract_id"]: row for row in result["rows"]}

    initial, initial_rows = options("14:00:00")
    assert initial["underlying"]["spot_ticks"] == "100000000"
    assert "APR-AM-C90" not in initial_rows
    assert initial_rows["APR-C100"]["bid_ticks"] == "8807321"
    later, later_rows = options("14:04:00")
    assert later["underlying"]["spot_ticks"] == "100500000"
    assert later_rows["APR-AM-C90"]["exercise_style"] == "american"
    assert later_rows["APR-P110"]["status"] == "ok"


@contextmanager
def research_process(executable, formula_token, screen_token, **overrides):
    settings = dict(
        {key: value for key, value in os.environ.items()
         if not key.startswith("MARKETWEFT_RESEARCH_") and key != "MARKETWEFT_OPTIONS_TOKEN"},
        MARKETWEFT_RESEARCH_PORT="0",
        MARKETWEFT_FORMULA_TOKEN=formula_token,
        MARKETWEFT_SCREEN_TOKEN=screen_token,
    )
    settings.update(overrides)
    operations_enabled = "MARKETWEFT_RESEARCH_OPERATIONS_PORT" in overrides
    with subprocess.Popen(
        [str(Path(executable).resolve())], env=settings, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE if operations_enabled else None,
    ) as process:
        ready = Queue()
        def startup():
            origin = process.stdout.readline().strip()
            operations = process.stderr.readline().strip() if operations_enabled else ""
            ready.put((origin, operations.removeprefix("Research operations at ")))

        reader = Thread(target=startup, daemon=True)
        reader.start()
        try:
            origin, operations = ready.get(timeout=15)
            yield process, origin, operations
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            reader.join(timeout=5)


def main(executable):
    formula_token, screen_token, options_token = (secrets.token_hex(32) for _ in range(3))
    with research_process(
        executable, formula_token, screen_token, MARKETWEFT_OPTIONS_TOKEN=options_token,
    ) as (_, origin, _):
        verify(origin, formula_token, screen_token, options_token)
    print("Verified scoped formula, universe screen and option snapshots over loopback TCP.")


if __name__ == "__main__":
    main(sys.argv[1])
