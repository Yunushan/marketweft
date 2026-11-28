"""Build a portable macOS application archive from a native MarketWeft executable."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import tempfile
import tomllib
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from native_desktop_notices import MANIFEST, ROOT, command, copy_rust_notices, put

ARCHITECTURES = {"x64": ("x86_64", "x86_64-apple-darwin"), "arm64": ("arm64", "aarch64-apple-darwin")}
APPLICATION = "MarketWeft.app"
EXECUTABLE = "marketweft-desktop"


def stage_icon(resources, staging):
    iconset = staging / "MarketWeft.iconset"
    iconset.mkdir()
    source = ROOT / "apps/desktop/icons/icon.png"
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            suffix = "@2x" if scale == 2 else ""
            image = iconset / f"icon_{size}x{size}{suffix}.png"
            pixels = str(size * scale)
            command("sips", "-z", pixels, pixels, source, "--out", image)
    command("iconutil", "--convert", "icns", "--output", resources / "MarketWeft.icns", iconset)


def stage(binary, workspace, architecture, version, revision):
    bundle = workspace / APPLICATION
    contents = bundle / "Contents"
    resources = contents / "Resources"
    notices = resources / "licenses"
    put(binary, contents / "MacOS" / EXECUTABLE, 0o755)
    put(ROOT / "LICENSE", notices / "marketweft-0bsd.txt")
    put(ROOT / "THIRD_PARTY_NOTICES", notices / "third-party-notices.txt")
    put(ROOT / "apps/terminal/public/THIRD-PARTY.txt", notices / "web-notices.txt")
    put(ROOT / "apps/terminal/public/WASM-THIRD-PARTY.txt", notices / "wasm-notices.txt")
    put(ROOT / "apps/terminal/public/rust-library-notices.html", notices / "rust-library-notices.html")
    put(ROOT / "docs/dependencies.cdx.json", notices / "dependencies.cdx.json")
    copy_rust_notices(notices, ARCHITECTURES[architecture][1], revision)
    (resources / "source-revision.txt").write_text(revision + "\n", encoding="ascii")
    stage_icon(resources, workspace)

    config = json.loads((ROOT / "apps/desktop/tauri.conf.json").read_text(encoding="utf-8"))
    if config["version"] != version:
        raise ValueError("The bundle and repository versions must match.")
    info = {
        "CFBundleDisplayName": config["productName"],
        "CFBundleExecutable": EXECUTABLE,
        "CFBundleIconFile": "MarketWeft.icns",
        "CFBundleIdentifier": config["identifier"],
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleName": config["productName"],
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": version,
        "CFBundleVersion": version,
        "NSHighResolutionCapable": True,
    }
    with (contents / "Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    command("plutil", "-lint", contents / "Info.plist")
    subprocess.run(["codesign", "--force", "--sign", "-", "--timestamp=none", bundle], check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", bundle], check=True)
    return bundle


def write_zip(bundle, archive, timestamp):
    date = datetime.fromtimestamp(timestamp, timezone.utc).timetuple()[:6]
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as zip_file:
        for path in sorted(bundle.rglob("*")):
            if not path.is_file():
                continue
            executable = path == bundle / "Contents" / "MacOS" / EXECUTABLE
            name = path.relative_to(bundle.parent).as_posix()
            entry = ZipInfo(name, date)
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
            zip_file.writestr(entry, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)


def build(binary, architecture, output):
    binary = binary.resolve(strict=True)
    if command("xcrun", "lipo", "-archs", binary) != ARCHITECTURES[architecture][0]:
        raise ValueError(f"Expected one native macOS {architecture} architecture.")
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    with MANIFEST.open("rb") as source:
        desktop_version = tomllib.load(source)["package"]["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) or desktop_version != version:
        raise ValueError("The desktop and repository versions must match.")
    revision = command("git", "rev-parse", "HEAD")
    timestamp = int(command("git", "show", "-s", "--format=%ct", revision))
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"MarketWeft-desktop-{version}-macos-{architecture}.zip"
    with tempfile.TemporaryDirectory(prefix="marketweft-macos-") as temporary:
        bundle = stage(binary, Path(temporary), architecture, version, revision)
        write_zip(bundle, archive, timestamp)
    with archive.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--architecture", choices=ARCHITECTURES, required=True)
    parser.add_argument("--output", type=Path, default=Path("reports"))
    args = parser.parse_args()
    print(build(args.binary, args.architecture, args.output))
