import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { TradingBotObserverV1 } from "../dist/index.js";

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

const account = {
  account_type: "Spot", mode: "Demo/Testnet", selected_exchange: "Example", connector_backend: "example",
  balance_currency: "USDT", total_balance: 0, available_balance: null,
  source: "fixture", generated_at: "2026-01-02T12:00:00.123456+00:00",
};
const portfolio = {
  account_type: "Spot", source: "fixture", generated_at: "", active_pnl: null, closed_pnl: null,
  active_margin: null, closed_margin: null, total_balance: null, available_balance: null,
  open_position_count: 0, closed_position_count: 1, positions: [],
};

test("preserves account provenance, fractional observation time, zero and unknown", async t => {
  const url = await listen(t, (req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/desk/api/v1/account");
    assert.equal(req.headers.authorization, "Bearer synthetic");
    res.end(JSON.stringify(account));
  });
  const observation = await new TradingBotObserverV1({baseUrl: url + "/desk", token: "synthetic"}).account();
  assert.equal(observation.observedAt, account.generated_at);
  assert.equal(observation.source, "fixture");
  assert.equal(observation.totalBalance, 0);
  assert.equal(observation.availableBalance, null);
});

test("preserves missing portfolio observation and validates position count", async t => {
  let body = portfolio;
  const url = await listen(t, (_req, res) => res.end(JSON.stringify(body)));
  const observer = new TradingBotObserverV1({baseUrl: url});
  assert.equal((await observer.portfolio()).observedAt, null);
  body = {...portfolio, open_position_count: 3};
  await assert.rejects(observer.portfolio(), /position count/);
});

test("malformed money, impossible dates and offset-free timestamps fail validation", async t => {
  let body;
  const url = await listen(t, (_req, res) => res.end(JSON.stringify(body)));
  const observer = new TradingBotObserverV1({baseUrl: url});
  for (const patch of [
    {total_balance: "101.0"}, {available_balance: true}, {generated_at: "2026-02-30T00:00:00Z"},
    {generated_at: "2026-01-01T00:00:00"}, {generated_at: "2026-01-02T24:00:00Z"},
  ]) {
    body = {...account, ...patch};
    await assert.rejects(observer.account(), TypeError);
  }
});

test("HTTP errors and invalid JSON omit upstream response contents", async t => {
  let status = 401;
  const url = await listen(t, (_req, res) => {
    res.writeHead(status);
    res.end("sensitive-response");
  });
  const observer = new TradingBotObserverV1({baseUrl: url});
  await assert.rejects(observer.account(), {message:"Trading-bot account request failed (HTTP 401)"});
  status = 200;
  await assert.rejects(observer.account(), {message:"Trading-bot returned invalid JSON for account"});
});

test("redirect is refused before a second request and timeout is enforced", async t => {
  let redirected = false;
  const url = await listen(t, (req, res) => {
    if (req.url.endsWith("/account")) {
      res.writeHead(302, {Location: "/elsewhere"});
      res.end();
    } else if (req.url.endsWith("/elsewhere")) {
      redirected = true;
      res.end();
    }
  });
  const observer = new TradingBotObserverV1({baseUrl: url, timeoutMs: 350});
  await assert.rejects(observer.account(), TypeError);
  assert.equal(redirected, false);
  await assert.rejects(observer.status(), {name:"TimeoutError"});
});

test("requires HTTPS off loopback and rejects ambiguous origins and invalid timeouts", () => {
  for (const baseUrl of ["http://other.example", "http://127.a.example", "https://u:p@example.com",
    "https://host.example/?key=x", "https://host.example/#fragment", "ftp://localhost", "bad-url"]) {
    assert.throws(() => new TradingBotObserverV1({baseUrl}));
  }
  for (const baseUrl of ["https://desk.example/proxy", "http://localhost", "http://[::1]", "http://127.2.3.4"]) {
    assert.doesNotThrow(() => new TradingBotObserverV1({baseUrl}));
  }
  assert.throws(() => new TradingBotObserverV1({baseUrl:"https://example.org", timeoutMs: -1}));
});
