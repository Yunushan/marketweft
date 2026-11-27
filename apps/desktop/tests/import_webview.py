"""Exercise CSV import in the built desktop binary using the native WebDriver."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener


class WebView:
    def __init__(self, port):
        self.origin = f"http://127.0.0.1:{port}"
        self.http = build_opener(ProxyHandler({}))
        self.session = None

    def call(self, method, path, body=None, timeout=15):
        request = Request(
            self.origin + path, data=None if body is None else json.dumps(body).encode("utf-8"),
            method=method, headers={"Content-Type": "application/json"},
        )
        try:
            with self.http.open(request, timeout=timeout) as result:
                return json.load(result)["value"]
        except HTTPError as error:
            detail = json.load(error)["value"]
            raise RuntimeError(detail.get("message", str(detail))) from error

    def execute(self, script):
        return self.call("POST", self.session + "/execute/sync", {"script": script, "args": []})

    def element(self, selector):
        value = self.call("POST", self.session + "/element", {"using": "css selector", "value": selector})
        return "/element/" + value["element-6066-11e4-a52e-4f735466cecf"]

    def send(self, element, text):
        self.call("POST", self.session + element + "/value", {"text": text, "value": list(text)})

    def click(self, element):
        self.call("POST", self.session + element + "/click", {})


def wait_for(check, description):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except (URLError, ConnectionError):
            pass
        time.sleep(0.15)
    raise RuntimeError("Timed out waiting for " + description)


def import_fixture(browser, fixture):
    browser.execute('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Import CSV").click()')
    wait_for(lambda: browser.execute("return Boolean(document.querySelector('dialog[open] input[type=file]'))"),
             "the local CSV dialog")
    browser.send(browser.element('dialog[open] input[placeholder="e.g. ABC"]'), "NATIVESMOKE")
    browser.send(browser.element('dialog[open] input[type=file]'), str(fixture))
    assert browser.execute("return document.querySelector('dialog[open] input[type=file]').files[0].name") == fixture.name
    browser.click(browser.element("dialog[open] button[type=submit], dialog[open] .dialog-actions button.primary"))
    chart = wait_for(lambda: browser.execute(
        "return [...document.querySelectorAll('canvas')].map(c => c.getAttribute('aria-label') || '')"
        ".find(label => label.startsWith('NATIVESMOKE interactive') && label.includes('candlestick'));"
    ), "the imported native chart")
    print("Imported chart:", chart)


def read_quote(browser, canvas_selector):
    return browser.execute("const selector = " + json.dumps(canvas_selector) + ";" + """
        const chart = document.querySelector(selector);
        if (!chart) return null;
        const cells = [...chart.closest('section.plot').querySelectorAll('.ohlc > span')];
        const quote = cells.flatMap(cell => {
            const label = cell.querySelector('small')?.textContent;
            if (!['O', 'H', 'L', 'C', 'Vol'].includes(label)) return [];
            return [[label, Number(cell.textContent.slice(label.length).trim().replaceAll(',', ''))]];
        });
        const values = Object.fromEntries(quote);
        return Object.keys(values).length === 5 ? values : null;
    """)


def verify_saved_workspace(browser):
    wait_for(lambda: browser.execute("""
        const selector = document.querySelector('select[aria-label="Primary chart type"]');
        return selector?.value === 'line' && !selector.disabled;
    """), "the saved close-line preference")
    quote = verify_quote(browser, "close line")
    print("Verified saved close-line preference and exact imported OHLCV:", quote)


def verify_quote(browser, chart_type):
    selector = f'canvas[aria-label^="NATIVESMOKE interactive {chart_type}"]'
    quote = wait_for(lambda: read_quote(browser, selector), "the exact imported chart quote")
    assert quote == {"O": 27, "H": 30, "L": 26, "C": 29, "Vol": 800}, quote
    return quote


def verify(browser, binary, fixture, phase, edge_profile=None):
    wait_for(lambda: browser.call("GET", "/status").get("ready"), "the native WebDriver")
    capabilities = {
        "webkitgtk:browserOptions": {"binary": str(binary), "args": []},
    }
    if edge_profile is not None:
        capabilities = {
            "browserName": "webview2",
            "ms:edgeOptions": {"binary": str(binary), "webviewOptions": {"userDataFolder": str(edge_profile)}},
        }
    response = browser.call("POST", "/session", {"capabilities": {"alwaysMatch": capabilities}}, timeout=60)
    browser.session = "/session/" + response["sessionId"]
    try:
        wait_for(lambda: browser.execute("return Boolean(document.querySelector('canvas'))"),
                 "the native starting chart")
        if edge_profile is not None:
            origin = urlsplit(browser.execute("return window.location.href"))
            assert (origin.scheme, origin.hostname) in {("http", "tauri.localhost"), ("https", "tauri.localhost")}, origin
            version = response["capabilities"]["browserVersion"]
            assert version, "WebView2 did not report a runtime version."
            print("Native WebView2 runtime:", version)
        if phase != "reopen":
            import_fixture(browser, fixture)
            print("Verified exact imported candlestick OHLCV:", verify_quote(browser, "candlestick"))
        if phase == "seed":
            browser.execute("""
                const kind = document.querySelector('select[aria-label="Primary chart type"]');
                kind.value = 'line';
                kind.dispatchEvent(new Event('change', {bubbles: true}));
            """)
        if phase != "import":
            verify_saved_workspace(browser)
    finally:
        browser.call("DELETE", browser.session)


def run(binary, workspace=None, phase='import', executable=None):
    binary = binary.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="marketweft-webview-") as directory:
        root = Path(directory)
        profile = root if workspace is None else workspace.resolve(strict=True)
        fixture = root / "native-verification.csv"
        fixture.write_bytes((Path(__file__).with_name("fixtures") / fixture.name).read_bytes())
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        edge_profile = None
        if os.name == "nt":
            edge_profile = profile / "webview2"
            env = dict(os.environ, WEBVIEW2_USER_DATA_FOLDER=str(edge_profile))
            driver_root = Path(env["EDGEWEBDRIVER"]) if "EDGEWEBDRIVER" in env else None
            default = str(driver_root / "msedgedriver.exe") if driver_root else "msedgedriver.exe"
            command = [executable or default, "--allowed-ips=127.0.0.1", f"--port={port}"]
        else:
            runtime = root / "runtime"
            runtime.mkdir(mode=0o700)
            env = dict(
                os.environ, GDK_BACKEND="x11", TAURI_WEBVIEW_AUTOMATION="true",
                WEBKIT_DISABLE_DMABUF_RENDERER="1", XDG_RUNTIME_DIR=str(runtime),
                XDG_CONFIG_HOME=str(profile / "config"), XDG_DATA_HOME=str(profile / "data"),
                XDG_CACHE_HOME=str(profile / "cache"),
            )
            command = [executable or "WebKitWebDriver", "--host=127.0.0.1", f"--port={port}"]
        with subprocess.Popen(command, env=env) as driver:
            try:
                verify(WebView(port), binary, fixture, phase, edge_profile)
            finally:
                driver.terminate()
                try:
                    driver.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    driver.kill()
                    driver.wait(timeout=5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--phase", choices=("import", "seed", "reopen"), default="import")
    parser.add_argument("--driver", help="path to the native WebDriver executable")
    args = parser.parse_args()
    if args.phase != "import" and args.workspace is None:
        parser.error("--workspace is required to seed or reopen a persistent profile")
    run(args.binary, args.workspace, args.phase, args.driver)
