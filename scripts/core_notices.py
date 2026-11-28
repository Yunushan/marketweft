"""Collect the license notices linked into the shared browser Wasm core."""

import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/terminal/public/WASM-THIRD-PARTY.txt"
WASMI = ("https://github.com/wasmi-labs/wasmi", "91fdeee6df6d289b58c96274aeaca0d48b7bf467", "wasmi-2.0.3")
WASM_TOOLS = (
    "https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasmparser",
    "e66235859a6ec0502bf6f9dcc358953eda4cafcc", "wasmparser-0.228.0",
)
WORKSPACE_LICENSES = {
    **{(name, "2.0.3"): WASMI for name in ("wasmi", "wasmi_core", "wasmi_collections", "wasmi_ir")},
    ("wasmparser", "0.228.0"): WASM_TOOLS,
}


def notice_files(directory):
    return sorted(path for path in directory.iterdir() if path.is_file() and path.name.upper().startswith(
        ("LICENSE", "LICENCE", "COPYING", "NOTICE", "UNLICENSE", "COPYRIGHT")
    ))


def cargo_notice_paths(package):
    directory = Path(package["manifest_path"]).parent
    notices = notice_files(directory)
    provenance = WORKSPACE_LICENSES.get((package["name"], package["version"]))
    if notices or not provenance:
        return notices
    repository, revision, source = provenance
    vcs = json.loads((directory / ".cargo_vcs_info.json").read_text(encoding="utf-8"))
    if package["repository"] != repository or vcs["git"]["sha1"] != revision:
        raise ValueError(f"Unexpected workspace license provenance for {package['name']}")
    return notice_files(ROOT / "licenses" / source)


def main():
    metadata = json.loads(subprocess.check_output([
        "cargo", "metadata", "--format-version", "1", "--locked", "--offline",
        "--filter-platform", "wasm32-unknown-unknown",
    ], cwd=ROOT))
    notices = ["MarketWeft Wasm core · Third-party notices"]
    copied = set()
    for package in sorted(metadata["packages"], key=lambda entry: (entry["name"], entry["version"])):
        if package["source"] is None:
            continue
        sources = cargo_notice_paths(package)
        name = f"{package['name']} {package['version']}"
        if not sources:
            raise ValueError(f"No license text found for {name}")
        notices.append(f"{name}\n{package['license']}\n{package['repository']}")
        for path in sources:
            if path in copied:
                notices.append(f"{path.name} is reproduced above for this workspace.")
                continue
            copied.add(path)
            notices.append(path.read_text(encoding="utf-8").strip())
    data = ("\n\n".join(notices) + "\n").encode("utf-8")
    if "--check" in sys.argv:
        if OUTPUT.read_bytes() != data:
            raise SystemExit("Wasm dependency notices changed. Run python -B scripts/core_notices.py.")
    else:
        OUTPUT.write_bytes(data)


if __name__ == "__main__":
    main()
