"""Stage MarketWeft's source, dependency inventory and license notices in the APK."""

from native_desktop_notices import ROOT, command, copy_rust_notices, put


def main():
    assets = ROOT / "apps/desktop/gen/android/app/src/main/assets/marketweft-notices"
    notices = {
        "marketweft-0bsd.txt": "LICENSE",
        "third-party-notices.txt": "THIRD_PARTY_NOTICES",
        "web-notices.txt": "apps/terminal/public/THIRD-PARTY.txt",
        "rust-library-notices.html": "apps/terminal/public/rust-library-notices.html",
        "dependencies.cdx.json": "docs/dependencies.cdx.json",
    }
    for filename, source in notices.items():
        put(ROOT / source, assets / filename)
    revision = command("git", "rev-parse", "HEAD")
    copy_rust_notices(assets, "x86_64-linux-android", revision)
    (assets / "source-revision.txt").write_text(revision + "\n", encoding="ascii")


if __name__ == "__main__":
    main()
