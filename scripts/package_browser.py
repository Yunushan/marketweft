"""Build a portable browser distribution from the locally verified Vite output."""
import hashlib
import json
from pathlib import Path
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "apps/terminal/dist"
APP_VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
OUTPUT = ROOT / f"reports/MarketWeft-browser-{APP_VERSION}.zip"
START = f"""MarketWeft {APP_VERSION} | Local research terminal

Extract this entire archive, keep dist/ next to serve-terminal.mjs, then run:

    node serve-terminal.mjs

Open http://127.0.0.1:4173/ in a current browser. Node.js 22.12 or newer
is required for the launcher. No npm install, build, API key or account is needed.
Alternatively serve the contents of dist/ on a static HTTPS host. Opening
index.html directly as a file does not provide the HTTP origin needed by Wasm
and the offline service worker.

The initial quotes are generated examples. To try your own history, choose
Import CSV, enter a venue and symbol, and select a file. You can start with
example.csv and the symbol DEMO. The first line is:
time,open,high,low,close,volume

Times are UTC. Prices and volume accept up to six decimal places. The source
files remain yours. Chart, watchlist and imported data belong to this origin
and browser profile. Keep your original files. Wait for Offline ready before
disconnecting. Use the same launcher port to reopen your saved workspace.

Choose Workspace backup to export all imported histories and chart settings.
On another profile or device, select the backup file, review the verified
counts and confirm Restore workspace to replace that profile's catalog.
Opening a 0.1.0 workspace on the same browser origin migrates it to IndexedDB.

Use Compare charts to choose a second instrument and link exact UTC bars.
A two-pane workspace includes both instruments and overlays in its backup.
Choose Draw measurement to anchor a line to two UTC bars and exact prices.
Its coordinates stay with the instrument and are included in workspace backups.
Open Indicators to save separate SMA and EMA periods for each pane. The chart
readout shows the results at the selected bar when enough closes are available.
Open Export CSV beneath either pane to download visible or all bars. The
research format also includes provenance and enabled moving averages.
Choose Close line to plot observed closing prices, or Candles for OHLC.
Choose OHLC bars for a high-low stem with left-open and right-close ticks.
Choose a chart type independently in each pane.
Open Timeframe in either pane to roll aligned source bars into a larger
fixed-duration UTC bucket. Research CSV includes observed and expected counts.
Add a Session calendar CSV in Timeframe to anchor bars to exchange opens and
clip the final bucket at each listed close. Try the supplied split-sessions.csv.

Open Recorded tick bars with NASDAQ:NVDA selected and load tick-trades.csv.
Use two trades per bar and compare cutoffs at 2025-06-02T14:00:00Z and
2025-06-02T14:00:05Z. The complete first bar is identical at both cutoffs.

Choose Historical replay and Start demo for the NYSE session example. Replay
reveals each bar at its scheduled close and marks missing intervals in-session.
To replay your own import, choose a matching UTC session calendar and bar
interval. The replay-*.csv files let you try the import workflow with the demo.

Choose Start split demo to compare point-in-time splits in the raw and
split-adjusted views. The split-*.csv files supply the same raw history,
calendar and actions for a 600-second imported replay under DEMO:SPLIT.
Use Start split revisions demo or import split-revisions.csv to follow
a rescheduled split, two IDs sharing an effective time, and a cancellation.

Choose Start dividend demo to follow receivables and cash at each cutoff.
The cash-dividends.csv file uses DEMO:DIVIDEND with split-ohlcv.csv and
split-sessions.csv, a 600-second interval and 100 entitled shares.
Choose Start dividend entitlement demo or upload dividend-positions.csv to
derive each distribution's share entitlement from dated position reports.

Open Universe replay under Historical replay to step through an addition,
late removal and delisting. Upload universe-membership.csv to exercise the
same file path and query independent effective and known times.
In Universe screen choose Load demo prices, or pair universe-membership.csv
with universe-prices.csv. Keep the initial 14:00 UTC baseline. At 14:10
BETA is unranked until its close is observed at 14:12 UTC.
Expand Relative returns to compare two listing IDs. Select ALFA-001 and
BETA-001 at an effective and known time of 14:20 UTC. Use 14:10 UTC as
the comparison baseline and advance knowledge to 14:25 UTC to see the
gap caused by the removal. Download relative returns for the full window.
Start listing risk demo under Universe replay, or open the matching
listing-risk-membership.csv and listing-risk-prices.csv files. Compare A
and B, then expand Rolling risk. Use an effective time of 14:06 UTC and
compare knowledge at 14:06, 14:07 and 14:08 to inspect paired coverage.
Expand Correlated portfolio scenarios in the same view. Choose A and B
with 5,000 basis points each. Run the same windows, then use 14:01 UTC
for one move with a 100-basis-point rebalance fee to reconcile net value.

Select the NVDA chart and open Recorded market depth. Choose Load depth demo
or open depth.csv. Inspect the sequence gap at 14:00:05 UTC and the recovered
book at 14:00:09 UTC. Download depth snapshot to save the exact levels and
the source's observation and sequence evidence.

Select the NVDA chart and open Recorded footprint. Load the demo or open
footprint-trades.csv. The price bins keep labeled buy, sell and unknown size.
The cumulative delta follows the execution window and changes when a late
trade reaches the selected knowledge cutoff. Expand Price profiles to
compare total trade size and distinct time-price opportunities over that
same window, and export both profiles and their value areas.
Under Delisting proceeds, load the demo or import delisting-terms.csv.
Set both universe cutoffs to 14:35 UTC to see missing proceeds, 14:37
for the USD receivable, and 14:50 for the first cash posting.
Portfolio replay combines portfolio-holdings.csv and universe-prices.csv.
Add delisting-terms.csv for delisting proceeds and portfolio-dividends.csv
for gross dividend income at the universe replay cutoffs.
Below the rankings, choose Load demo sectors or upload universe-sectors.csv
with the matching membership and price reports. The Sector heatmap shows
each listing's sector, weight, price return and observed contribution.

Open Financial statements under Historical replay. Start financial demo,
or import financial-filings.csv and financial-market-caps.csv. Compare the
original filing, observed restatement and revised capitalization.

Open Economic calendar under Historical replay, then Start calendar demo
or import macro-calendar.csv. Check the forecast before release and review
the first published actual and the two later revisions.

Open Option chain under Historical replay and Start option demo, or load
option-underlying.csv and option-quotes.csv. Inspect the late quotes,
unavailable observations, Greeks and implied volatility surface.

Open Replay alerts under Historical replay and Start alert demo, or load
alert-rules.csv and alert-observations.csv. Save the full replay to the
local inbox twice to verify that each crossing is delivered once.

Open Paper ledger under Historical replay and Start paper demo, or load
paper-events.csv. Step through reserves, partial fills, fees and the halt.

Open Bar backtest under Historical replay and Start backtest demo, or load
backtest-sessions.csv and backtest-bars.csv with a 60-second bar interval.
Check how a missing interval delays the first partial fill.
Walk-forward validation ranks candidates on training bars and shows the
results of each completed test fold. Seeded scenarios repeats the same
strategy on sampled price moves and volumes. The default 256 paths give
a median ending equity of 997.6 against observed baseline equity of 957.8.

The chart supports panning, zooming, a crosshair and moving-average overlays.
This build has no broker connection or order entry. Press Ctrl+C in the
launcher's terminal to stop serving the application.
"""


