"""Bounded local MCP access to MarketWeft research."""

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys
from typing import BinaryIO

from . import FinancialMultiples, FinancialSnapshot, FormulaFunction, ResearchEngine, ResearchError, ScreenPrice
from . import (
    _MAX_FINANCIAL_CSV, _MAX_OPTION_CSV, _MAX_OPTION_DIVIDEND_CSV, _MAX_OPTION_ROWS, _OPTION_STATUSES,
)


PROTOCOL_VERSION = "2025-11-25"
SERVER_VERSION = "0.9.0"
MAX_FRAME_BYTES = 16 * 1024 * 1024
MAX_ROWS = 1_000
MAX_I64 = (1 << 63) - 1
MIN_I64 = -(1 << 63)
TOOL_NAME = "evaluate_historical_formula"
SCREEN_TOOL_NAME = "screen_universe_as_of"
FINANCIAL_TOOL_NAME = "financial_snapshot_as_of"
OPTION_SNAPSHOT_TOOL_NAME = "option_snapshot_as_of"
AMERICAN_OPTION_TOOL_NAME = "american_option_valuation_as_of"
_UTC_SCHEMA = {"type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"}
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
SCREEN_INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "membership_csv": {"type": "string", "minLength": 1, "maxLength": 1024 * 1024},
        "prices_csv": {"type": "string", "minLength": 1, "maxLength": 2 * 1024 * 1024},
        "baseline_at": _UTC_SCHEMA, "effective_at": _UTC_SCHEMA, "known_at": _UTC_SCHEMA,
        "offset": {"type": "integer", "minimum": 0, "maximum": 5000, "default": 0},
        "limit": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS, "default": 200},
    },
    "required": ["membership_csv", "prices_csv", "baseline_at", "effective_at", "known_at"],
    "additionalProperties": False,
}
_CLOSE_SCHEMA = {
    "type": ["object", "null"],
    "properties": {
        "ticks": {"type": "string", "pattern": "^[0-9]+$"},
        "observed_at": {"type": "integer"},
    },
    "required": ["ticks", "observed_at"],
    "additionalProperties": False,
}
_SCREEN_ROW_PROPERTIES = {
    "listing_id": {"type": "string"},
    "instrument": {"type": "string"},
    "membership_change_id": {"type": "string"},
    "membership_effective_at": {"type": "integer"},
    "membership_observed_at": {"type": "integer"},
    "rank": {"type": ["integer", "null"], "minimum": 1, "maximum": 5000},
    "return_units": {"type": ["string", "null"], "pattern": "^-?[0-9]+$"},
    "baseline": _CLOSE_SCHEMA,
    "current": _CLOSE_SCHEMA,
}
SCREEN_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "universe": {"type": "string"},
        "total_rows": {"type": "integer", "minimum": 0, "maximum": 5000},
        "offset": {"type": "integer", "minimum": 0, "maximum": 5000},
        "next_offset": {"type": ["integer", "null"], "minimum": 0, "maximum": 5000},
        "rows": {
            "type": "array", "maxItems": MAX_ROWS,
            "items": {
                "type": "object",
                "properties": _SCREEN_ROW_PROPERTIES,
                "required": list(_SCREEN_ROW_PROPERTIES),
                "additionalProperties": False,
            },
        },
    },
    "required": ["universe", "total_rows", "offset", "next_offset", "rows"],
    "additionalProperties": False,
}
SCREEN_TOOL = {
    "name": SCREEN_TOOL_NAME,
    "description": "Rank effective universe members by price return at the requested baseline and effective times using only reports visible at the independent knowledge cutoff. Missing close endpoints leave the listing unranked.",
    "annotations": TOOL["annotations"],
    "inputSchema": SCREEN_INPUT_SCHEMA,
    "outputSchema": SCREEN_OUTPUT_SCHEMA,
}

_FINANCIAL_CSV_SCHEMA = {"type": "string", "minLength": 1, "maxLength": _MAX_FINANCIAL_CSV}
_IDENTIFIER_SCHEMA = {"type": "string", "pattern": "^[A-Za-z0-9._-]{1,40}$"}
_CURRENCY_SCHEMA = {"type": "string", "pattern": "^[A-Z]{3}$"}
_TIME_SCHEMA = {"type": "integer"}
_TICKS_SCHEMA = {"type": "string", "pattern": "^-?(?:0|[1-9][0-9]{0,38})$"}
_OPTIONAL_TICKS_SCHEMA = {**_TICKS_SCHEMA, "type": ["string", "null"]}
_FLOW_FIELDS = ("revenue", "common_net_income", "operating_cash_flow")
_FILING_FIELDS = (*_FLOW_FIELDS, "common_equity")
_MULTIPLE_STATUSES = ["missing-filing", "missing-cap", "currency", "missing-denominator", "nonpositive-denominator"]
_TRAILING_STATUSES = ["insufficient-quarters", "noncontiguous", "currency"]


