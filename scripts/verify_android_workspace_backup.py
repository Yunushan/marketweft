"""Verify an Android workspace backup through the system picker and a fresh install."""

import argparse
import json
from pathlib import Path
import re

from verify_android_csv import (
    AndroidUI, QUOTE, SYMBOL, is_document_picker, labels, select_downloads, verify_reopened,
)


def verify_backup(args):
    args.evidence.mkdir(parents=True, exist_ok=True)
    ui = AndroidUI(args.serial, args.evidence / "android-backup-latest.xml")

    def app_label(label):
        return lambda node: node.get("package") == args.package and label in labels(node)

    def find_exports():
        return [name for name in ui.adb("shell", "ls", "/sdcard/Download").decode().splitlines()
                if re.fullmatch(r"marketweft-workspace-\d{4}-\d{2}-\d{2}\.marketweft\.json", name)]

    def open_backup():
        ui.tap(ui.find("the workspace backup action", app_label("Workspace backup")), below_center=True)

    def export_backup():
        ui.tap(ui.find("the workspace export action", app_label("Export workspace")))
        ui.find("the Android save picker", lambda node: is_document_picker(node))

    ui.find("the exact imported workspace chart", app_label(QUOTE))
    open_backup()
    export_backup()
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    ui.find("the available workspace export after cancellation", app_label("Export workspace"))
    if find_exports():
        raise RuntimeError("Cancelling the Android save picker must leave Downloads unchanged.")

    export_backup()
    select_downloads(ui)
    save = ui.find("the Android picker Save button", lambda node: (
        is_document_picker(node) and any(label.lower() == "save" for label in labels(node))
    ))
    ui.tap(save)
    ui.find("the available workspace export after saving", app_label("Export workspace"))
    names = find_exports()
    if len(names) != 1:
        raise RuntimeError("Expected one exported workspace backup in Downloads.")
    filename, = names
    exported = ui.adb("exec-out", "cat", f"/sdcard/Download/{filename}")
    backup = json.loads(exported)
    manifest = backup["manifest"]
    if (backup["format"] != "marketweft-workspace" or manifest["seriesCount"] != 1 or manifest["barCount"] != 2
            or manifest["preferences"]["selected"] != f"LOCAL:{SYMBOL}"
            or manifest["series"][0]["csv"].encode() != args.fixture.read_bytes()):
        raise ValueError("The Android backup does not carry the exact fixture and selected listing.")
    (args.evidence / "android-exported-workspace.marketweft.json").write_bytes(exported)

    ui.adb("uninstall", args.package)
    ui.adb("install", args.apk, timeout=120)
    launch = ui.adb("shell", "am", "start", "-W", "-n", f"{args.package}/{args.activity}")
    if b"Status: ok" not in launch:
        raise RuntimeError("The clean Android installation did not launch.")
    ui.find("the fresh installation's sample chart", lambda node: (
        node.get("package") == args.package and any(label.startswith("NVDA interactive candlestick") for label in labels(node))
    ))
    open_backup()
    ui.tap(ui.find("the workspace backup input", lambda node: (
        node.get("package") == args.package and any(label.startswith("Backup file") for label in labels(node))
    )))
    select_downloads(ui)
    ui.tap(ui.find("the exported backup in Downloads", lambda node: is_document_picker(node) and filename in labels(node)))
    restore = ui.find("the enabled workspace restore action", app_label("Restore workspace"))
    ui.tap(restore)
    ui.find("the exact restored workspace chart", app_label(QUOTE))
    ui.evidence = args.evidence / "android-backup-restored-quote.xml"
    verify_reopened(ui, args.package, args.activity)
    if ui.adb("exec-out", "cat", f"/sdcard/Download/{filename}") != exported:
        raise RuntimeError("The workspace backup changed after restoration.")
    print("Verified Android backup cancellation, native export, exact fresh-install restore and saved OHLCV.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial")
    parser.add_argument("package")
    parser.add_argument("activity")
    parser.add_argument("apk", type=Path)
    parser.add_argument("fixture", type=Path)
    parser.add_argument("evidence", type=Path)
    verify_backup(parser.parse_args())
