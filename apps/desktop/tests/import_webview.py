"""Exercise CSV import in the shipped binary using the loopback WebKit WebDriver."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener


class WebView:
    def __init__(self, port):
        self.origin = f"http://127.0.0.1:{port}"
        self.http = build_opener(ProxyHandler({}))
        self.session = None

    def call(self, method, path, body=None):
        request = Request(
            self.origin + path, data=None if body is None else json.dumps(body).encode("utf-8"),
            method=method, headers={"Content-Type": "application/json"},
        )
        try:
            with self.http.open(request, timeout=15) as result:
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


def verify_saved_workspace(browser):
    workspace = wait_for(lambda: browser.execute("""
        const chart = document.querySelector('canvas[aria-label^="NATIVESMOKE interactive close line"]');
        const selector = document.querySelector('select[aria-label="Primary chart type"]');
        if (!chart || selector?.value !== 'line' || selector.disabled) return null;
        const quote = [...chart.closest('section.plot').querySelectorAll('.ohlc > span')]
            .filter(cell => ['O', 'H', 'L', 'C', 'Vol'].includes(cell.querySelector('small')?.textContent));
        return Object.fromEntries(quote.map(cell => {
            const label = cell.querySelector('small')?.textContent;
            return [label, Number(cell.textContent.slice(label?.length).trim().replaceAll(',', ''))];
        }));
    """), "the saved close-line chart and its original quote")
    assert workspace == {"O": 27, "H": 30, "L": 26, "C": 29, "Vol": 800}, workspace
    print("Verified saved close-line preference and exact imported OHLCV:", workspace)


def verify(browser, binary, fixture, phase):
    wait_for(lambda: browser.call("GET", "/status").get("ready"), "the native WebDriver")
    response = browser.call("POST", "/session", {"capabilities": {"alwaysMatch": {
        "webkitgtk:browserOptions": {"binary": str(binary), "args": []},
    }}})
    browser.session = "/session/" + response["sessionId"]
    try:
        wait_for(lambda: browser.execute("return Boolean(document.querySelector('canvas'))"),
                 "the native starting chart")
        if phase != "reopen":
            import_fixture(browser, fixture)
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


def run(binary, workspace=None, phase='import'):
    binary = binary.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="marketweft-webview-") as directory:
        root = Path(directory)
        profile = root if workspace is None else workspace.resolve(strict=True)
        runtime = root / "runtime"
        runtime.mkdir(mode=0o700)
        fixture = root / "native-verification.csv"
        fixture.write_bytes((Path(__file__).with_name("fixtures") / fixture.name).read_bytes())
        env = dict(
            os.environ, GDK_BACKEND="x11", TAURI_WEBVIEW_AUTOMATION="true",
            WEBKIT_DISABLE_DMABUF_RENDERER="1", XDG_RUNTIME_DIR=str(runtime),
            XDG_CONFIG_HOME=str(profile / "config"), XDG_DATA_HOME=str(profile / "data"),
            XDG_CACHE_HOME=str(profile / "cache"),
        )
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        with subprocess.Popen(["WebKitWebDriver", "--host=127.0.0.1", f"--port={port}"],
                              env=env) as driver:
            try:
                verify(WebView(port), binary, fixture, phase)
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
    args = parser.parse_args()
    if args.phase != "import" and args.workspace is None:
        parser.error("--workspace is required to seed or reopen a persistent profile")
    run(args.binary, args.workspace, args.phase)
