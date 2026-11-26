"""Bounded local MCP access to MarketWeft formula evaluation."""

import argparse
import json
from pathlib import Path
import sys
from typing import BinaryIO

from . import FormulaFunction, ResearchEngine, ResearchError


PROTOCOL_VERSION = "2025-11-25"
SERVER_VERSION = "0.2.0"
MAX_FRAME_BYTES = 16 * 1024 * 1024
MAX_ROWS = 1_000
MAX_I64 = (1 << 63) - 1
MIN_I64 = -(1 << 63)
TOOL_NAME = "evaluate_historical_formula"
INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "formula": {"type": "string", "minLength": 1, "maxLength": 2048},
        "history_csv": {"type": "string", "minLength": 1, "maxLength": 8 * 1024 * 1024},
        "observed_through": {"type": "integer", "minimum": MIN_I64, "maximum": MAX_I64},
        "offset": {"type": "integer", "minimum": 0, "maximum": 100_000, "default": 0},
        "limit": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS, "default": 200},
        "functions": {
            "type": "array", "maxItems": 16,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,31}$"},
                    "parameters": {
                        "type": "array", "minItems": 1, "maxItems": 4,
                        "items": {"type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,31}$"},
                    },
                    "body": {"type": "string", "minLength": 1, "maxLength": 2048},
                },
                "required": ["name", "parameters", "body"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["formula", "history_csv"],
    "additionalProperties": False,
}
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "language_version": {"type": "integer", "minimum": 1},
        "total_rows": {"type": "integer", "minimum": 0, "maximum": 100_000},
        "offset": {"type": "integer", "minimum": 0, "maximum": 100_000},
        "next_offset": {"type": ["integer", "null"], "minimum": 0, "maximum": 100_000},
        "rows": {
            "type": "array", "maxItems": MAX_ROWS,
            "items": {
                "type": "object",
                "properties": {
                    "observed_at": {"type": "integer"},
                    "value_ticks": {"type": ["string", "null"], "pattern": "^-?[0-9]+$"},
                },
                "required": ["observed_at", "value_ticks"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["language_version", "total_rows", "offset", "next_offset", "rows"],
    "additionalProperties": False,
}
TOOL = {
    "name": TOOL_NAME,
    "description": "Evaluate a MarketWeft formula on supplied historical OHLCV CSV and return exact millionths at an optional observed cutoff. Reuse the same inputs with next_offset to retrieve another page.",
    "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False, "idempotentHint": True},
    "inputSchema": INPUT_SCHEMA,
    "outputSchema": OUTPUT_SCHEMA,
}


class RequestError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def _error(request_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _text(value: str) -> list[dict]:
    return [{"type": "text", "text": value}]


def _invalid_number(value: str):
    raise ValueError(f"Invalid JSON number {value}.")


def _integer(arguments: dict, field: str, default: int, minimum: int, maximum: int) -> int:
    value = arguments.get(field, default)
    if type(value) is not int or not minimum <= value <= maximum:
        raise RequestError(-32602, f"Supply {field} as an integer in the supported range.")
    return value


def _functions(definitions) -> tuple[FormulaFunction, ...]:
    if not isinstance(definitions, list) or len(definitions) > 16:
        raise RequestError(-32602, "Supply an array of up to 16 function definitions.")
    functions = []
    for definition in definitions:
        if not isinstance(definition, dict) or set(definition) != {"name", "parameters", "body"}:
            raise RequestError(-32602, "Each function needs a name, parameters and a body.")
        name, parameters, body = (definition[field] for field in ("name", "parameters", "body"))
        if (not isinstance(name, str) or not isinstance(body, str) or not body or
                not isinstance(parameters, list) or not all(isinstance(value, str) for value in parameters)):
            raise RequestError(-32602, "Invalid formula function definition.")
        functions.append(FormulaFunction(name, tuple(parameters), body))
    return tuple(functions)


class ResearchServer:
    def __init__(self, engine: ResearchEngine):
        self._engine = engine
        self._state = "new"

    def handle(self, message) -> dict | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
            return _error(None, -32600, "Invalid JSON-RPC request.")
        method = message["method"]
        if "id" not in message:
            if method == "notifications/initialized" and self._state == "initializing":
                self._state = "ready"
            return None
        request_id = message["id"]
        if type(request_id) not in (int, str):
            return _error(None, -32600, "Use a string or integer request ID.")
        try:
            params = message.get("params", {})
            if not isinstance(params, dict):
                raise RequestError(-32602, "Supply a JSON object for params.")
            result = self._request(method, params)
        except RequestError as error:
            return _error(request_id, error.code, str(error))
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _request(self, method: str, params: dict) -> dict:
        if method == "ping":
            return {}
        if method == "initialize":
            if self._state != "new":
                raise RequestError(-32600, "This research session has already initialized.")
            if not isinstance(params.get("protocolVersion"), str):
                raise RequestError(-32602, "Supply the requested MCP protocol version.")
            self._state = "initializing"
            return {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "marketweft-research", "version": SERVER_VERSION},
            }
        if self._state != "ready":
            raise RequestError(-32002, "Initialize the research session before calling tools.")
        if method == "tools/list":
            if params.get("cursor") is not None:
                raise RequestError(-32602, "The tool list fits on a single page.")
            return {"tools": [TOOL]}
        if method == "tools/call":
            return self._evaluate(params)
        raise RequestError(-32601, "Method not found.")

    def _evaluate(self, params: dict) -> dict:
        if params.get("name") != TOOL_NAME:
            raise RequestError(-32602, "Unknown research tool.")
        arguments = params.get("arguments")
        if not isinstance(arguments, dict) or set(arguments) - INPUT_SCHEMA["properties"].keys():
            raise RequestError(-32602, "Supply only the documented formula arguments.")
        formula, history = arguments.get("formula"), arguments.get("history_csv")
        if not isinstance(formula, str) or not formula or not isinstance(history, str) or not history:
            raise RequestError(-32602, "Supply a formula and historical OHLCV CSV.")
        offset = _integer(arguments, "offset", 0, 0, 100_000)
        limit = _integer(arguments, "limit", 200, 1, MAX_ROWS)
        cutoff = (_integer(arguments, "observed_through", 0, MIN_I64, MAX_I64)
                  if "observed_through" in arguments else None)
        functions = _functions(arguments.get("functions", []))
        try:
            values = self._engine.evaluate_formula(formula, history, observed_through=cutoff, functions=functions)
        except (ResearchError, ValueError) as error:
            return {"content": _text(str(error)), "isError": True}
        page = values.rows[offset:offset + limit]
        end = offset + len(page)
        data = {
            "language_version": values.version,
            "total_rows": len(values.rows),
            "offset": offset,
            "next_offset": end if end < len(values.rows) else None,
            "rows": [
                {"observed_at": row.observed_at, "value_ticks": None if row.value is None else str(row.value)}
                for row in page
            ],
        }
        return {"content": _text(json.dumps(data, separators=(",", ":"))), "structuredContent": data}


def run(server: ResearchServer, read: BinaryIO, write: BinaryIO) -> None:
    while frame := read.readline(MAX_FRAME_BYTES + 1):
        too_long = len(frame) > MAX_FRAME_BYTES
        if too_long:
            reply = _error(None, -32600, "The request exceeds the transport byte limit.")
        else:
            try:
                message = json.loads(frame.decode("utf-8"), parse_constant=_invalid_number)
            except (ValueError, RecursionError):
                reply = _error(None, -32700, "Invalid JSON.")
            else:
                reply = server.handle(message)
        if reply is not None:
            write.write(json.dumps(reply, separators=(",", ":")).encode("ascii") + b"\n")
            write.flush()
        if too_long:
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve local MarketWeft research over MCP standard input and output.")
    parser.add_argument("--engine", required=True, type=Path, help="Path to the MarketWeft native research executable")
    parser.add_argument("--timeout", type=float, default=15.0, help="Timeout in seconds for each formula evaluation")
    arguments = parser.parse_args()
    try:
        engine = ResearchEngine(arguments.engine, timeout=arguments.timeout)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    try:
        run(ResearchServer(engine), sys.stdin.buffer, sys.stdout.buffer)
    except BrokenPipeError:
        return


if __name__ == "__main__":
    main()
