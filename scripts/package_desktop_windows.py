"""Build a per-user Windows desktop installer from a compiled executable."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib

from native_desktop_notices import MANIFEST, ROOT, command, copy_rust_notices, put
from verify_windows_arch import MACHINES, pe_machine

INSTALLER = ROOT / "apps/desktop/installer/marketweft.nsi"
RUST_TARGETS = {"x64": "x86_64-pc-windows-msvc", "arm64": "aarch64-pc-windows-msvc"}


def write_payload_macros(staging):
    payload = staging / "payload"
    paths = sorted(path.relative_to(payload) for path in payload.rglob("*") if path.is_file())
    if any(not re.fullmatch(r"[-a-zA-Z0-9_./+]+", path.as_posix()) for path in paths):
        raise ValueError("An installer payload filename could not be embedded.")
    directories = sorted({path.parent for path in paths})
    script = ["!macro InstallPayload"]
    for directory in directories:
        destination = "$INSTDIR" if directory == Path(".") else "$INSTDIR\\" + directory.as_posix().replace("/", "\\")
        script.append(f'  SetOutPath "{destination}"')
        script.extend(f'  File "{Path("payload") / path}"' for path in paths if path.parent == directory)
    script.extend(("!macroend", "", "!macro RemovePayload"))
    for path in paths:
        destination = path.as_posix().replace("/", "\\")
        script.append(f'  Delete "$INSTDIR\\{destination}"')
    parents = {parent for path in paths for parent in path.parents if parent != Path(".")}
    for directory in sorted(parents, key=lambda value: (-len(value.parts), value)):
        destination = directory.as_posix().replace("/", "\\")
        script.append(f'  RMDir "$INSTDIR\\{destination}"')
    script.extend(("!macroend", ""))
    (staging / "payload.nsh").write_text("\n".join(script), encoding="ascii")


def stage(binary, staging, revision, architecture):
    payload = staging / "payload"
    notices = payload / "licenses"
    put(binary, payload / "marketweft-desktop.exe")
    put(ROOT / "LICENSE", notices / "marketweft-0bsd.txt")
    put(ROOT / "THIRD_PARTY_NOTICES", notices / "third-party-notices.txt")
    put(ROOT / "apps/terminal/public/THIRD-PARTY.txt", notices / "web-notices.txt")
    put(ROOT / "apps/terminal/public/rust-library-notices.html", notices / "rust-library-notices.html")
    put(ROOT / "docs/dependencies.cdx.json", notices / "dependencies.cdx.json")
    copy_rust_notices(notices, RUST_TARGETS[architecture], revision)
    (payload / "source-revision.txt").write_text(revision + "\n", encoding="ascii")
    put(INSTALLER, staging / "installer.nsi")
    put(ROOT / "apps/desktop/icons/icon.ico", staging / "icon.ico")
    write_payload_macros(staging)


def build(binary, output, compiler, architecture):
    binary = binary.resolve(strict=True)
    if pe_machine(binary) != MACHINES[architecture]:
        raise ValueError(f"The installer expects a Windows {architecture} desktop executable.")
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    with MANIFEST.open("rb") as source:
        desktop_version = tomllib.load(source)["package"]["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version) or desktop_version != version:
        raise ValueError("The desktop and repository versions must match.")
    revision = command("git", "rev-parse", "HEAD")
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f"MarketWeft-desktop-{version}-windows-{architecture}-setup.exe"
    if os.name == "nt":
        option = "/"
    else:
        option = "-"
    with tempfile.TemporaryDirectory(prefix="marketweft-nsis-") as temporary:
        staging = Path(temporary)
        stage(binary, staging, revision, architecture)
        subprocess.run([compiler, f"{option}NOCD", f"{option}V2", f"{option}WX", f"{option}DMARKETWEFT_VERSION={version}",
                        "installer.nsi"], cwd=staging, check=True)
        shutil.copyfile(staging / "marketweft-desktop-installer.exe", destination)
    with destination.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    destination.with_suffix(".exe.sha256").write_text(f"{digest}  {destination.name}\n", encoding="ascii")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--output", type=Path, default=Path("reports"))
    parser.add_argument("--compiler", default="makensis")
    parser.add_argument("--architecture", choices=RUST_TARGETS, default="x64")
    args = parser.parse_args()
    print(build(args.binary, args.output, args.compiler, args.architecture))
