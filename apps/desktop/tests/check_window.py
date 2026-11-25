"""Check the embedded MarketWeft webview through Linux AT-SPI."""
import re
import subprocess
import time

import pyatspi


def descendants(node, depth=0):
    yield node
    if depth < 15:
        for i in range(min(node.childCount, 128)):
            child = node.getChildAtIndex(i)
            if child is not None:
                yield from descendants(child, depth + 1)


def wait_for(find, description):
    until = time.monotonic() + 12
    while time.monotonic() < until:
        result = find(list(descendants(pyatspi.Registry.getDesktop(0))))
        if result is not None:
            return result
        time.sleep(0.25)
    raise RuntimeError("Timed out waiting for " + description)


def named(nodes, name):
    return next((node for node in nodes if node.name == name), None)


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


print("Chart:", wait_for(chart_and_watchlist, "the chart and watchlist"))
click(wait_for(lambda nodes: named(nodes, "Import CSV"), "the import button"))
wait_for(lambda nodes: named(nodes, "Import historical data"), "the import dialog")
click(wait_for(lambda nodes: named(nodes, "CSV format"), "the CSV format disclosure"))
byte_limit, bar_limit = wait_for(visible_limits, "the configured import limits")
assert int(byte_limit.replace(",", "")) > 0 and int(bar_limit.replace(",", "")) > 0
print("Displayed import limits:", byte_limit, "bytes and", bar_limit, "bars")
