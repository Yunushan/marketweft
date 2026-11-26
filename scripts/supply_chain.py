"""Generate a reproducible CycloneDX 1.5 package inventory and enforce license policy."""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib
from urllib.parse import quote
from desktop_backport import PATCHED_TREE, UPSTREAM, VENDOR, verified_glib

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs" / "dependencies.cdx.json"
ALLOWED = {"0BSD", "MIT", "MIT-0", "BSD-2-Clause", "BSD-3-Clause", "ISC",
           "Apache-2.0", "Zlib", "Unicode-3.0", "Apache-2.0 WITH LLVM-exception"}
# File-scoped MPL packages in optional native tooling and the CSS build step.
DESKTOP_MPL = {"cssparser", "cssparser-macros", "dtoa-short", "option-ext", "selectors"}
WEB_BUILD_MPL = {"lightningcss", "lightningcss-android-arm64", "lightningcss-darwin-arm64",
                 "lightningcss-darwin-x64", "lightningcss-freebsd-x64", "lightningcss-linux-arm-gnueabihf",
                 "lightningcss-linux-arm64-gnu", "lightningcss-linux-arm64-musl",
                 "lightningcss-linux-x64-gnu", "lightningcss-linux-x64-musl",
                 "lightningcss-win32-arm64-msvc", "lightningcss-win32-x64-msvc"}


def approved(expression, allowed):
    """Evaluate a complete SPDX expression. Unknown licenses fail their branch."""
    tokens = re.findall(r"[()]|[^\s()]+", expression)
    pos = 0

    def take(value):
        nonlocal pos
        if pos < len(tokens) and tokens[pos] == value:
            pos += 1
            return True
        return False

    def identifier():
        nonlocal pos
        if pos == len(tokens) or tokens[pos] in {"(", ")", "OR", "AND", "WITH"}:
            raise ValueError(f"Missing license in {expression!r}")
        value = tokens[pos]
        pos += 1
        return value

    def atom():
        if take("("):
            value = disjunction()
            if not take(")"):
                raise ValueError(f"Unclosed group in {expression!r}")
            return value
        license_id = identifier()
        if take("WITH"):
            license_id += " WITH " + identifier()
        return license_id in allowed

    def conjunction():
        value = atom()
        while take("AND"):
            value = atom() and value
        return value

    def disjunction():
        value = conjunction()
        while take("OR"):
            value = conjunction() or value
        return value

    value = disjunction()
    if pos != len(tokens):
        raise ValueError(f"Unexpected token in {expression!r}")
    return value


def component(ecosystem, name, version, license_id, scope, hashes):
    encoded = quote(name, safe="/")
    purl = f"pkg:{ecosystem}/{encoded}@{quote(version, safe='.')}"
    allowed = ALLOWED
    if (scope == "desktop" and name in DESKTOP_MPL) or (scope == "web-build" and name in WEB_BUILD_MPL):
        allowed = allowed | {"MPL-2.0"}
    if not approved(license_id, allowed):
        raise ValueError(f"License review required: {name} {version} ({scope}): {license_id}")
    return {"type": "library", "name": name, "version": version, "bom-ref": purl, "purl": purl,
            "licenses": [{"expression": license_id}], "hashes": hashes,
            "properties": [{"name": "marketweft:dependency-group", "value": scope}]}


def cargo_components(directory, scope):
    locked = tomllib.loads((directory / "Cargo.lock").read_text(encoding="utf-8"))
    checksums = {(p["name"], p["version"]): p["checksum"] for p in locked["package"] if "checksum" in p}
    result = subprocess.check_output(["cargo", "metadata", "--format-version", "1", "--locked", "--offline"],
                                     cwd=directory)
    for package in json.loads(result)["packages"]:
        if not package["source"]:
            if Path(package["manifest_path"]).resolve() == VENDOR / "Cargo.toml":
                if scope != "desktop" or (package["name"], package["version"]) != verified_glib():
                    raise ValueError("Unreviewed vendored glib version or scope")
                item = component("cargo", "glib", "0.18.5", package["license"], scope,
                                 [{"alg": "SHA-256", "content": PATCHED_TREE}])
                item["properties"].extend([
                    {"name": "marketweft:source-hash-algorithm", "value": "sorted-path-NUL-fileSHA256"},
                    {"name": "marketweft:upstream-archive-sha256", "value": UPSTREAM},
                    {"name": "marketweft:backport", "value": "Debian glib 0.18.5-7 patch 0007"},
                ])
                yield item
                continue
            if not Path(package["manifest_path"]).resolve().is_relative_to(ROOT) or package["license"] != "0BSD":
                raise ValueError(f"Unreviewed path dependency: {package['name']}")
            continue
        name, version = package["name"], package["version"]
        checksum = checksums.get((name, version))
        if not checksum:
            raise ValueError(f"Unpinned Cargo source for {name}")
        # Cargo historically accepted '/' to indicate alternative licenses.
        expression = re.sub(r"\s*/\s*", " OR ", package["license"] or "")
        yield component("cargo", name, version, expression, scope, [{"alg": "SHA-256", "content": checksum}])


def npm_components():
    locked = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    for path, entry in locked["packages"].items():
        if entry.get("link") or "node_modules/" not in path:
            continue
        name = entry.get("name") or path.rsplit("node_modules/", 1)[1]
        algorithm, digest = entry["integrity"].split("-", 1)
        hash_type = {"sha512": "SHA-512", "sha256": "SHA-256"}[algorithm]
        scope = "web-build" if entry.get("dev") else "web-runtime"
        yield component("npm", name, entry["version"], entry.get("license", ""), scope,
                        [{"alg": hash_type, "content": base64.b64decode(digest, validate=True).hex()}])


def python_build_component():
    folder = ROOT / "packages/python-research"
    locked = (folder / "build-requirements.txt").read_text(encoding="utf-8")
    entries = [line for line in locked.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if len(entries) != 1:
        raise ValueError("Review Python build dependencies before changing the lock.")
    requirement = re.fullmatch(r"setuptools==([0-9.]+) --hash=sha256:([0-9a-f]{64})", entries[0])
    if not requirement:
        raise ValueError("Supply the reviewed setuptools version and wheel digest.")
    version, digest = requirement.groups()
    manifest = tomllib.loads((folder / "pyproject.toml").read_text(encoding="utf-8"))
    if manifest["build-system"]["requires"] != [f"setuptools=={version}"] or manifest["project"].get("dependencies"):
        raise ValueError("Review any Python build version mismatch or runtime dependency.")
    return component("pypi", "setuptools", version, "MIT", "python-build",
                     [{"alg": "SHA-256", "content": digest}])


def main():
    components = {}
    for item in [*cargo_components(ROOT, "core"), *cargo_components(ROOT / "apps/desktop", "desktop"),
                 *npm_components(), python_build_component()]:
        key = item["bom-ref"]
        if key in components and item["hashes"] != components[key]["hashes"]:
            raise ValueError(f"Inconsistent package integrity for {key}")
        components[key] = item
    report = {"bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1,
              "metadata": {"component": {"type": "application", "name": "MarketWeft",
                                         "version": json.loads((ROOT / "package.json").read_text())["version"]}},
              "components": [components[k] for k in sorted(components)]}
    data = (json.dumps(report, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if "--check" in sys.argv:
        if not REPORT.exists() or REPORT.read_bytes() != data:
            raise SystemExit("Dependency inventory changed: run python scripts/supply_chain.py and review.")
    else:
        REPORT.write_bytes(data)
    print(f"{len(components)} locked components passed. Inventory SHA256 {hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
