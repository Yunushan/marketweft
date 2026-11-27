"""Check the Android package architecture and the installed WebView hierarchy."""

import argparse
import json
from pathlib import Path
import struct
from xml.etree import ElementTree
from zipfile import ZipFile

ELF_MACHINE = {"x86_64": 62, "arm64-v8a": 183}


def verify_apk(path, revision, abi="x86_64", page_size=None):
    binary = f"lib/{abi}/libmarketweft_desktop.so"
    with ZipFile(path) as apk:
        native = [name for name in apk.namelist() if name.startswith("lib/") and name.endswith(".so")]
        if native.count(binary) != 1 or any(not name.startswith(f"lib/{abi}/") for name in native):
            raise ValueError(f"The APK must contain the MarketWeft {abi} library and only that ABI.")
        for name in native:
            with apk.open(name) as library:
                header = library.read(64 if page_size else 20)
                if (len(header) < 20 or header[:6] != b"\x7fELF\x02\x01"
                        or struct.unpack_from("<H", header, 18)[0] != ELF_MACHINE[abi]):
                    raise ValueError(f"Unexpected ELF class or architecture in {name}.")
                if page_size:
                    verify_load_alignment(library, header, name, apk.getinfo(name).file_size, page_size)
        notices = "assets/marketweft-notices/"
        if apk.read(notices + "source-revision.txt") != (revision + "\n").encode("ascii"):
            raise ValueError("The APK does not carry the expected MarketWeft source revision.")
        if not json.loads(apk.read(notices + "cargo-sources.json")) or not apk.read(notices + "marketweft-0bsd.txt"):
            raise ValueError("The APK is missing its native dependency inventory or MarketWeft's license.")


def verify_load_alignment(library, header, name, length, page_size):
    if len(header) != 64:
        raise ValueError(f"Incomplete ELF header in {name}.")
    entry_offset, = struct.unpack_from("<Q", header, 32)
    entry_size, count = struct.unpack_from("<HH", header, 54)
    if entry_size != 56 or entry_offset < 64 or entry_offset + count * entry_size > length:
        raise ValueError(f"Invalid ELF program table in {name}.")
    library.seek(entry_offset)
    loadable = False
    for _ in range(count):
        kind, _, offset, address, _, _, _, alignment = struct.unpack("<II6Q", library.read(entry_size))
        if kind == 1:
            loadable = True
            if alignment < page_size or alignment % page_size or (address - offset) % page_size:
                raise ValueError(f"ELF load segment in {name} is not aligned to {page_size} bytes.")
    if not loadable:
        raise ValueError(f"No loadable ELF segment found in {name}.")


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
    apk_parser.add_argument("--page-size", type=int, choices=[16384])
    hierarchy_parser = subcommands.add_parser("hierarchy")
    hierarchy_parser.add_argument("path", type=Path)
    hierarchy_parser.add_argument("package")
    options = parser.parse_args()
    if options.command == "apk":
        verify_apk(options.path, options.revision, options.abi, options.page_size)
    else:
        verify_hierarchy(options.path, options.package)
