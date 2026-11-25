"""Recreate notices for packages distributed in the static browser build."""
import json
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
public = root / "apps/terminal/public"
entries = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))["packages"]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
notices = [f"MarketWeft {version} · Third-party notices\n"]
for path, entry in sorted(entries.items()):
    if "node_modules/" not in path or entry.get("link") or entry.get("dev"):
        continue
    package = root / path
    candidates = sorted(p for p in package.iterdir() if p.is_file() and
                        p.name.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE")))
    if not candidates:
        raise ValueError(f"No notice text found in {package}")
    notices.append(f"{path.rsplit('node_modules/', 1)[1]} {entry['version']}")
    notices.extend(p.read_text(encoding="utf-8") for p in candidates)
(public / "THIRD-PARTY.txt").write_bytes(("\n\n".join(notices) + "\n").replace("\r\n", "\n").encode("utf-8"))
sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
shutil.copyfile(sysroot / "share/doc/rust/COPYRIGHT-library.html", public / "rust-library-notices.html")

