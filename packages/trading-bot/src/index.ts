/** Versioned read-only projections of trading-bot's service API v1. */
type JsonObject = Record<string, unknown>;

function object(value: unknown, field: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Invalid trading-bot object: ${field}`);
  }
  return value as JsonObject;
}

function string(row: JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new TypeError(`Expected string: ${key}`);
  return value;
}

function bool(row: JsonObject, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw new TypeError(`Expected boolean: ${key}`);
  return value;
}

function decimal(row: JsonObject, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Expected finite number or null: ${key}`);
  }
  return value;
}

function count(row: JsonObject, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid count: ${key}`);
  }
  return value;
}

// Keep the original precision and offset. The empty string is upstream's
// explicit marker for an observation whose time has never been established.
function observationTime(row: JsonObject): string | null {
  const value = string(row, "generated_at");
  if (value === "") return null;
  const calendar = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!calendar || !Number.isFinite(Date.parse(value))) throw new TypeError("Invalid observation time");
  const [,year, month, day] = calendar;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (date.getUTCDate() !== Number(day)) throw new TypeError("Invalid observation date");
  return value;
}

function runtime(row: JsonObject) {
  const capabilities = object(row.capabilities, "capabilities");
  const plane = object(row.control_plane, "control_plane");
  return {
    serviceName: string(row, "service_name"),
    standaloneLifecycleSessions: bool(capabilities, "standalone_lifecycle_sessions"),
    standaloneTradingExecution: bool(capabilities, "standalone_trading_execution"),
    desktopTradingExecution: bool(capabilities, "desktop_trading_execution"),
    controlPlane: {
      mode: string(plane, "mode"),
      owner: string(plane, "owner"),
      scope: string(plane, "execution_scope"),
      startSupported: bool(plane, "start_supported"),
      stopSupported: bool(plane, "stop_supported"),
      tradingExecutionSupported: bool(plane, "trading_execution_supported"),
    },
  };
}

function status(row: JsonObject) {
  return {
    state: string(row, "state"),
    phase: string(row, "lifecycle_phase"),
    runtimeSource: string(row, "runtime_source"),
    engineCount: count(row, "active_engine_count"),
    mode: string(row, "mode"),
    accountType: string(row, "account_type"),
    exchange: string(row, "selected_exchange"),
    connectorHealth: string(row, "connector_health"),
    generatedAt: observationTime(row),
  };
}

function account(row: JsonObject) {
  return {
    type: string(row, "account_type"),
    mode: string(row, "mode"),
    exchange: string(row, "selected_exchange"),
    connectorBackend: string(row, "connector_backend"),
    currency: string(row, "balance_currency"),
    totalBalance: decimal(row, "total_balance"),
    availableBalance: decimal(row, "available_balance"),
    source: string(row, "source"),
    observedAt: observationTime(row),
  };
}

function position(value: unknown) {
  const row = object(value, "position");
  return {
    symbol: string(row, "symbol"),
    side: string(row, "side_key"),
    interval: string(row, "interval"),
    quantity: decimal(row, "quantity"),
    markPrice: decimal(row, "mark_price"),
    sizeUsdt: decimal(row, "size_usdt"),
    pnl: decimal(row, "pnl_value"),
  };
}

function portfolio(row: JsonObject) {
  if (!Array.isArray(row.positions)) throw new TypeError("Invalid positions array");
  const openCount = count(row, "open_position_count");
  if (openCount !== row.positions.length) throw new TypeError("Inconsistent open position count");
  return {
    accountType: string(row, "account_type"),
    openCount,
    closedCount: count(row, "closed_position_count"),
    positions: row.positions.map(position),
    activePnl: decimal(row, "active_pnl"),
    closedPnl: decimal(row, "closed_pnl"),
    activeMargin: decimal(row, "active_margin"),
    closedMargin: decimal(row, "closed_margin"),
    totalBalance: decimal(row, "total_balance"),
    availableBalance: decimal(row, "available_balance"),
    source: string(row, "source"),
    observedAt: observationTime(row),
  };
}

export type RuntimeDescriptor = ReturnType<typeof runtime>;
export type RuntimeStatus = ReturnType<typeof status>;
export type AccountSnapshot = ReturnType<typeof account>;
export type PortfolioSnapshot = ReturnType<typeof portfolio>;

export interface ObserverOptions {
  /** A trusted service origin, optionally including a reverse proxy path prefix. */
  baseUrl: string;
  /** Keep service tokens in process memory. Broker credentials are never required. */
  token?: string;
  timeoutMs?: number;
}

export class TradingBotObserverV1 {
  readonly #base: URL;
  readonly #token?: string;
  readonly #timeout: number;

  constructor({ baseUrl, token, timeoutMs = 10000 }: ObserverOptions) {
    const url = new URL(baseUrl);
    const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127\./.test(url.hostname) && /^\d+(?:\.\d+){3}$/.test(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      throw new TypeError("Use HTTPS or loopback HTTP for the trading-bot service");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new TypeError("Service URL cannot contain credentials, query, or fragment");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
      throw new RangeError("Invalid request timeout");
    }
    url.pathname = url.pathname.replace(/\/*$/, "/");
    this.#base = url;
    this.#token = token;
    this.#timeout = timeoutMs;
  }

  async #read(endpoint: "runtime" | "status" | "account" | "portfolio"): Promise<JsonObject> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
    const response = await fetch(new URL(`api/v1/${endpoint}`, this.#base), {
      method: "GET", headers, redirect: "error", cache: "no-store", credentials: "omit",
      referrerPolicy: "no-referrer", signal: AbortSignal.timeout(this.#timeout),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Trading-bot ${endpoint} request failed (HTTP ${response.status})`);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new TypeError(`Trading-bot returned invalid JSON for ${endpoint}`);
    }
    return object(data, endpoint);
  }

  async runtime(): Promise<RuntimeDescriptor> { return runtime(await this.#read("runtime")); }
  async status(): Promise<RuntimeStatus> { return status(await this.#read("status")); }
  async account(): Promise<AccountSnapshot> { return account(await this.#read("account")); }
  async portfolio(): Promise<PortfolioSnapshot> { return portfolio(await this.#read("portfolio")); }
}
