"""Exercise a private TLS listener as a separate container peer."""
import json
from pathlib import Path
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener


origin = sys.argv[1]
fixtures = Path("/repo/crates/core/tests/fixtures")
formula = json.loads(Path("/peer/formula.json").read_text())["token"]
screen = json.loads(Path("/peer/screen.json").read_text())["token"]
trusted = build_opener(
    ProxyHandler({}), HTTPSHandler(context=ssl.create_default_context(cafile="/peer/tls.crt"))
)


def post(path, token, payload, extra=None, client=trusted):
    headers = {
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Origin": origin,
    }
    headers.update(extra or {})
    request = Request(origin + path, json.dumps(payload).encode(), headers)
    try:
        with client.open(request, timeout=5) as reply:
            return reply.status, json.load(reply)
    except HTTPError as reply:
        with reply:
            return reply.code, json.load(reply)


def fixture(name):
    return (fixtures / name).read_text(encoding="utf-8")


query = {"formula": "close + 0.000001", "history_csv": fixture("synthetic-formula-bars.csv"), "limit": 1}
status, result = post("/v1/formula", formula, query)
assert status == 200 and result["rows"][0]["value_ticks"] == "10000001"
assert post("/v1/formula", screen, query)[0] == 403
assert post("/v1/formula", formula, query, {"Origin": origin.replace("https", "http", 1)})[0] == 403
assert post("/v1/formula", formula, query, {"Host": "elsewhere.test:4174"})[0] == 403

for known, expected in [
    ("14:10", [("ALFA-001", 1, "20000"), ("BETA-001", None, None)]),
    ("14:12", [("BETA-001", 1, "120000"), ("ALFA-001", 2, "20000")]),
]:
    status, result = post("/v1/universe/screen", screen, {
        "membership_csv": fixture("synthetic-universe.csv"), "prices_csv": fixture("synthetic-universe-prices.csv"),
        "baseline_at": "2025-06-02T14:00:00Z", "effective_at": "2025-06-02T14:10:00Z",
        "known_at": f"2025-06-02T{known}:00Z",
    })
    assert status == 200
    assert [(row["listing_id"], row["rank"], row["return_units"]) for row in result["rows"]] == expected

untrusted = build_opener(ProxyHandler({}), HTTPSHandler(context=ssl.create_default_context()))
try:
    post("/v1/formula", formula, query, client=untrusted)
except URLError as error:
    assert isinstance(error.reason, ssl.SSLCertVerificationError)
else:
    raise AssertionError("the client accepted a peer without the test trust anchor")
