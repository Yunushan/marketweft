"""Stage MarketWeft's source, dependency inventory and license notices in a native app."""

import argparse
from pathlib import Path

from native_desktop_notices import ROOT, command, copy_rust_notices, put


def stage_notices(assets, target):
    notices = {
        "marketweft-0bsd.txt": "LICENSE",
        "third-party-notices.txt": "THIRD_PARTY_NOTICES",
        "web-notices.txt": "apps/terminal/public/THIRD-PARTY.txt",
        "wasm-notices.txt": "apps/terminal/public/WASM-THIRD-PARTY.txt",
        "rust-library-notices.html": "apps/terminal/public/rust-library-notices.html",
        "dependencies.cdx.json": "docs/dependencies.cdx.json",
    }
    for filename, source in notices.items():
        put(ROOT / source, assets / filename)
    revision = command("git", "rev-parse", "HEAD")
    copy_rust_notices(assets, target, revision)
    (assets / "source-revision.txt").write_text(revision + "\n", encoding="ascii")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("target", choices=("x86_64-linux-android", "aarch64-linux-android", "aarch64-apple-ios-sim"))
    args = parser.parse_args()
    stage_notices(args.directory, args.target)
