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

    calendar_route = "/v1/monthly-returns"
    calendar = {
        "history_csv": fixture("synthetic-monthly-returns.csv"), "first_year": 2024, "last_year": 2024,
        "observed_through": "2024-01-15T16:00:00Z", "limit": 2,
    }
    assert post(calendar_route, screen_token, calendar)[0] == 403
    status, early = post(calendar_route, formula_token, calendar)
    assert status == 200 and early["rows"][0]["percent_micros"] == "12500000", early
    assert early["rows"][1]["window"] == "future" and early["next_offset"] == 2, early
    status, late = post(calendar_route, formula_token, dict(calendar, observed_through="2024-12-31T23:59:59Z"))
    assert status == 200 and [row["percent_micros"] for row in late["rows"]] == ["25000000", "-25000000"], late
    assert post(calendar_route, formula_token, calendar) == (200, early)

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

    american = dict(
        option_input, contract_id="APR-AM-C90", known_at="2025-04-03T14:06:00Z",
        cash_dividends_csv=fixture("synthetic-option-cash-dividends.csv"),
    )
    value_path = "/v1/options/american/valuation"
    assert post(value_path, formula_token, american)[0] == 403
    status, solved = post(value_path, options_token, american)
    assert status == 200 and solved["status"] == "value", solved
    assert abs(solved["price"] - 16.234568) < 1e-10
    assert [row["amount_per_share_ticks"] for row in solved["dividends"]] == ["1000000", "9000000"]
    status, priced = post(value_path, options_token, dict(american, volatility=0.25))
    assert status == 200 and abs(priced["price"] - 14.171952) < 5e-7, priced
    assert priced["dividends"] == solved["dividends"]


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
    print("Verified scoped formulas, monthly returns, universe screens, option snapshots and American valuations over loopback TCP.")


if __name__ == "__main__":
    main(sys.argv[1])
