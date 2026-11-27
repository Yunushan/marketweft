"""Exercise CSV import in the shipped binary using the loopback WebKit WebDriver."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
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


def verify(browser, binary, fixture):
    wait_for(lambda: browser.call("GET", "/status").get("ready"), "the native WebDriver")
    response = browser.call("POST", "/session", {"capabilities": {"alwaysMatch": {
        "webkitgtk:browserOptions": {"binary": str(binary), "args": []},
    }}})
    browser.session = "/session/" + response["sessionId"]
    try:
        wait_for(lambda: browser.execute("return Boolean(document.querySelector('canvas'))"),
                 "the native starting chart")
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
    finally:
        browser.call("DELETE", browser.session)


def run(binary):
    binary = binary.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="marketweft-webview-") as directory:
        root = Path(directory)
        runtime = root / "runtime"
        runtime.mkdir(mode=0o700)
        fixture = root / "native-verification.csv"
        fixture.write_text(
            "time,open,high,low,close,volume\n"
            "2025-06-02,25,28,24,27,500\n"
            "2025-06-03,27,30,26,29,800\n",
            encoding="utf-8",
        )
        env = dict(
            os.environ, GDK_BACKEND="x11", TAURI_WEBVIEW_AUTOMATION="true",
            WEBKIT_DISABLE_DMABUF_RENDERER="1", XDG_RUNTIME_DIR=str(runtime),
            XDG_CONFIG_HOME=str(root / "config"), XDG_DATA_HOME=str(root / "data"),
            XDG_CACHE_HOME=str(root / "cache"),
        )
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        with subprocess.Popen(["WebKitWebDriver", "--host=127.0.0.1", f"--port={port}"],
                              env=env) as driver:
            try:
                verify(WebView(port), binary, fixture)
            finally:
                driver.terminate()
                try:
                    driver.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    driver.kill()
                    driver.wait(timeout=5)


if __name__ == "__main__":
    run(Path(sys.argv[1]))