def main():
    required = ["index.html", "marketweft_core.wasm", "manifest.webmanifest", "sw.js",
                "icon-192.png", "icon-512.png", "THIRD-PARTY.txt", "rust-library-notices.html"]
    for filename in required:
        if not (DIST / filename).is_file():
            raise SystemExit(f"Missing {filename}. Run npm run build before packaging.")
    files = {f"dist/{p.relative_to(DIST).as_posix()}": p.read_bytes()
             for p in DIST.rglob("*") if p.is_file()}
    for name, source in {"LICENSE": "LICENSE", "THIRD_PARTY_NOTICES": "THIRD_PARTY_NOTICES",
                         "serve-terminal.mjs": "scripts/serve-terminal.mjs",
                         "example.csv": "crates/core/tests/fixtures/reference.csv"}.items():
        files[name] = (ROOT / source).read_bytes()
    files["START-HERE.txt"] = START.encode("utf-8")
    fixture = ROOT / "crates/core/tests/fixtures"
    files["replay-sessions.csv"] = (fixture / "nyse-2025-replay-sessions.csv").read_bytes()
    files["replay-ohlcv.csv"] = (fixture / "nyse-2025-replay-ohlcv.csv").read_bytes()
    files["tick-trades.csv"] = (fixture / "synthetic-tick-trades.csv").read_bytes()
    files["depth.csv"] = (fixture / "synthetic-depth.csv").read_bytes()
    files["footprint-trades.csv"] = (fixture / "synthetic-footprint.csv").read_bytes()
    for kind in ("actions", "ohlcv", "sessions"):
        files[f"split-{kind}.csv"] = (fixture / f"synthetic-split-{kind}.csv").read_bytes()
    files["cash-dividends.csv"] = (fixture / "synthetic-cash-dividends.csv").read_bytes()
    files["dividend-positions.csv"] = (fixture / "synthetic-dividend-positions.csv").read_bytes()
    files["universe-membership.csv"] = (fixture / "synthetic-universe.csv").read_bytes()
    files["delisting-terms.csv"] = (fixture / "synthetic-delisting-terms.csv").read_bytes()
    files["portfolio-holdings.csv"] = (fixture / "synthetic-portfolio-holdings.csv").read_bytes()
    files["portfolio-dividends.csv"] = (fixture / "synthetic-portfolio-dividends.csv").read_bytes()
    files["split-revisions.csv"] = (fixture / "synthetic-split-revisions.csv").read_bytes()
    files["universe-prices.csv"] = (fixture / "synthetic-universe-prices.csv").read_bytes()
    files["listing-risk-membership.csv"] = (fixture / "synthetic-listing-risk-membership.csv").read_bytes()
    files["listing-risk-prices.csv"] = (fixture / "synthetic-listing-risk-prices.csv").read_bytes()
    files["universe-sectors.csv"] = (fixture / "synthetic-universe-sectors.csv").read_bytes()
    files["financial-filings.csv"] = (fixture / "synthetic-financial-filings.csv").read_bytes()
    files["financial-market-caps.csv"] = (fixture / "synthetic-financial-market-caps.csv").read_bytes()
    files["macro-calendar.csv"] = (fixture / "synthetic-macro-calendar.csv").read_bytes()
    for kind in ("underlying", "quotes"):
        files[f"option-{kind}.csv"] = (fixture / f"synthetic-option-{kind}.csv").read_bytes()
    for kind in ("rules", "observations"):
        files[f"alert-{kind}.csv"] = (fixture / f"synthetic-alert-{kind}.csv").read_bytes()
    files["paper-events.csv"] = (fixture / "synthetic-paper-events.csv").read_bytes()
    for kind in ("sessions", "bars"):
        files[f"backtest-{kind}.csv"] = (fixture / f"synthetic-backtest-{kind}.csv").read_bytes()
    inventory = json.loads((ROOT / "docs/dependencies.cdx.json").read_text(encoding="utf-8"))
    inventory["components"] = [item for item in inventory["components"]
                               if any(p["value"] == "web-runtime" for p in item["properties"])]
    toolchain = tomllib.loads((ROOT / "rust-toolchain.toml").read_text(encoding="utf-8"))
    core = tomllib.loads((ROOT / "Cargo.toml").read_text(encoding="utf-8"))["workspace"]["package"]
    inventory["components"].append({
        "type": "library", "name": "marketweft_core.wasm", "version": core["version"],
        "hashes": [{"alg": "SHA-256", "content": hashlib.sha256(files["dist/marketweft_core.wasm"]).hexdigest()}],
        "properties": [{"name": "marketweft:rust-toolchain", "value": toolchain["toolchain"]["channel"]},
                       {"name": "marketweft:standard-library-notices", "value": "dist/rust-library-notices.html"}],
    })
    files["SBOM.cdx.json"] = (json.dumps(inventory, indent=2) + "\n").encode("utf-8")
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w") as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    print(OUTPUT)


if __name__ == "__main__":
    main()
