"""Check the embedded MarketWeft webview through Linux AT-SPI."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

import pyatspi
from gi.repository import GLib


def descendants(node, depth=0):
    try:
        if node is None or node.getState().contains(pyatspi.STATE_DEFUNCT):
            return
        count = min(node.childCount, 128) if depth < 15 else 0
    except GLib.Error:
        # Startup helpers can disappear between querying the desktop and reading a child.
        return
    yield node
    for i in range(count):
        try:
            child = node.getChildAtIndex(i)
        except GLib.Error:
            continue
        yield from descendants(child, depth + 1)


def wait_for(find, description):
    until = time.monotonic() + 12
    last_error = None
    while time.monotonic() < until:
        try:
            result = find(list(descendants(pyatspi.Registry.getDesktop(0))))
            if result is not None:
                return result
        except GLib.Error as error:
            # WebKit can replace an accessibility object after enumeration.
            last_error = error
        time.sleep(0.25)
    visible = []
    for node in descendants(pyatspi.Registry.getDesktop(0)):
        try:
            role = node.getRoleName()
            if role in {"entry", "text", "label", "dialog", "push button", "file chooser"}:
                if node.getState().contains(pyatspi.STATE_SHOWING):
                    visible.append((role, node.name))
        except GLib.Error:
            continue
    print("Visible controls:", visible[:80], flush=True)
    raise RuntimeError("Timed out waiting for " + description) from last_error


def named(nodes, name):
    return next((node for node in nodes if node.name == name), None)


def control(nodes, role, label):
    return next((node for node in nodes if node.getRoleName() == role
                 and (node.name == label or node.name.startswith(label + " "))
                 and node.getState().contains(pyatspi.STATE_SHOWING)), None)


def click(node):
    # Real pointer input also covers WebKit controls without an AT-SPI action.
    bounds = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    if bounds.width <= 0 or bounds.height <= 0:
        raise RuntimeError("Control has no clickable bounds: " + node.name)
    x, y = bounds.x + bounds.width // 2, bounds.y + bounds.height // 2
    subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "1"], check=True)


def chart_and_watchlist(nodes):
    chart = next((node for node in nodes if node.getRoleName() == "canvas"
                  and "candlestick" in node.name), None)
    if chart is not None and named(nodes, "Watchlist") is not None:
        return chart.name
    return None


def visible_limits(nodes):
    for node in nodes:
        if not node.getState().contains(pyatspi.STATE_SHOWING):
            continue
        try:
            text = node.queryText().getText(0, -1)
        except NotImplementedError:
            continue
        limits = re.search(r"Maximum per file:\s*([\d,]+) bytes\s+and ([\d,]+) bars", text)
        if limits:
            return limits.groups()
    return None


def keyboard(*keys):
    subprocess.run(["xdotool", "key", "--clearmodifiers", *keys], check=True)


def type_text(text):
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--", text], check=True)


def visible_file_chooser(nodes):
    names = {"open", "open file", "select file", "choose file", "file upload"}
    return next((node for node in nodes if node.getState().contains(pyatspi.STATE_SHOWING)
                 and node.getRoleName() in {"file chooser", "dialog"}
                 and (node.getRoleName() == "file chooser" or node.name.casefold() in names)), None)


def import_csv():
    symbol = wait_for(lambda nodes: control(nodes, "entry", "Symbol"), "the symbol field")
    click(symbol)
    keyboard("ctrl+a")
    type_text("NATIVESMOKE")

    with tempfile.TemporaryDirectory(prefix="marketweft-native-import-") as folder:
        fixture = Path(folder) / "native-import.csv"
        fixture.write_text(
            "time,open,high,low,close,volume\n"
            "2025-06-02,25,28,24,27,500\n"
            "2025-06-03,27,30,26,29,800\n",
            encoding="utf-8",
        )
        click(wait_for(lambda nodes: control(nodes, "push button", "Historical CSV"), "the CSV file input"))
        wait_for(visible_file_chooser, "the native file chooser")
        keyboard("ctrl+l")
        type_text(str(fixture))
        keyboard("Return")
        wait_for(lambda nodes: True if visible_file_chooser(nodes) is None else None,
                 "the native file chooser to close")
        click(wait_for(lambda nodes: named(nodes, "Import to watchlist"), "the import submit button"))
        imported = wait_for(
            lambda nodes: next((node.name for node in nodes if node.getRoleName() == "canvas"
                                and "NATIVESMOKE" in node.name), None),
            "the imported chart",
        )
        print("Imported chart:", imported)


print("Chart:", wait_for(chart_and_watchlist, "the chart and watchlist"))
click(wait_for(lambda nodes: named(nodes, "Import CSV"), "the import button"))
wait_for(lambda nodes: named(nodes, "Import historical data"), "the import dialog")
click(wait_for(lambda nodes: named(nodes, "CSV format"), "the CSV format disclosure"))
byte_limit, bar_limit = wait_for(visible_limits, "the configured import limits")
assert int(byte_limit.replace(",", "")) > 0 and int(bar_limit.replace(",", "")) > 0
print("Displayed import limits:", byte_limit, "bytes and", bar_limit, "bars")

if len(sys.argv) > 1 and sys.argv[1] == "--import-csv":
    click(wait_for(lambda nodes: named(nodes, "CSV format"), "the CSV format disclosure"))
    import_csv()
