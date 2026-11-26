"""Package the tested Linux x64 research service and its dependency notices."""
import gzip
import json
from pathlib import Path
import subprocess
import sys
import tarfile


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "apps/research-service/Cargo.toml"


def create_archive(binary, directory):
    metadata = json.loads(subprocess.check_output([
        "cargo", "metadata", "--locked", "--offline", "--format-version", "1",
        "--manifest-path", MANIFEST, "--filter-platform", "x86_64-unknown-linux-gnu",
    ], cwd=ROOT))
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    archive = directory / f"MarketWeft-research-service-{version}-linux-x64.tar.gz"
    rust_root = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
    notices = {
        "LICENSE": ROOT / "LICENSE",
        "README.md": ROOT / "docs/local-rest-research.md",
        "notices/rust-library.html": rust_root / "share/doc/rust/COPYRIGHT-library.html",
        "notices/dependencies.cdx.json": ROOT / "docs/dependencies.cdx.json",
    }
    for package in metadata["packages"]:
        if package["source"] is None:
            continue
        name = f'{package["name"]}-{package["version"]}'
        source = Path(package["manifest_path"]).parent
        licenses = sorted(
            path for path in source.iterdir()
            if path.is_file() and path.name.upper().startswith(("LICENSE", "COPYRIGHT", "NOTICE", "UNLICENSE"))
        )
        if not licenses:
            raise ValueError(f"Missing upstream notices for {name}")
        for path in licenses:
            notices[f"notices/{name}/{path.name}"] = path

    files = {"marketweft-research-service": binary, **notices}
    with archive.open("wb") as output, gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as bundle:
            for name, path in sorted(files.items()):
                entry = tarfile.TarInfo(name)
                entry.mode = 0o755 if path == binary else 0o644
                with path.open("rb") as data:
                    entry.size = path.stat().st_size
                    bundle.addfile(entry, data)
    return archive


if __name__ == "__main__":
    directory = Path("reports")
    directory.mkdir(exist_ok=True)
    print(create_archive(Path(sys.argv[1]), directory))
