"""Verify a native Android debug upgrade with an ephemeral signing identity."""

import argparse
import hashlib
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from verify_android_csv import AndroidUI, verify_import, verify_reopened


def command(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, text=True, timeout=90).stdout


def version_code(sdk, apk, package, version):
    badging = command(sdk / "aapt2", "dump", "badging", apk)
    prefix = f"^package: name='{re.escape(package)}' versionCode='(\\d+)' versionName='{re.escape(version)}'"
    match = re.search(prefix, badging, re.MULTILINE)
    if not match:
        raise ValueError(f"Unexpected Android package identity for {apk.name}.")
    return int(match[1])


def payload(apk):
    signature = re.compile(r"META-INF/(MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))", re.IGNORECASE)
    with ZipFile(apk) as bundle:
        entries = [entry for entry in bundle.infolist() if not entry.is_dir() and not signature.fullmatch(entry.filename)]
        names = {entry.filename for entry in entries}
        if len(names) != len(entries) or "AndroidManifest.xml" not in names:
            raise ValueError("APK payload must contain an unambiguous Android manifest.")
        digests = {}
        for entry in entries:
            with bundle.open(entry) as stream:
                digests[entry.filename] = hashlib.file_digest(stream, "sha256").hexdigest()
        return digests


def sign_upgrade_pair(sdk, work, baseline, candidate):
    store = work / "upgrade.p12"
    alias = "marketweft-upgrade"
    password = "upgrade-fixture"
    command("keytool", "-genkeypair", "-noprompt", "-storetype", "PKCS12", "-keystore", store,
            "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "2",
            "-dname", "CN=MarketWeft Android CI Upgrade", "-storepass", password, "-keypass", password)
    signed = work / "previous.apk", work / "candidate.apk"
    certificates = []
    for original, destination in zip((baseline, candidate), signed, strict=True):
        command(sdk / "apksigner", "sign", "--ks", store, "--ks-key-alias", alias,
                "--ks-pass", "pass:" + password, "--key-pass", "pass:" + password, "--out", destination, original)
        verification = command(sdk / "apksigner", "verify", "--print-certs", destination)
        digests = set(re.findall(
            r"^(?:V\d+(?:\.\d+)? Signer:|Signer #\d+) certificate SHA-256 digest: ([0-9a-f]{64})$",
            verification, re.MULTILINE,
        ))
        if len(digests) != 1 or payload(original) != payload(destination):
            raise ValueError("Ephemeral signing must preserve the sole APK payload and use one certificate.")
        certificates.append(digests.pop())
    if certificates[0] != certificates[1]:
        raise ValueError("Both APKs must use the same Android upgrade certificate.")
    return signed


def require_installed_version(ui, package, version, code):
    installed = ui.adb("shell", "dumpsys", "package", package).decode()
    if not re.search(rf"^\s+versionName={re.escape(version)}\s*$", installed, re.MULTILINE):
        raise RuntimeError(f"The installed Android version is not {version}.")
    if not re.search(rf"^\s+versionCode={code}(?:\s|$)", installed, re.MULTILINE):
        raise RuntimeError(f"The installed Android version code is not {code}.")


def verify_upgrade(args):
    old_code = version_code(args.sdk, args.baseline, args.package, args.baseline_version)
    new_code = version_code(args.sdk, args.candidate, args.package, args.candidate_version)
    if new_code <= old_code:
        raise RuntimeError("The candidate APK version code must exceed the baseline.")

    args.evidence.mkdir(parents=True, exist_ok=True)
    ui = AndroidUI(args.serial, args.evidence / "android-baseline-latest.xml")
    document = b"MarketWeft Android emulator workspace document\n"
    path = "files/upgrade-verification.txt"
    with TemporaryDirectory(prefix="marketweft-upgrade-") as directory:
        previous, candidate = sign_upgrade_pair(args.sdk, Path(directory), args.baseline, args.candidate)
        ui.adb("uninstall", args.package)
        ui.adb("install", previous, timeout=90)
        require_installed_version(ui, args.package, args.baseline_version, old_code)
        ui.adb("shell", "am", "start", "-W", "-n", f"{args.package}/{args.activity}")
        verify_import(ui, args.package, args.activity, args.fixture)
        ui.adb("shell", "run-as", args.package, "mkdir", "-p", "files")
        ui.adb("shell", "-T", f"run-as {args.package} sh -c 'cat > {path}'", input_data=document)

        ui.adb("shell", "am", "force-stop", args.package)
        ui.adb("install", "-r", candidate, timeout=90)
        require_installed_version(ui, args.package, args.candidate_version, new_code)
        if ui.adb("exec-out", "run-as", args.package, "cat", path) != document:
            raise RuntimeError("The Android upgrade changed or dropped the saved document.")
        ui.evidence = args.evidence / "android-upgraded-quote.xml"
        verify_reopened(ui, args.package, args.activity)
        airplane = ui.adb("shell", "settings", "get", "global", "airplane_mode_on").strip()
        wifi = ui.adb("shell", "settings", "get", "global", "wifi_on").strip()
        if airplane != b"1" or wifi not in (b"0", b"3"):
            raise RuntimeError(f"The Android upgrade must complete offline. Airplane mode={airplane!r}, Wi-Fi={wifi!r}.")
    print("Verified an in-place Android upgrade preserved the saved document and exact OHLCV offline.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial")
    parser.add_argument("package")
    parser.add_argument("activity")
    parser.add_argument("sdk", type=Path)
    parser.add_argument("fixture", type=Path)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("baseline_version")
    parser.add_argument("candidate", type=Path)
    parser.add_argument("candidate_version")
    verify_upgrade(parser.parse_args())