def _object_schema(properties: dict, *, nullable: bool = False) -> dict:
    return {
        "type": ["object", "null"] if nullable else "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


FINANCIAL_INPUT_SCHEMA = {
    **_object_schema({
        "filings_csv": _FINANCIAL_CSV_SCHEMA,
        "capitalization_csv": _FINANCIAL_CSV_SCHEMA,
        "issuer": _IDENTIFIER_SCHEMA,
        "valuation_at": _UTC_SCHEMA,
        "known_at": _UTC_SCHEMA,
    }),
    "required": ["filings_csv", "issuer", "valuation_at", "known_at"],
}
_FILING_PROPERTIES = {
    "source_id": _IDENTIFIER_SCHEMA,
    "fiscal_start": _TIME_SCHEMA,
    "fiscal_end": _TIME_SCHEMA,
    "published_at": _TIME_SCHEMA,
    "observed_at": _TIME_SCHEMA,
    "currency": _CURRENCY_SCHEMA,
    **{field: _OPTIONAL_TICKS_SCHEMA for field in _FILING_FIELDS},
}
_MULTIPLE_SCHEMAS = [
    _object_schema({"kind": {"const": "value"}, "units": _TICKS_SCHEMA}),
    _object_schema({"kind": {"enum": _MULTIPLE_STATUSES}, "units": {"type": "null"}}),
]
_MULTIPLE_SCHEMA = {"anyOf": _MULTIPLE_SCHEMAS}
_OPTIONAL_MULTIPLE_SCHEMA = {"anyOf": [*_MULTIPLE_SCHEMAS, {"type": "null"}]}
FINANCIAL_OUTPUT_SCHEMA = _object_schema({
    "issuer": _IDENTIFIER_SCHEMA,
    "valuation_at": _UTC_SCHEMA,
    "known_at": _UTC_SCHEMA,
    "filing": _object_schema(_FILING_PROPERTIES, nullable=True),
    "market_cap": _object_schema({
        "source_id": _IDENTIFIER_SCHEMA,
        "at": _TIME_SCHEMA,
        "observed_at": _TIME_SCHEMA,
        "currency": _CURRENCY_SCHEMA,
        "ticks": _TICKS_SCHEMA,
    }, nullable=True),
    "annual_valuation": _object_schema(dict.fromkeys(("price_earnings", "price_sales", "price_book"), _MULTIPLE_SCHEMA)),
    "quarters": {"type": "array", "maxItems": 4, "items": _object_schema(_FILING_PROPERTIES)},
    "trailing": {"anyOf": [
        _object_schema({"kind": {"const": "available"}, "currency": _CURRENCY_SCHEMA,
                        **{field: _OPTIONAL_TICKS_SCHEMA for field in _FLOW_FIELDS}}),
        _object_schema({"kind": {"enum": _TRAILING_STATUSES}, "currency": {"type": "null"},
                        **dict.fromkeys(_FLOW_FIELDS, {"type": "null"})}),
    ]},
    "quarterly_valuation": _object_schema({
        "price_earnings": _OPTIONAL_MULTIPLE_SCHEMA,
        "price_sales": _OPTIONAL_MULTIPLE_SCHEMA,
        "price_book": _MULTIPLE_SCHEMA,
    }),
})
FINANCIAL_TOOL = {
    "name": FINANCIAL_TOOL_NAME,
    "description": "Replay annual and quarterly filings and their valuations at independent UTC cutoffs. Accepts CSV contents and returns exact millionths as decimal strings.",
    "annotations": TOOL["annotations"],
    "inputSchema": FINANCIAL_INPUT_SCHEMA,
    "outputSchema": FINANCIAL_OUTPUT_SCHEMA,
}


_OPTION_CSV_SCHEMA = {"type": "string", "minLength": 1, "maxLength": _MAX_OPTION_CSV}
_U32_MAX = (1 << 32) - 1
_MAX_OPTION_AGE = 300
_DEFAULT_OPTION_PAGE = 200
_OPTION_QUERY_PROPERTIES = {
    "underlying_csv": _OPTION_CSV_SCHEMA,
    "quotes_csv": _OPTION_CSV_SCHEMA,
    "effective_at": _UTC_SCHEMA,
    "known_at": _UTC_SCHEMA,
}
_OPTION_QUERY_FIELDS = list(_OPTION_QUERY_PROPERTIES)
_OPTION_AGE_SCHEMA = {"type": "integer", "minimum": 0, "maximum": _U32_MAX, "default": _MAX_OPTION_AGE}
OPTION_SNAPSHOT_INPUT = {
    **_object_schema({
        **_OPTION_QUERY_PROPERTIES,
        "max_age": _OPTION_AGE_SCHEMA,
        "offset": {"type": "integer", "minimum": 0, "maximum": _MAX_OPTION_ROWS, "default": 0},
        "limit": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS, "default": _DEFAULT_OPTION_PAGE},
    }),
    "required": _OPTION_QUERY_FIELDS,
}
_OPTION_QUOTE_CLOCKS = dict.fromkeys(("quote_at", "observed_at"), _TIME_SCHEMA)
_OPTION_QUOTE = _object_schema({
    "contract_id": _IDENTIFIER_SCHEMA,
    "expiration": _TIME_SCHEMA,
    "strike_ticks": _TICKS_SCHEMA,
    "side": {"enum": ["call", "put"]},
    "exercise_style": {"enum": ["european", "american"]},
    **_OPTION_QUOTE_CLOCKS,
    "bid_ticks": _OPTIONAL_TICKS_SCHEMA,
    "ask_ticks": _OPTIONAL_TICKS_SCHEMA,
    "status": {"enum": ["ok", *sorted(_OPTION_STATUSES)]},
    "analytics": _object_schema(
        dict.fromkeys(("volatility", "price", "delta", "gamma", "vega", "theta", "rho"), {"type": "number"}),
        nullable=True,
    ),
})
OPTION_SNAPSHOT_OUTPUT = _object_schema({
    "instrument": {"type": "string", "pattern": "^[A-Z0-9._/-]{1,32}:[A-Z0-9._/-]{1,32}$"},
    "currency": _CURRENCY_SCHEMA,
    "effective_at": _UTC_SCHEMA,
    "known_at": _UTC_SCHEMA,
    "underlying": _object_schema({
        **_OPTION_QUOTE_CLOCKS,
        **dict.fromkeys(("spot_ticks", "rate_units", "dividend_yield_units"), _TICKS_SCHEMA),
    }, nullable=True),
    "total_rows": {"type": "integer", "minimum": 0, "maximum": _MAX_OPTION_ROWS},
    "offset": {"type": "integer", "minimum": 0, "maximum": _MAX_OPTION_ROWS},
    "next_offset": {"type": ["integer", "null"], "minimum": 0, "maximum": _MAX_OPTION_ROWS},
    "rows": {"type": "array", "maxItems": MAX_ROWS, "items": _OPTION_QUOTE},
})
OPTION_SNAPSHOT_TOOL = {
    "name": OPTION_SNAPSHOT_TOOL_NAME,
    "description": (
        "Replay option quotes and European analytics from supplied underlying and option CSV contents at "
        "independent effective and known UTC times. Reuse the same inputs with next_offset for another page."
    ),
    "annotations": TOOL["annotations"],
    "inputSchema": OPTION_SNAPSHOT_INPUT,
    "outputSchema": OPTION_SNAPSHOT_OUTPUT,
}


