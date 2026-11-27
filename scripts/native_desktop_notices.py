"""Stage licenses and exact source references for native desktop packages."""
import json
from pathlib import Path
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "apps/desktop/Cargo.toml"
NOTICE_PREFIXES = ("LICENSE", "LICENCE", "COPYING", "COPYRIGHT", "NOTICE", "UNLICENSE")
PROJECT_NOTICES = {
    ("alloc-stdlib", "0.3.0"): ("0a81fd6928ea3b33c8cd484aa4575d50ffb98012", "alloc-stdlib-BSD-3-Clause.txt"),
    ("dlopen2", "0.8.2"): ("cc80e4a0a90d499b677fdf7743699b4b3a43a989", "dlopen2-MIT.txt"),
    ("dlopen2_derive", "0.4.3"): ("cc80e4a0a90d499b677fdf7743699b4b3a43a989", "dlopen2-MIT.txt"),
    ("webview2-com", "0.39.1"): ("edc2caf886175ccaebe86078c9cfe1ae2a187328", "webview2-rs-MIT.txt"),
    ("webview2-com-macros", "0.8.1"): ("dffa41a8a46d3f5565eefbff2de57d38d399f158", "webview2-rs-MIT.txt"),
    ("webview2-com-sys", "0.39.1"): ("edc2caf886175ccaebe86078c9cfe1ae2a187328", "webview2-rs-MIT.txt"),
}


def command(*args, cwd=ROOT, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, encoding="utf-8").strip()


def runtime_packages(metadata):
    resolution = metadata["resolve"]
    nodes = {node["id"]: node["deps"] for node in resolution["nodes"]}
    pending = [resolution["root"]]
    visited = set()
    while pending:
        package = pending.pop()
        if package in visited:
            continue
        visited.add(package)
        pending.extend(dependency["pkg"] for dependency in nodes[package]
                       if any(edge["kind"] is None for edge in dependency["dep_kinds"]))
    return sorted(
        (package for package in metadata["packages"]
         if package["id"] in visited and package["id"] != resolution["root"]),
        key=lambda package: (package["name"], package["version"]),
    )


def put(source, destination, mode=0o644):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    destination.chmod(mode)


def crate_files(package):
    source = Path(package["manifest_path"]).parent
    paths = sorted(path for path in source.iterdir()
                   if path.is_file() and path.name.upper().startswith(NOTICE_PREFIXES))
    if package["license_file"]:
        declared = source / package["license_file"]
        if declared not in paths:
            paths.append(declared)
    return paths


def vcs_revision(package):
    folder = Path(package["manifest_path"]).parent
    return json.loads((folder / ".cargo_vcs_info.json").read_text(encoding="utf-8"))["git"]["sha1"]


def missing_crate_notices(package, packages):
    key = package["name"], package["version"]
    if key in PROJECT_NOTICES:
        commit, notice = PROJECT_NOTICES[key]
        if vcs_revision(package) == commit:
            return [ROOT / "apps/desktop/notices" / notice]
    if key == ("libappindicator-sys", "0.9.0"):
        parent = packages["libappindicator", "0.9.0"]
        if package["license"] == parent["license"] and vcs_revision(package) == vcs_revision(parent):
            return crate_files(parent)
    if key == ("selectors", "0.38.0"):
        # selectors declares MPL-2.0 in its source headers. cssparser ships the license text.
        cssparser = packages["cssparser", "0.37.0"]
        if package["license"] == cssparser["license"] == "MPL-2.0":
            license_path = Path(cssparser["manifest_path"]).with_name("LICENSE")
            return [license_path]
    raise ValueError(f"Missing upstream notices for {package['name']} {package['version']}.")


def copy_rust_notices(directory, target, revision):
    metadata = json.loads(command(
        "cargo", "metadata", "--locked", "--format-version", "1",
        "--manifest-path", MANIFEST, "--filter-platform", target,
    ))
    with MANIFEST.with_name("Cargo.lock").open("rb") as handle:
        checksums = {
            (package["name"], package["version"]): package["checksum"]
            for package in tomllib.load(handle)["package"] if "checksum" in package
        }
    sources = []
    packages = {(package["name"], package["version"]): package for package in runtime_packages(metadata)}
    for (name, version), package in packages.items():
        source = Path(package["manifest_path"]).parent
        paths = crate_files(package) or missing_crate_notices(package, packages)
        for path in paths:
            put(path, directory / "cargo" / f"{name}-{version}" / path.name)
        if package["source"] is None:
            relative = source.relative_to(ROOT).as_posix()
            location = f"https://github.com/Yunushan/marketweft/tree/{revision}/{relative}"
            digest = None
        else:
            location = f"https://static.crates.io/crates/{name}/{name}-{version}.crate"
            digest = checksums[name, version]
        sources.append({
            "name": name, "version": version, "license": package["license"],
            "source": location, "sha256": digest,
        })
    (directory / "cargo-sources.json").write_text(
        json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
