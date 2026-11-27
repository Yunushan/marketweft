"""Check the Android package architecture and the installed WebView hierarchy."""

import argparse
import json
from pathlib import Path
import struct
from xml.etree import ElementTree
from zipfile import ZipFile

ELF_MACHINE = {"x86_64": 62, "arm64-v8a": 183}


def verify_apk(path, revision, abi="x86_64"):
    binary = f"lib/{abi}/libmarketweft_desktop.so"
    with ZipFile(path) as apk:
        native = [name for name in apk.namelist() if name.startswith("lib/") and name.endswith(".so")]
        if native.count(binary) != 1 or any(not name.startswith(f"lib/{abi}/") for name in native):
            raise ValueError(f"The APK must contain the MarketWeft {abi} library and only that ABI.")
        with apk.open(binary) as library:
            header = library.read(20)
        if (len(header) != 20 or header[:6] != b"\x7fELF\x02\x01"
                or struct.unpack_from("<H", header, 18)[0] != ELF_MACHINE[abi]):
            raise ValueError("Unexpected ELF class or architecture in the MarketWeft library.")
        notices = "assets/marketweft-notices/"
        if apk.read(notices + "source-revision.txt") != (revision + "\n").encode("ascii"):
            raise ValueError("The APK does not carry the expected MarketWeft source revision.")
        if not json.loads(apk.read(notices + "cargo-sources.json")) or not apk.read(notices + "marketweft-0bsd.txt"):
            raise ValueError("The APK is missing its native dependency inventory or MarketWeft's license.")


def verify_hierarchy(path, package):
    hierarchy = ElementTree.parse(path).getroot()
    for webview in hierarchy.iter("node"):
        if webview.get("class") != "android.webkit.WebView" or webview.get("package") != package:
            continue
        labels = {node.get(name, "") for node in webview.iter("node") for name in ("text", "content-desc")}
        if "Import CSV" in labels and any(label.startswith("NVDA interactive candlestick") for label in labels):
            return
    raise ValueError("The installed Android WebView did not show the import action and native terminal chart.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    apk_parser = subcommands.add_parser("apk")
    apk_parser.add_argument("path", type=Path)
    apk_parser.add_argument("revision")
    apk_parser.add_argument("--abi", choices=ELF_MACHINE, default="x86_64")
    hierarchy_parser = subcommands.add_parser("hierarchy")
    hierarchy_parser.add_argument("path", type=Path)
    hierarchy_parser.add_argument("package")
    options = parser.parse_args()
    if options.command == "apk":
        verify_apk(options.path, options.revision, options.abi)
    else:
        verify_hierarchy(options.path, options.package)
