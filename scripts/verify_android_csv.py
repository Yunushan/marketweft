"""Drive native Android CSV selection in the installed MarketWeft application."""

import argparse
from pathlib import Path
import re
import subprocess
from time import monotonic, sleep
from xml.etree import ElementTree

REMOTE_HIERARCHY = "/sdcard/marketweft-csv-hierarchy.xml"
REMOTE_FIXTURE = "/sdcard/Download/marketweft-native.csv"
SYMBOL = "ANDROIDCSV"
QUOTE = f"{SYMBOL} OHLCV. Open 27.00, high 30.00, low 26.00, close 29.00, volume 800"


def labels(node):
    return {node.get("text", ""), node.get("content-desc", "")}


def is_document_picker(node):
    return node.get("package", "").endswith(".documentsui")


class AndroidElementMissing(RuntimeError):
    pass


class AndroidUI:
    def __init__(self, serial, evidence):
        self.serial = serial
        self.evidence = evidence

    def adb(self, *args):
        result = subprocess.run(["adb", "-s", self.serial, *map(str, args)], check=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        return result.stdout

    def find(self, description, matches, wait=40):
        deadline = monotonic() + wait
        while monotonic() < deadline:
            try:
                self.adb("shell", "uiautomator", "dump", REMOTE_HIERARCHY)
                data = self.adb("exec-out", "cat", REMOTE_HIERARCHY)
                tree = ElementTree.fromstring(data)
            except (ElementTree.ParseError, subprocess.SubprocessError):
                sleep(1)
                continue
            self.evidence.write_bytes(data)
            for node in tree.iter("node"):
                if node.get("enabled") == "true" and matches(node):
                    return node
            sleep(1)
        raise AndroidElementMissing(f"Could not find {description}. Last hierarchy: {self.evidence}")

    def tap(self, element, below_center=False):
        bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", element.get("bounds", ""))
        if not bounds:
            raise ValueError("The selected Android control has no screen bounds.")
        left, top, right, bottom = map(int, bounds.groups())
        if right <= left or bottom <= top:
            raise ValueError("The selected Android control is outside the screen.")
        y = top + (bottom - top) * 3 // 4 if below_center else (top + bottom) // 2
        self.adb("shell", "input", "tap", (left + right) // 2, y)


def verify_import(ui, package, activity, fixture):
    def app_label(label):
        return lambda node: node.get("package") == package and label in labels(node)

    ui.adb("shell", "mkdir", "-p", "/sdcard/Download")
    ui.adb("push", fixture.resolve(strict=True), REMOTE_FIXTURE)
    ui.adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
           "-d", f"file://{REMOTE_FIXTURE}")

    def symbol_group_matches(node):
        return (
            node.get("package") == package and any("Symbol" in labels(child) for child in node)
            and any(child.get("class") == "android.widget.EditText" for child in node)
        )

    # The top edge of the WebView can sit behind the Android status bar.
    ui.tap(ui.find("the terminal CSV action", app_label("Import CSV")), below_center=True)
    try:
        symbol_group = ui.find("the listing symbol field group", symbol_group_matches, wait=8)
    except AndroidElementMissing:
        ui.tap(ui.find("the still-visible terminal CSV action", app_label("Import CSV")), below_center=True)
        symbol_group = ui.find("the listing symbol field group after reopening import", symbol_group_matches)
    symbol = next(child for child in symbol_group if child.get("class") == "android.widget.EditText")
    ui.tap(symbol)
    ui.adb("shell", "input", "text", SYMBOL)
    ui.find("the typed listing symbol", app_label(SYMBOL))
    if b"mInputShown=true" in ui.adb("shell", "dumpsys", "input_method"):
        ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    ui.tap(ui.find("the historical CSV field", lambda node: (
        node.get("package") == package and any("Historical CSV file" in label for label in labels(node))
    )))
    destination = ui.find("the native document picker", lambda node: (
        is_document_picker(node) and bool(labels(node).intersection({"Show roots", "Downloads"}))
    ))
    if "Show roots" in labels(destination):
        ui.tap(destination)
        destination = ui.find("the Downloads root", lambda node: (
            is_document_picker(node) and "Downloads" in labels(node)
        ))
    ui.tap(destination)
    ui.tap(ui.find("the authorized CSV in Downloads", lambda node: (
        is_document_picker(node) and Path(REMOTE_FIXTURE).name in labels(node)
    )))
    ui.tap(ui.find("the visible CSV submit button", app_label("Import to watchlist")))
    ui.find("the imported chart's exact OHLCV", app_label(QUOTE))
    ui.evidence.with_name("android-imported-quote.xml").write_bytes(ui.evidence.read_bytes())

    ui.adb("shell", "am", "force-stop", package)
    launched = ui.adb("shell", "am", "start", "-W", "-n", f"{package}/{activity}")
    if b"Status: ok" not in launched:
        raise RuntimeError("The installed Android application did not reopen.")
    ui.find("the restored chart's exact OHLCV", app_label(QUOTE))
    ui.evidence.with_name("android-restored-quote.xml").write_bytes(ui.evidence.read_bytes())
    print("Verified native Android CSV selection and exact OHLCV after reopening the installed app.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial")
    parser.add_argument("package")
    parser.add_argument("activity")
    parser.add_argument("fixture", type=Path)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    verify_import(AndroidUI(args.serial, args.evidence), args.package, args.activity, args.fixture)
