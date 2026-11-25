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
    inventory = json.loads((ROOT / "docs/dependencies.cdx.json").read_text(encoding="utf-8"))
    inventory["components"] = [item for item in inventory["components"]
                               if any(p["value"] == "web-runtime" for p in item["properties"])]
    toolchain = tomllib.loads((ROOT / "rust-toolchain.toml").read_text(encoding="utf-8"))
    inventory["components"].append({
        "type": "library", "name": "marketweft_core.wasm", "version": "0.1.0",
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