_AMERICAN_OPTION_FIELDS = [*_OPTION_QUERY_FIELDS, "contract_id"]
AMERICAN_OPTION_INPUT = {
    **_object_schema({
        **_OPTION_QUERY_PROPERTIES,
        "contract_id": _IDENTIFIER_SCHEMA,
        "max_age": _OPTION_AGE_SCHEMA,
        "steps": {"type": "integer", "minimum": 1, "maximum": 256, "default": 128},
        "volatility": {"type": "number", "minimum": 0, "maximum": 10},
        "cash_dividends_csv": {"type": "string", "minLength": 1, "maxLength": _MAX_OPTION_DIVIDEND_CSV},
    }),
    "required": _AMERICAN_OPTION_FIELDS,
}
AMERICAN_OPTION_OUTPUT = _object_schema({
    "contract_id": _IDENTIFIER_SCHEMA,
    "currency": _CURRENCY_SCHEMA,
    "effective_at": _UTC_SCHEMA,
    "known_at": _UTC_SCHEMA,
    "status": {"enum": ["value", "missing-contract", "european-contract", *sorted(_OPTION_STATUSES)]},
    "price": {"type": ["number", "null"], "minimum": 0},
    "volatility": {"type": ["number", "null"], "minimum": 0, "maximum": 10},
    "dividends": {
        "type": "array", "maxItems": 1000,
        "items": _object_schema({
            "id": _IDENTIFIER_SCHEMA,
            **dict.fromkeys(("announced_at", "ex_at", "pay_at", "observed_at"), _TIME_SCHEMA),
            "currency": _CURRENCY_SCHEMA,
            "amount_per_share_ticks": _TICKS_SCHEMA,
        }),
    },
})
AMERICAN_OPTION_TOOL = {
    "name": AMERICAN_OPTION_TOOL_NAME,
    "description": (
        "Price an observed American option at the supplied annual volatility or solve its bid-ask midpoint. "
        "An optional cash CSV applies dividend reports known at the requested cutoffs and returns their provenance."
    ),
    "annotations": TOOL["annotations"],
    "inputSchema": AMERICAN_OPTION_INPUT,
    "outputSchema": AMERICAN_OPTION_OUTPUT,
}


