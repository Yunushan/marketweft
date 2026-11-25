"""Check pinned Cargo dependencies against OSV. Requires network access."""
import json
from pathlib import Path
import sys
import tomllib
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://api.osv.dev/v1/querybatch"


def scan(locks):
    packages = sorted({(p["name"], p["version"]) for lock in locks
                       for p in tomllib.loads(lock.read_text(encoding="utf-8"))["package"]
                       if "source" in p})
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
                findings.append((name, version, item["id"]))
            if result.get("next_page_token"):
                raise ValueError(f"Further advisory results require review for {name} {version}")
    print(f"Queried OSV for {len(packages)} external Cargo package versions.")
    for name, version, advisory in findings:
        print(f"{name} {version} https://osv.dev/vulnerability/{advisory}")
    return bool(findings)


if __name__ == "__main__":
    sys.exit(scan([ROOT / "Cargo.lock", ROOT / "apps/desktop/Cargo.lock"]))

