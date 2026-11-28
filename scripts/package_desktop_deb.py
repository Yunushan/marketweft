"""Build an Ubuntu desktop package from an already compiled MarketWeft executable."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import tomllib

from native_desktop_notices import MANIFEST, ROOT, command, copy_rust_notices, put

NAME = "marketweft-desktop"
APP_ID = "org.marketweft.terminal"
MAINTAINER = "MarketWeft contributors <24549832+Yunushan@users.noreply.github.com>"
TARGETS = {
    "amd64": (62, "x86_64-unknown-linux-gnu"),
    "arm64": (183, "aarch64-unknown-linux-gnu"),
}

def check_elf(binary, architecture):
    with binary.open("rb") as handle:
        header = handle.read(20)
    machine = TARGETS[architecture][0]
    if (len(header) != 20 or header[:7] != b"\x7fELF\x02\x01\x01"
            or int.from_bytes(header[18:20], "little") != machine):
        raise ValueError(f"Expected an ELF64 MarketWeft executable for {architecture}.")


def dependencies(binary, work):
    debian = work / "debian"
    debian.mkdir(exist_ok=True)
    (debian / "control").write_text(
        f"Source: {NAME}\nMaintainer: {MAINTAINER}\n\nPackage: {NAME}\n"
        "Architecture: any\nDescription: MarketWeft desktop research terminal\n",
        encoding="utf-8",
    )
    output = command("dpkg-shlibdeps", "-O", f"-e{binary.relative_to(work)}", cwd=work)
    key, sep, value = output.partition("=")
    if key != "shlibs:Depends" or not sep or not value or "\n" in value:
        raise ValueError("Could not determine the executable's Debian library dependencies.")
    return value


def build(binary, output):
    binary = binary.resolve(strict=True)
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    with MANIFEST.open("rb") as handle:
        desktop_version = tomllib.load(handle)["package"]["version"]
    if desktop_version != version:
        raise ValueError("The desktop and repository versions must match.")
    architecture = command("dpkg", "--print-architecture")
    if architecture not in TARGETS:
        raise ValueError("MarketWeft desktop packages support amd64 and arm64.")
    check_elf(binary, architecture)
    revision = command("git", "rev-parse", "HEAD")
    epoch = command("git", "show", "-s", "--format=%ct", revision)
    env = dict(os.environ, SOURCE_DATE_EPOCH=epoch, LC_ALL="C.UTF-8")
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    filename = f"{NAME}_{version}_{architecture}.deb"

    with tempfile.TemporaryDirectory(prefix="marketweft-deb-") as temporary:
        work = Path(temporary)
        root = work / "debian" / NAME
        doc = root / "usr/share/doc" / NAME
        executable = root / "usr/bin" / NAME
        put(binary, executable, 0o755)
        put(ROOT / "LICENSE", doc / "copyright")
        put(ROOT / "THIRD_PARTY_NOTICES", doc / "third-party-notices.txt")
        put(ROOT / "apps/terminal/public/THIRD-PARTY.txt", doc / "web-notices.txt")
        put(ROOT / "apps/terminal/public/WASM-THIRD-PARTY.txt", doc / "wasm-notices.txt")
        put(ROOT / "apps/terminal/public/rust-library-notices.html", doc / "rust-library-notices.html")
        put(ROOT / "docs/dependencies.cdx.json", doc / "dependencies.cdx.json")
        copy_rust_notices(doc, TARGETS[architecture][1], revision)
        (doc / "source-revision").write_text(revision + "\n", encoding="ascii")

        icon = ROOT / "apps/desktop/icons/icon.png"
        with icon.open("rb") as image:
            header = image.read(24)
        width = int.from_bytes(header[16:20], "big")
        height = int.from_bytes(header[20:24], "big")
        if header[:8] != b"\x89PNG\r\n\x1a\n" or not width or not height:
            raise ValueError("The checked-in desktop icon must be a valid PNG.")
        put(icon, root / f"usr/share/icons/hicolor/{width}x{height}/apps/{APP_ID}.png")
        launcher = root / "usr/share/applications" / f"{APP_ID}.desktop"
        launcher.parent.mkdir(parents=True)
        launcher.write_text(
            "[Desktop Entry]\nType=Application\nName=MarketWeft\n"
            "Comment=Local financial research and historical replay\n"
            f"Exec=/usr/bin/{NAME}\nIcon={APP_ID}\n"
            "Terminal=false\nCategories=Office;Finance;\n",
            encoding="utf-8",
        )
        control = root / "DEBIAN/control"
        control.parent.mkdir()
        control.write_text(
            f"Package: {NAME}\nVersion: {version}\nArchitecture: {architecture}\n"
            f"Maintainer: {MAINTAINER}\n"
            "Section: utils\nPriority: optional\n"
            "Homepage: https://github.com/Yunushan/marketweft\n"
            "Description: Local MarketWeft research terminal\n"
            " Charting, research and historical replay in a Tauri desktop window.\n",
            encoding="utf-8",
        )
        required = dependencies(executable, work)
        with control.open("a", encoding="utf-8") as handle:
            handle.write(f"Depends: {required}\n")
        checksums = []
        for path in sorted((root / "usr").rglob("*")):
            if path.is_file():
                with path.open("rb") as stream:
                    digest = hashlib.file_digest(stream, lambda: hashlib.md5(usedforsecurity=False)).hexdigest()
                checksums.append(f"{digest}  {path.relative_to(root).as_posix()}\n")
        control.with_name("md5sums").write_text("".join(checksums), encoding="ascii")
        for path in root.rglob("*"):
            path.chmod(0o755 if path.is_dir() or path == executable else 0o644)
            os.utime(path, (int(epoch), int(epoch)))
        root.chmod(0o755)
        os.utime(root, (int(epoch), int(epoch)))
        package = work / filename
        command("dpkg-deb", "--root-owner-group", "--build", root, package, cwd=work, env=env)
        result = output / filename
        shutil.copyfile(package, result)
        with package.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        result.with_suffix(".deb.sha256").write_text(f"{digest}  {filename}\n", encoding="ascii")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--output", type=Path, default=Path("reports"))
    args = parser.parse_args()
    print(build(args.binary, args.output))
