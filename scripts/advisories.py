"""Check pinned Cargo dependencies against OSV. Requires network access."""
import json
from pathlib import Path
import sys
import tomllib
from urllib.request import Request, urlopen
from urllib.parse import quote
from desktop_backport import FIXED_ADVISORIES, verified_glib

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://api.osv.dev/v1/querybatch"


def is_maintenance_notice(name, advisory):
    if not advisory.startswith("RUSTSEC-"):
        return False
    with urlopen("https://api.osv.dev/v1/vulns/" + quote(advisory, safe=""), timeout=45) as response:
        record = json.load(response)
    matching = [a for a in record["affected"] if a["package"]["ecosystem"] == "crates.io"
                and a["package"]["name"] == name]
    return (record["id"] == advisory and bool(matching)
            and all(a.get("database_specific", {}).get("informational") == "unmaintained" for a in matching))


def scan(locks):
    backport = verified_glib()
    registry = {(p["name"], p["version"]) for lock in locks
                       for p in tomllib.loads(lock.read_text(encoding="utf-8"))["package"]
                       if "source" in p}
    packages = sorted(registry | {backport})
    findings = []
    for start in range(0, len(packages), 100):
        batch = packages[start:start + 100]
        queries = [{"package": {"ecosystem": "crates.io", "name": name}, "version": version}
                   for name, version in batch]
        req = Request(ENDPOINT, data=json.dumps({"queries": queries}).encode(),
                      headers={"Content-Type": "application/json", "User-Agent": "MarketWeft/0.1"})
        with urlopen(req, timeout=45) as response:
            results = json.load(response)["results"]
        if len(results) != len(batch):
            raise ValueError("Incomplete OSV response")
        for (name, version), result in zip(batch, results):
            for item in result.get("vulns", []):
                advisory = item["id"]
                if (name, version) == backport and backport not in registry and advisory in FIXED_ADVISORIES:
                    status = "fixed in verified backport"
                elif is_maintenance_notice(name, advisory):
                    status = "maintenance notice"
                else:
                    status = "open vulnerability"
                findings.append((name, version, advisory, status))
            if result.get("next_page_token"):
                raise ValueError(f"Further advisory results require review for {name} {version}")
    print(f"Queried OSV for {len(packages)} external Cargo package versions.")
    for name, version, advisory, status in findings:
        print(f"{name} {version}: {status} https://osv.dev/vulnerability/{advisory}")
    return any(f[-1] == "open vulnerability" for f in findings)


if __name__ == "__main__":
    sys.exit(scan([ROOT / "Cargo.lock", ROOT / "apps/desktop/Cargo.lock"]))

