"""Fetch a prior verified desktop installer for an in-place upgrade smoke test."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zipfile import ZipFile

API = "https://api.github.com/repos/Yunushan/marketweft"
ARCHITECTURES = {
    "ubuntu": {"amd64": "X64", "arm64": "ARM64"},
    "windows": {"x64": "x64", "arm64": "arm64"},
    "macos": {"x64": "x64", "arm64": "arm64"},
    "macos-disk-image": {"x64": "x64", "arm64": "arm64"},
}


class BaselineArchiveMissing(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def https_location(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Expected an HTTPS artifact download URL.")
    return url


class HttpsRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, https_location(newurl))


def package_from_archive(archive, destination, filename):
    names = [filename, filename + ".sha256"]
    with ZipFile(archive) as bundle:
        if sorted(bundle.namelist()) != names:
            raise ValueError("The verified artifact must contain its package and SHA-256 file.")
        for name in names:
            with bundle.open(name) as stream, (destination / name).open("wb") as output:
                shutil.copyfileobj(stream, output)
    manifest = (destination / names[1]).read_text(encoding="ascii")
    with (destination / filename).open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if manifest != f"{digest}  {filename}\n":
        raise ValueError("The extracted upgrade baseline did not match its package checksum.")


def fetch(run_id, commit, version, architecture, output, token, platform="ubuntu"):
    opener = build_opener(NoRedirect())
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "MarketWeft-desktop-upgrade",
    }

    def api(path):
        return opener.open(Request(API + path, headers=headers), timeout=30)

    with api(f"/actions/runs/{run_id}") as response:
        run = json.load(response)
    if (run["head_sha"] != commit or run["path"] != ".github/workflows/verify.yml"
            or run["event"] != "push" or run["status"] != "completed"
            or run["conclusion"] != "success"
            or run["head_repository"]["full_name"].lower() != "yunushan/marketweft"):
        raise ValueError("The baseline run does not verify the requested project commit.")
    runner_arch = ARCHITECTURES[platform][architecture]
    stem = platform if platform == "macos-disk-image" else f"{platform}-desktop"
    expected = f"{stem}-{runner_arch}-attempt-{run['run_attempt']}"
    with api(f"/actions/runs/{run_id}/artifacts?per_page=100") as response:
        found = [item for item in json.load(response)["artifacts"]
                 if item["name"] == expected and not item["expired"]]
    if not found:
        raise BaselineArchiveMissing("The verified desktop archive is unavailable.")
    if len(found) != 1 or not re.fullmatch(r"sha256:[0-9a-f]{64}", found[0].get("digest") or ""):
        raise ValueError("Expected one live desktop artifact with a SHA-256 digest.")
    artifact = found[0]

    try:
        with api(f"/actions/artifacts/{artifact['id']}/zip"):
            raise ValueError("Expected a redirect for the desktop artifact download.")
    except HTTPError as error:
        if error.code != 302:
            raise
        with error:
            location = https_location(error.headers["Location"])

    if platform == "ubuntu":
        filename = f"marketweft-desktop_{version}_{architecture}.deb"
    elif platform == "windows":
        filename = f"MarketWeft-desktop-{version}-windows-{architecture}-setup.exe"
    else:
        extension = "dmg" if platform == "macos-disk-image" else "zip"
        filename = f"MarketWeft-desktop-{version}-macos-{architecture}.{extension}"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="marketweft-baseline-", dir=output) as directory:
        temporary = Path(directory)
        archive = temporary / "artifact.zip"
        size = artifact["size_in_bytes"]
        written = 0
        digest = hashlib.sha256()
        download = build_opener(HttpsRedirect())
        with download.open(location, timeout=40) as stream, archive.open("wb") as file:
            while chunk := stream.read(1024 * 1024):
                written += len(chunk)
                if written > size:
                    raise ValueError("The desktop artifact exceeded its recorded size.")
                digest.update(chunk)
                file.write(chunk)
        if written != size or "sha256:" + digest.hexdigest() != artifact["digest"]:
            raise ValueError("The desktop artifact did not match GitHub’s recorded digest.")
        package_from_archive(archive, temporary, filename)
        shutil.move(temporary / filename, output / filename)
        shutil.move(temporary / (filename + ".sha256"), output / (filename + ".sha256"))
    return output / filename


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=int, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--platform", choices=ARCHITECTURES, default="ubuntu")
    parser.add_argument("--architecture", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.architecture not in ARCHITECTURES[args.platform]:
        parser.error(f"Unsupported {args.platform} architecture: {args.architecture}")
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version):
        parser.error("Supply the full commit SHA and a numeric release version.")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        parser.error("GITHUB_TOKEN must grant Actions read access to the baseline run.")
    try:
        print(fetch(args.run, args.commit, args.version, args.architecture, args.output, token, args.platform))
    except BaselineArchiveMissing as error:
        print(error, file=sys.stderr)
        raise SystemExit(42) from error