class RequestError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def _error(request_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _text(value: str) -> list[dict]:
    return [{"type": "text", "text": value}]


def _structured(data: dict) -> dict:
    return {"content": _text(json.dumps(data, separators=(",", ":"))), "structuredContent": data}


def _price(price: ScreenPrice | None) -> dict | None:
    return None if price is None else {"ticks": str(price.ticks), "observed_at": price.observed_at}


def _fixed_fields(record, *amounts) -> dict | None:
    if record is None:
        return None
    payload = asdict(record)
    for field in amounts:
        value = payload[field]
        payload[field] = None if value is None else str(value)
    return payload


def _financial_multiples(value: FinancialMultiples) -> dict:
    return {
        "price_earnings": _fixed_fields(value.price_earnings, "units"),
        "price_sales": _fixed_fields(value.price_sales, "units"),
        "price_book": _fixed_fields(value.price_book, "units"),
    }


def _financial_content(report: FinancialSnapshot, valuation_at: str, known_at: str) -> dict:
    return {
        "issuer": report.issuer,
        "valuation_at": valuation_at,
        "known_at": known_at,
        "filing": _fixed_fields(report.filing, *_FILING_FIELDS),
        "market_cap": _fixed_fields(report.market_cap, "ticks"),
        "annual_valuation": _financial_multiples(report.annual_valuation),
        "quarters": [_fixed_fields(quarter, *_FILING_FIELDS) for quarter in report.quarters],
        "trailing": _fixed_fields(report.trailing, *_FLOW_FIELDS),
        "quarterly_valuation": _financial_multiples(report.quarterly_valuation),
    }


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
            return {"tools": [TOOL, SCREEN_TOOL, FINANCIAL_TOOL, OPTION_SNAPSHOT_TOOL, AMERICAN_OPTION_TOOL]}
        if method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments")
            if name == TOOL_NAME:
                return self._evaluate(arguments)
            if name == SCREEN_TOOL_NAME:
                return self._screen(arguments)
            if name == FINANCIAL_TOOL_NAME:
                return self._financial(arguments)
            if name == OPTION_SNAPSHOT_TOOL_NAME:
                return self._option_snapshot(arguments)
            if name == AMERICAN_OPTION_TOOL_NAME:
                return self._american_option(arguments)
            raise RequestError(-32602, "Unknown research tool.")
        raise RequestError(-32601, "Method not found.")

    def _evaluate(self, arguments) -> dict:
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
        return _structured(data)

    def _screen(self, arguments) -> dict:
        if not isinstance(arguments, dict) or set(arguments) - SCREEN_INPUT_SCHEMA["properties"].keys():
            raise RequestError(-32602, "Supply only the documented universe screen arguments.")
        required = SCREEN_INPUT_SCHEMA["required"]
        if not all(isinstance(arguments.get(field), str) and arguments[field] for field in required):
            raise RequestError(-32602, "Supply both CSVs and the baseline, effective and known times.")
        offset = _integer(arguments, "offset", 0, 0, 5000)
        limit = _integer(arguments, "limit", 200, 1, MAX_ROWS)
        try:
            report = self._engine.screen_universe(**{field: arguments[field] for field in required})
        except (ResearchError, ValueError) as error:
            return {"content": _text(str(error)), "isError": True}
        page = report.rows[offset:offset + limit]
        end = offset + len(page)
        return _structured({
            "universe": report.universe,
            "total_rows": len(report.rows),
            "offset": offset,
            "next_offset": end if end < len(report.rows) else None,
            "rows": [
                {
                    "listing_id": row.listing_id,
                    "instrument": row.instrument,
                    "membership_change_id": row.membership_change_id,
                    "membership_effective_at": row.membership_effective_at,
                    "membership_observed_at": row.membership_observed_at,
                    "rank": row.rank,
                    "return_units": None if row.return_units is None else str(row.return_units),
                    "baseline": _price(row.baseline),
                    "current": _price(row.current),
                }
                for row in page
            ],
        })

    def _financial(self, arguments) -> dict:
        properties = FINANCIAL_INPUT_SCHEMA["properties"]
        if not isinstance(arguments, dict) or set(arguments) - properties.keys():
            raise RequestError(-32602, "Supply only the documented financial snapshot arguments.")
        required = FINANCIAL_INPUT_SCHEMA["required"]
        fields = required + (["capitalization_csv"] if "capitalization_csv" in arguments else [])
        if not all(isinstance(arguments.get(field), str) and arguments[field] for field in fields):
            raise RequestError(-32602, "Supply filing CSV contents, an issuer and both UTC times.")
        try:
            report = self._engine.financial_snapshot(**arguments)
        except (ResearchError, ValueError) as error:
            return {"content": _text(str(error)), "isError": True}
        return _structured(_financial_content(report, arguments["valuation_at"], arguments["known_at"]))

    def _option_snapshot(self, arguments) -> dict:
        properties = OPTION_SNAPSHOT_INPUT["properties"]
        if not isinstance(arguments, dict) or set(arguments) - properties.keys():
            raise RequestError(-32602, "Supply only the documented option snapshot arguments.")
        if not all(isinstance(arguments.get(field), str) and arguments[field] for field in _OPTION_QUERY_FIELDS):
            raise RequestError(-32602, "Supply underlying and option CSV contents and both UTC times.")
        max_age = _integer(arguments, "max_age", _MAX_OPTION_AGE, 0, _U32_MAX)
        offset = _integer(arguments, "offset", 0, 0, _MAX_OPTION_ROWS)
        limit = _integer(arguments, "limit", _DEFAULT_OPTION_PAGE, 1, MAX_ROWS)
        try:
            report = self._engine.option_snapshot(
                **{field: arguments[field] for field in _OPTION_QUERY_FIELDS}, max_age=max_age,
            )
        except (ResearchError, ValueError) as error:
            return {"content": _text(str(error)), "isError": True}
        page = report.options[offset:offset + limit]
        end = offset + len(page)
        return _structured({
            "instrument": report.instrument,
            "currency": report.currency,
            "effective_at": arguments["effective_at"],
            "known_at": arguments["known_at"],
            "underlying": _fixed_fields(report.underlying, "spot_ticks", "rate_units", "dividend_yield_units"),
            "total_rows": len(report.options),
            "offset": offset,
            "next_offset": end if end < len(report.options) else None,
            "rows": [_fixed_fields(row, "strike_ticks", "bid_ticks", "ask_ticks") for row in page],
        })

    def _american_option(self, arguments) -> dict:
        properties = AMERICAN_OPTION_INPUT["properties"]
        if not isinstance(arguments, dict) or set(arguments) - properties.keys():
            raise RequestError(-32602, "Supply only the documented American option valuation arguments.")
        if not all(isinstance(arguments.get(field), str) and arguments[field] for field in _AMERICAN_OPTION_FIELDS):
            raise RequestError(-32602, "Supply both CSVs, a contract ID and both UTC times.")
        max_age = _integer(arguments, "max_age", _MAX_OPTION_AGE, 0, _U32_MAX)
        steps = _integer(arguments, "steps", 128, 1, 256)
        volatility = arguments.get("volatility")
        if "volatility" in arguments and (type(volatility) not in (float, int) or not 0 <= volatility <= 10):
            raise RequestError(-32602, "Supply annual volatility as a number from 0 to 10.")
        cash = arguments.get("cash_dividends_csv")
        if "cash_dividends_csv" in arguments and (not isinstance(cash, str) or not cash):
            raise RequestError(-32602, "Supply cash dividends as CSV contents.")
        try:
            report = self._engine.american_option_valuation(
                **{field: arguments[field] for field in _AMERICAN_OPTION_FIELDS},
                max_age=max_age, steps=steps, volatility=volatility, cash_dividends_csv=cash,
            )
        except (ResearchError, ValueError) as error:
            return {"content": _text(str(error)), "isError": True}
        return _structured({
            "contract_id": report.contract_id,
            "currency": report.currency,
            "effective_at": arguments["effective_at"],
            "known_at": arguments["known_at"],
            "status": report.status,
            "price": report.price,
            "volatility": report.volatility,
            "dividends": [_fixed_fields(row, "amount_per_share_ticks") for row in report.dividends],
        })


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
    parser.add_argument("--timeout", type=float, default=15.0, help="Timeout in seconds for each native query")
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
