"""Identity of the reviewed GTK3 compatibility backport in the optional native host."""
from hashlib import sha256
from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps/desktop"
VENDOR = DESKTOP / "vendor/glib-0.18.5"
UPSTREAM = "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5"
PATCHED_TREE = "e8dbbd51b181d6ffc6d5e002bc28334a94760799a200181dedbfc263382076b1"
FIXED_ADVISORIES = {"RUSTSEC-2024-0429", "GHSA-wrw7-89jp-8q8g"}


def tree_digest(root):
    entries = []
    for file in root.rglob("*"):
        if file.is_symlink():
            raise ValueError(f"Unexpected symbolic link in vendored source: {file}")
        if file.is_file():
            entries.append((file.relative_to(root).as_posix(), file))
    digest = sha256()
    for name, file in sorted(entries):
        digest.update(name.encode("utf-8") + b"\0" + sha256(file.read_bytes()).digest())
    return digest.hexdigest()


def verified_glib():
    manifest = tomllib.loads((DESKTOP / "Cargo.toml").read_text(encoding="utf-8"))
    patch = manifest["patch"]["crates-io"]["glib"]
    locked = tomllib.loads((DESKTOP / "Cargo.lock").read_text(encoding="utf-8"))
    glib = [p for p in locked["package"] if p["name"] == "glib" and p["version"] == "0.18.5"]
    if (patch != {"path": "vendor/glib-0.18.5"} or len(glib) != 1 or "source" in glib[0]
            or tree_digest(VENDOR) != PATCHED_TREE):
        raise ValueError("Review required: the locked glib compatibility backport has changed.")
    return "glib", "0.18.5"

