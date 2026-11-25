import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { TradingBotObserverV1 } from "../dist/index.js";

const repo = process.env.MARKETWEFT_UPSTREAM_DIR;
if (!repo) throw new Error("Set MARKETWEFT_UPSTREAM_DIR to the pinned trading-bot checkout");
const python = process.env.MARKETWEFT_UPSTREAM_PYTHON || "python";
const serverScript = fileURLToPath(new URL("./upstream-server.py", import.meta.url));

for (const mode of ["empty", "observed"]) {
  const profile = await mkdtemp(join(tmpdir(), "marketweft-observe-"));
  const token = randomUUID();
  const env = { HOME: profile, USERPROFILE: profile, LOCALAPPDATA: profile, APPDATA: profile,
    XDG_CONFIG_HOME: profile, XDG_DATA_HOME: profile, TMP: profile, TEMP: profile, TMPDIR: profile,
    BOT_SERVICE_API_READ_ONLY: "1", BOT_SERVICE_API_TOKEN: token };
  for (const key of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "COMSPEC", "LD_LIBRARY_PATH"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const child = spawn(python, ["-I", "-B", serverScript, resolve(repo), mode],
    { cwd: profile, env, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  const done = once(child, "close");
  const lines = createInterface({input: child.stdout});
  try {
    const [line] = await Promise.race([
      once(lines, "line", {signal: AbortSignal.timeout(30000)}),
      done.then(() => { throw new Error("Upstream service exited before initialization"); }),
    ]);
    assert.match(line, /^\d+$/);
    const baseUrl = `http://127.0.0.1:${line}`;
    const client = new TradingBotObserverV1({baseUrl, token});
    const [runtime, status, account, portfolio] = await Promise.all([
      client.runtime(), client.status(), client.account(), client.portfolio(),
    ]);
    assert.equal(runtime.serviceName, "trading-bot-service");
    assert.equal(runtime.standaloneTradingExecution, false);
    assert.equal(runtime.controlPlane.tradingExecutionSupported, false);
    assert.equal(runtime.controlPlane.scope, "intent-only");
    assert.equal(status.engineCount, 0);
    if (mode === "empty") {
      const ready = await fetch(baseUrl + "/readyz", {signal: AbortSignal.timeout(10000)});
      assert.equal(ready.status, 200);
      const readiness = await ready.json();
      assert.equal(readiness.observation_scope, "service-health-only");
      assert.equal(readiness.trading_observation_supported, false);
      assert.equal(account.observedAt, null);
      assert.equal(account.totalBalance, null);
      assert.equal(portfolio.observedAt, null);
      assert.deepEqual(portfolio.positions, []);
    } else {
      assert.equal(account.totalBalance, 123.5);
      assert.equal(account.availableBalance, 80);
      assert.equal(account.source, "synthetic-fixture");
      assert.equal(Date.parse(account.observedAt), Date.parse("2025-02-03T12:30:00Z"));
      assert.equal(Date.parse(portfolio.observedAt), Date.parse(account.observedAt));
      assert.equal(portfolio.positions[0].symbol, "SYNTH");
      assert.equal(portfolio.positions[0].quantity, 2.5);
      assert.equal(portfolio.positions[0].markPrice, 10);
      assert.equal(portfolio.activePnl, 1.25);
    }
    console.log(`PASS upstream read-only API: ${mode}`);
  } finally {
    lines.close();
    child.kill();
    await done;
    await rm(profile, {recursive:true, force:true});
  }
}
