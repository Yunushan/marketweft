"""Read-only research backed by the local MarketWeft Rust engine."""

from dataclasses import dataclass
import math
from pathlib import Path
import re
import subprocess
from typing import Sequence

__all__ = [
    "AmericanOptionValuation", "OptionCashDividend",
    "FinancialFiling", "FinancialMarketCap", "FinancialMultiple", "FinancialMultiples",
    "FinancialSnapshot", "FinancialTrailing",
    "FormulaFunction", "FormulaResult", "FormulaRow",
    "OptionChainAnalytics", "OptionChainQuote", "OptionChainSnapshot", "OptionUnderlyingQuote",
    "ResearchEngine", "ResearchError",
    "ScreenPrice", "ScreenResult", "ScreenRow",
]

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,31}\Z")
_IDENTITY = re.compile(r"[A-Za-z0-9._-]{1,40}\Z")
_INSTRUMENT = re.compile(r"[A-Z0-9._/-]{1,32}:[A-Z0-9._/-]{1,32}\Z")
_CURRENCY = re.compile(r"[A-Z]{3}\Z")
_UTC = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\Z")
_WHOLE = re.compile(r"-?(?:0|[1-9][0-9]{0,18})\Z")
_WIDE = re.compile(r"-?(?:0|[1-9][0-9]{0,38})\Z")
_MIN_I64 = -(1 << 63)
_MAX_I64 = (1 << 63) - 1
_MAX_SOURCE = 2048
_MAX_CSV = 8 * 1024 * 1024
_MAX_FINANCIAL_CSV = 1024 * 1024
_MAX_OPTION_CSV = 2 * 1024 * 1024
_MAX_OPTION_ROWS = 20_000
_MAX_OPTION_DIVIDEND_CSV = 1024 * 1024
_OPTION_STATUSES = {
    "expired", "stale-option", "missing-bid-ask", "crossed", "missing-underlying",
    "stale-underlying", "american-volatility-required", "model-range", "price-bounds",
    "unresolved-vol",
}
_CAPITALIZATION_HEADER = "issuer_id,source_id,valuation_at,observed_at,currency,market_cap"


class ResearchError(Exception):
    """The native engine rejected the request or could not return a valid result."""


@dataclass(frozen=True)
class FormulaFunction:
    name: str
    parameters: tuple[str, ...]
    body: str


@dataclass(frozen=True)
class FormulaRow:
    observed_at: int
    value: int | None


@dataclass(frozen=True)
class FormulaResult:
    version: int
    rows: tuple[FormulaRow, ...]


@dataclass(frozen=True)
class ScreenPrice:
    ticks: int
    observed_at: int


@dataclass(frozen=True)
class ScreenRow:
    listing_id: str
    instrument: str
    membership_change_id: str
    membership_effective_at: int
    membership_observed_at: int
    rank: int | None
    return_units: int | None
    baseline: ScreenPrice | None
    current: ScreenPrice | None


@dataclass(frozen=True)
class ScreenResult:
    universe: str
    rows: tuple[ScreenRow, ...]


@dataclass(frozen=True)
class FinancialFiling:
    source_id: str
    fiscal_start: int
    fiscal_end: int
    published_at: int
    observed_at: int
    currency: str
    revenue: int | None
    common_net_income: int | None
    common_equity: int | None
    operating_cash_flow: int | None


@dataclass(frozen=True)
class FinancialMarketCap:
    source_id: str
    at: int
    observed_at: int
    currency: str
    ticks: int


@dataclass(frozen=True)
class FinancialMultiple:
    kind: str
    units: int | None = None


@dataclass(frozen=True)
class FinancialMultiples:
    price_earnings: FinancialMultiple | None
    price_sales: FinancialMultiple | None
    price_book: FinancialMultiple


@dataclass(frozen=True)
class FinancialTrailing:
    kind: str
    currency: str | None = None
    revenue: int | None = None
    common_net_income: int | None = None
    operating_cash_flow: int | None = None


@dataclass(frozen=True)
class FinancialSnapshot:
    issuer: str
    filing: FinancialFiling | None
    market_cap: FinancialMarketCap | None
    annual_valuation: FinancialMultiples
    quarters: tuple[FinancialFiling, ...]
    trailing: FinancialTrailing
    quarterly_valuation: FinancialMultiples


@dataclass(frozen=True)
class OptionChainAnalytics:
    volatility: float
    price: float
    delta: float
    gamma: float
    vega: float
    theta: float
    rho: float


@dataclass(frozen=True)
class OptionUnderlyingQuote:
    quote_at: int
    observed_at: int
    spot_ticks: int
    rate_units: int
    dividend_yield_units: int


@dataclass(frozen=True)
class OptionChainQuote:
    contract_id: str
    expiration: int
    strike_ticks: int
    side: str
    exercise_style: str
    quote_at: int
    observed_at: int
    bid_ticks: int | None
    ask_ticks: int | None
    status: str
    analytics: OptionChainAnalytics | None


@dataclass(frozen=True)
class OptionChainSnapshot:
    instrument: str
    currency: str
    underlying: OptionUnderlyingQuote | None
    options: tuple[OptionChainQuote, ...]


@dataclass(frozen=True)
class OptionCashDividend:
    id: str
    announced_at: int
    ex_at: int
    pay_at: int
    observed_at: int
    currency: str
    amount_per_share_ticks: int


@dataclass(frozen=True)
class AmericanOptionValuation:
    contract_id: str
    currency: str
    status: str
    price: float | None
    volatility: float | None
    dividends: tuple[OptionCashDividend, ...]


def _definitions(functions: Sequence[FormulaFunction]) -> bytes:
    if len(functions) > 16:
        raise ValueError("Supply at most 16 custom formula functions.")
    chunks = []
    for function in functions:
        if not _NAME.fullmatch(function.name) or not 1 <= len(function.parameters) <= 4 or any(
            not _NAME.fullmatch(parameter) for parameter in function.parameters
        ):
            raise ValueError("Use a function name and one to four ASCII parameter names.")
        body = function.body.encode("utf-8")
        if len(body) > _MAX_SOURCE:
            raise ValueError("Formula function body exceeds 2,048 source bytes.")
        chunks.append(f"{function.name}\t{','.join(function.parameters)}\t{len(body)}\n".encode("ascii"))
        chunks.append(body)
    return b"".join(chunks)


def _whole(text: str) -> int:
    if not _WHOLE.fullmatch(text):
        raise ResearchError("Invalid integer in research response.")
    value = int(text)
    if not _MIN_I64 <= value <= _MAX_I64:
        raise ResearchError("Research response integer exceeds the signed 64-bit range.")
    return value


def _response(output: bytes, protocol: str) -> tuple[str, list[str]]:
    try:
        response = output.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ResearchError("Research response is not ASCII.") from exc
    header, newline, body = response.partition("\n")
    fields = header.split("\t")
    if not newline or len(fields) != 3 or fields[:2] != [protocol, "1"]:
        raise ResearchError("Invalid research response or protocol version.")
    if body and not body.endswith("\n"):
        raise ResearchError("Incomplete research result.")
    return fields[2], body[:-1].split("\n") if body else []


def _result(output: bytes) -> FormulaResult:
    version, lines = _response(output, "marketweft-research")
    version_number = _whole(version)
    if not 1 <= version_number <= 0xFFFFFFFF:
        raise ResearchError("Invalid research formula language version.")
    rows: list[FormulaRow] = []
    for line in lines:
        instant, tab, value = line.partition("\t")
        if not tab or len(rows) == 100_000:
            raise ResearchError("Invalid research result row or row limit.")
        timestamp = _whole(instant)
        if rows and timestamp <= rows[-1].observed_at:
            raise ResearchError("Research rows are not in observed order.")
        rows.append(FormulaRow(timestamp, _whole(value) if value else None))
    return FormulaResult(version_number, tuple(rows))


def _price(ticks: str, observed: str) -> ScreenPrice | None:
    if not ticks and not observed:
        return None
    amount = _whole(ticks)
    if amount < 1:
        raise ResearchError("Invalid close in universe screen response.")
    return ScreenPrice(amount, _whole(observed))


def _screen_result(output: bytes) -> ScreenResult:
    universe, lines = _response(output, "marketweft-screen")
    if not _IDENTITY.fullmatch(universe) or len(lines) > 5000:
        raise ResearchError("Invalid universe identity or row limit in screen response.")
    rows = []
    for line in lines:
        fields = line.split("\t")
        if len(fields) != 11:
            raise ResearchError("Invalid universe screen response row.")
        listing, instrument, change, effective, observed, rank, units, *prices = fields
        if not _IDENTITY.fullmatch(listing) or not _IDENTITY.fullmatch(change):
            raise ResearchError("Invalid membership identity in universe screen response.")
        baseline, current = _price(*prices[:2]), _price(*prices[2:])
        if (bool(rank) != bool(units) or bool(rank) != (baseline is not None and current is not None)
                or (units and not _WIDE.fullmatch(units))):
            raise ResearchError("Inconsistent rank or close in universe screen response.")
        rank_value = _whole(rank) if rank else None
        return_units = int(units) if units else None
        if (rank_value is not None and not 1 <= rank_value <= 5000
                or return_units is not None and not -(1 << 127) <= return_units < (1 << 127)):
            raise ResearchError("Rank or return exceeds the universe screen range.")
        rows.append(ScreenRow(listing, instrument, change, _whole(effective), _whole(observed),
                              rank_value, return_units, baseline, current))
    return ScreenResult(universe, tuple(rows))


@dataclass(frozen=True)
class ScreenComparisonLeg:
    status: str | None
    change_id: str | None
    effective_at: int | None
    observed_at: int | None
    rank: int | None
    return_units: int | None
    baseline: ScreenPrice | None
    current: ScreenPrice | None


@dataclass(frozen=True)
class ScreenComparisonRow:
    listing_id: str
    instrument: str
    before: ScreenComparisonLeg
    after: ScreenComparisonLeg
    rank_move: int | None


@dataclass(frozen=True)
class ScreenComparison:
    universe: str
    rows: tuple[ScreenComparisonRow, ...]


def _rank_comparison_result(output: bytes) -> ScreenComparison:
    universe, lines = _response(output, "marketweft-rank-comparison")
    if not _IDENTITY.fullmatch(universe) or len(lines) > 5000:
        raise ResearchError("Invalid universe identity or row limit in rank comparison response.")

    def close(field: str) -> ScreenPrice | None:
        parts = field.split(",") if field else ["", ""]
        if len(parts) != 2:
            raise ResearchError("Invalid price evidence in rank comparison.")
        return _price(*parts)

    def decode_leg(fields: list[str]) -> ScreenComparisonLeg:
        membership, rank, units, baseline, current = fields
        status = change = effective = observed = None
        if membership:
            parts = membership.split(",")
            states = {"0": "member", "1": "removed", "2": "delisted"}
            if len(parts) != 4 or not _IDENTITY.fullmatch(parts[1]) or parts[0] not in states:
                raise ResearchError("Invalid membership evidence in rank comparison.")
            status = states[parts[0]]
            change, effective, observed = parts[1], _whole(parts[2]), _whole(parts[3])
        first, last = close(baseline), close(current)
        if (bool(rank) != bool(units) or (units and not _WIDE.fullmatch(units))
                or bool(rank) != (status == "member" and first is not None and last is not None)
                or (status != "member" and (first is not None or last is not None))):
            raise ResearchError("Inconsistent rank or close in rank comparison.")
        rank_value = _whole(rank) if rank else None
        units_value = int(units) if units else None
        if (rank_value is not None and not 1 <= rank_value <= 5000
                or units_value is not None and not -(1 << 127) <= units_value < (1 << 127)):
            raise ResearchError("Rank or return exceeds the rank comparison range.")
        return ScreenComparisonLeg(status, change, effective, observed, rank_value, units_value, first, last)

    rows = []
    for line in lines:
        fields = line.split("\t")
        if len(fields) != 13 or not _IDENTITY.fullmatch(fields[0]):
            raise ResearchError("Invalid row in rank comparison.")
        before, after = decode_leg(fields[2:7]), decode_leg(fields[7:12])
        delta = _whole(fields[12]) if fields[12] else None
        expected = None if before.rank is None or after.rank is None else before.rank - after.rank
        if delta != expected or (before.status != "member" and after.status != "member"):
            raise ResearchError("Inconsistent membership or movement in rank comparison.")
        if rows and fields[0] <= rows[-1].listing_id:
            raise ResearchError("Rank comparison rows are out of listing ID order.")
        rows.append(ScreenComparisonRow(fields[0], fields[1], before, after, delta))
    return ScreenComparison(universe, tuple(rows))


def _financial_amount(text: str) -> int:
    if not _WIDE.fullmatch(text):
        raise ResearchError("Invalid fixed-point amount in financial response.")
    value = int(text)
    if not -(1 << 127) <= value < (1 << 127):
        raise ResearchError("Invalid fixed-point amount in financial response.")
    return value


def _financial_filing(fields: list[str]) -> FinancialFiling:
    if len(fields) != 10:
        raise ResearchError("Invalid filing row in financial response.")
    source, start, end, published, observed, currency, *amounts = fields
    if not _IDENTITY.fullmatch(source) or not _CURRENCY.fullmatch(currency):
        raise ResearchError("Invalid filing identity or currency in financial response.")
    return FinancialFiling(source, _whole(start), _whole(end), _whole(published), _whole(observed),
                           currency, *(_financial_amount(value) if value else None for value in amounts))


def _financial_multiple(fields: list[str]) -> FinancialMultiple | None:
    if len(fields) == 2 and fields[0] == "value":
        return FinancialMultiple("value", _financial_amount(fields[1]))
    if len(fields) == 1:
        kind, = fields
        if kind == "missing-quarters":
            return None
        if kind in {"missing-filing", "missing-cap", "currency",
                    "missing-denominator", "nonpositive-denominator"}:
            return FinancialMultiple(kind)
    raise ResearchError("Invalid multiple row in financial response.")


def _financial_trailing(fields: list[str]) -> FinancialTrailing:
    if len(fields) == 1 and fields[0] in {"insufficient-quarters", "noncontiguous", "currency"}:
        return FinancialTrailing(fields[0])
    if len(fields) == 5 and fields[0] == "available" and _CURRENCY.fullmatch(fields[1]):
        kind, currency, *amounts = fields
        return FinancialTrailing(kind, currency,
                                 *(_financial_amount(value) if value else None for value in amounts))
    raise ResearchError("Invalid trailing coverage row in financial response.")


def _financial_result(output: bytes, requested_issuer: str) -> FinancialSnapshot:
    issuer, lines = _response(output, "marketweft-financial")
    if issuer != requested_issuer or len(lines) > 13:
        raise ResearchError("Unexpected issuer or row count in financial response.")
    filing = market_cap = trailing = None
    quarters: list[FinancialFiling] = []
    annual_multiples: list[FinancialMultiple | None] = []
    quarter_multiples: list[FinancialMultiple | None] = []
    for line in lines:
        tag, *fields = line.split("\t")
        if tag == "F" and filing is None:
            filing = _financial_filing(fields)
        elif tag == "Q" and len(quarters) < 4:
            quarter = _financial_filing(fields)
            if quarters and quarter.fiscal_end <= quarters[-1].fiscal_end:
                raise ResearchError("Quarter rows are not in fiscal order.")
            quarters.append(quarter)
        elif tag == "C" and len(fields) == 5 and market_cap is None:
            source, at, observed, currency, amount = fields
            ticks = _financial_amount(amount)
            if not _IDENTITY.fullmatch(source) or not _CURRENCY.fullmatch(currency) or ticks <= 0:
                raise ResearchError("Invalid capitalization row in financial response.")
            market_cap = FinancialMarketCap(source, _whole(at), _whole(observed), currency, ticks)
        elif tag == "T" and trailing is None:
            trailing = _financial_trailing(fields)
        elif tag == "R" and len(annual_multiples) < 3:
            annual_multiples.append(_financial_multiple(fields))
        elif tag == "U" and len(quarter_multiples) < 3:
            quarter_multiples.append(_financial_multiple(fields))
        else:
            raise ResearchError("Unexpected or repeated row in financial response.")
    if (trailing is None or len(annual_multiples) != 3 or any(item is None for item in annual_multiples)
            or len(quarter_multiples) != 3 or quarter_multiples[2] is None):
        raise ResearchError("Incomplete financial response.")
    complete = trailing.kind == "available"
    if ((len(quarters) < 4) != (trailing.kind == "insufficient-quarters")
            or any((item is not None) != complete for item in quarter_multiples[:2])):
        raise ResearchError("Inconsistent trailing coverage in financial response.")
    return FinancialSnapshot(issuer, filing, market_cap, FinancialMultiples(*annual_multiples),
                             tuple(quarters), trailing, FinancialMultiples(*quarter_multiples))


def _option_analytics(status: str, fields: list[str]) -> OptionChainAnalytics | None:
    if status in _OPTION_STATUSES and not fields:
        return None
    if status != "ok" or len(fields) != 7:
        raise ResearchError("Invalid model status or analytics in option response.")
    try:
        values = [float(value) for value in fields]
    except ValueError as exc:
        raise ResearchError("Invalid option analytics in research response.") from exc
    if any(not math.isfinite(value) for value in values):
        raise ResearchError("Nonfinite option analytics in research response.")
    return OptionChainAnalytics(*values)


def _option_snapshot(output: bytes) -> OptionChainSnapshot:
    identity, lines = _response(output, "marketweft-options")
    instrument, separator, currency = identity.partition(",")
    if not separator or not _INSTRUMENT.fullmatch(instrument) or not _CURRENCY.fullmatch(currency):
        raise ResearchError("Invalid option underlying identity in research response.")
    if len(lines) > _MAX_OPTION_ROWS + 1:
        raise ResearchError("Too many rows in option snapshot response.")
    underlying = None
    options: list[OptionChainQuote] = []
    ids: set[str] = set()
    for line in lines:
        tag, *fields = line.split("\t")
        if tag == "U" and len(fields) == 5 and underlying is None and not options:
            underlying = OptionUnderlyingQuote(*(_whole(field) for field in fields))
            continue
        if tag != "Q" or len(fields) not in {10, 17}:
            raise ResearchError("Invalid option quote row in research response.")
        contract, expiration, strike, side, at, observed, bid, ask, status, *model, style = fields
        if (not _IDENTITY.fullmatch(contract) or contract in ids or side not in {"call", "put"}
                or style not in {"american", "european"}):
            raise ResearchError("Invalid or repeated option contract in research response.")
        ids.add(contract)
        options.append(OptionChainQuote(
            contract, _whole(expiration), _whole(strike), side, style, _whole(at), _whole(observed),
            _whole(bid) if bid else None, _whole(ask) if ask else None, status,
            _option_analytics(status, model),
        ))
    return OptionChainSnapshot(instrument, currency, underlying, tuple(options))


def _option_inputs(
    underlying_csv: str, quotes_csv: str, effective_at: str, known_at: str, max_age: int,
) -> tuple[bytes, bytes]:
    times = (effective_at, known_at)
    if any(not isinstance(timestamp, str) or not _UTC.fullmatch(timestamp) for timestamp in times):
        raise ValueError("Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
    if type(max_age) is not int or not 0 <= max_age <= 0xFFFFFFFF:
        raise ValueError("Use a whole maximum quote age from 0 to 4,294,967,295 seconds.")
    underlying, quotes = underlying_csv.encode("utf-8"), quotes_csv.encode("utf-8")
    if max(len(underlying), len(quotes)) > _MAX_OPTION_CSV:
        raise ValueError("Each option input CSV must fit within 2 MiB.")
    return underlying, quotes


def _american_option_valuation(output: bytes, requested_contract: str) -> AmericanOptionValuation:
    identity, lines = _response(output, "marketweft-american-option")
    contract, separator, currency = identity.partition(",")
    if not separator or contract != requested_contract or not _CURRENCY.fullmatch(currency):
        raise ResearchError("Invalid identity in American option response.")
    if not lines or len(lines) > 1001:
        raise ResearchError("Invalid row count in American option response.")
    status, *values = lines[0].split("\t")
    if status in _OPTION_STATUSES | {"missing-contract", "european-contract"} and not values and len(lines) == 1:
        return AmericanOptionValuation(contract, currency, status, None, None, ())
    if status != "value" or len(values) != 2:
        raise ResearchError("Invalid status in American option response.")
    try:
        price, volatility = map(float, values)
    except ValueError as exc:
        raise ResearchError("Invalid model values in American option response.") from exc
    if not math.isfinite(price) or price < 0 or not 0 <= volatility <= 10:
        raise ResearchError("Invalid model values in American option response.")
    reports = []
    ids = set()
    for line in lines[1:]:
        fields = line.split("\t")
        if len(fields) != 8:
            raise ResearchError("Invalid dividend report in American option response.")
        tag, identifier, announced, ex_at, pay_at, observed, unit, amount = fields
        ticks = _whole(amount)
        if (tag != "D" or not _IDENTITY.fullmatch(identifier) or identifier in ids
                or unit != currency or ticks <= 0):
            raise ResearchError("Invalid dividend report in American option response.")
        ids.add(identifier)
        reports.append(OptionCashDividend(identifier, _whole(announced), _whole(ex_at), _whole(pay_at),
                                          _whole(observed), unit, ticks))
    return AmericanOptionValuation(contract, currency, status, price, volatility, tuple(reports))


class ResearchEngine:
    """Run read-only analytics using a caller-selected native executable."""

    def __init__(self, executable: str | Path, *, timeout: float = 15.0):
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("Use a positive finite research timeout.")
        self._executable = Path(executable).expanduser().resolve(strict=True)
        if not self._executable.is_file():
            raise ValueError("Supply the MarketWeft research executable.")
        self._timeout = timeout

    def evaluate_formula(
        self,
        formula: str,
        csv: str,
        *,
        observed_through: int | None = None,
        functions: Sequence[FormulaFunction] = (),
    ) -> FormulaResult:
        """Return exact ticks or missing values along an observed OHLCV prefix."""
        if observed_through is not None and (
            type(observed_through) is not int or not _MIN_I64 <= observed_through <= _MAX_I64
        ):
            raise ValueError("Use a whole signed UTC second for the observed cutoff.")
        source = formula.encode("utf-8")
        history = csv.encode("utf-8")
        if len(source) > _MAX_SOURCE:
            raise ValueError("Formula exceeds 2,048 source bytes.")
        if len(history) > _MAX_CSV:
            raise ValueError("CSV exceeds 8 MiB.")
        library = _definitions(functions)
        cutoff = "" if observed_through is None else str(observed_through)
        header = f"marketweft-research\t1\t{len(source)}\t{len(library)}\t{cutoff}\n".encode("ascii")
        return _result(self._invoke(header + source + library + history))

    def evaluate_scalar_plugin(self, module: bytes, ticks: int) -> int:
        """Run a binary Wasm module on one signed millionth value."""
        if not isinstance(module, bytes):
            raise TypeError("Provide the scalar plugin as bytes.")
        if len(module) > 64 * 1024:
            raise ValueError("Scalar plugin exceeds 64 KiB.")
        if type(ticks) is not int or not _MIN_I64 <= ticks <= _MAX_I64:
            raise ValueError("Scalar plugin input must fit a signed 64-bit integer.")
        header = f"marketweft-scalar-plugin\t1\t{ticks}\n".encode("ascii")
        value, rows = _response(self._invoke(header + module, "scalar-plugin"), "marketweft-scalar-plugin")
        if rows:
            raise ResearchError("Unexpected rows in the scalar plugin response.")
        return _whole(value)

    def screen_universe(
        self,
        membership_csv: str,
        prices_csv: str,
        *,
        baseline_at: str,
        effective_at: str,
        known_at: str,
    ) -> ScreenResult:
        """Rank the effective universe using closes observed by the inclusive knowledge cutoff."""
        times = (baseline_at, effective_at, known_at)
        if any(not isinstance(timestamp, str) or not _UTC.fullmatch(timestamp) for timestamp in times):
            raise ValueError("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        membership = membership_csv.encode("utf-8")
        prices = prices_csv.encode("utf-8")
        if len(membership) > 1024 * 1024 or len(prices) > 2 * 1024 * 1024:
            raise ValueError("Membership and prices CSV exceed the screen input limits.")
        header = "\t".join(("marketweft-screen", "1", str(len(membership)), *times)).encode("ascii") + b"\n"
        return _screen_result(self._invoke(header + membership + prices, "screen"))

    def compare_universe_ranks(
        self,
        membership_csv: str,
        prices_csv: str,
        *,
        baseline_at: str,
        before_effective_at: str,
        before_known_at: str,
        after_effective_at: str,
        after_known_at: str,
    ) -> ScreenComparison:
        """Compare independent as-of rank snapshots using the same baseline timestamp."""
        times = (baseline_at, before_effective_at, before_known_at, after_effective_at, after_known_at)
        if any(not isinstance(timestamp, str) or not _UTC.fullmatch(timestamp) for timestamp in times):
            raise ValueError("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        membership, prices = membership_csv.encode("utf-8"), prices_csv.encode("utf-8")
        if len(membership) > 1024 * 1024 or len(prices) > 2 * 1024 * 1024:
            raise ValueError("Membership and prices CSV exceed the screen input limits.")
        header = "\t".join(("marketweft-rank-comparison", "1", str(len(membership)), *times)).encode("ascii") + b"\n"
        return _rank_comparison_result(self._invoke(header + membership + prices, "rank-compare"))

    def financial_snapshot(
        self,
        filings_csv: str,
        capitalization_csv: str | None = None,
        *,
        issuer: str,
        valuation_at: str,
        known_at: str,
    ) -> FinancialSnapshot:
        """Replay annual and quarterly vintages and trailing multiples at two UTC cutoffs."""
        if not isinstance(issuer, str) or not _IDENTITY.fullmatch(issuer):
            raise ValueError("Use a stable ASCII issuer ID.")
        times = (valuation_at, known_at)
        if any(not isinstance(timestamp, str) or not _UTC.fullmatch(timestamp) for timestamp in times):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ UTC timestamps for valuation and knowledge.")
        filings = filings_csv.encode("utf-8")
        caps = (_CAPITALIZATION_HEADER if capitalization_csv is None else capitalization_csv).encode("utf-8")
        if len(filings) > _MAX_FINANCIAL_CSV or len(caps) > _MAX_FINANCIAL_CSV:
            raise ValueError("Each financial report CSV must fit within 1 MiB.")
        header = "\t".join(("marketweft-financial", "1", str(len(filings)), issuer, *times)).encode("ascii") + b"\n"
        return _financial_result(self._invoke(header + filings + caps, "financial"), issuer)

    def option_snapshot(
        self,
        underlying_csv: str,
        quotes_csv: str,
        *,
        effective_at: str,
        known_at: str,
        max_age: int = 300,
    ) -> OptionChainSnapshot:
        """Return the eligible option quotes and model results at both inclusive UTC cutoffs."""
        underlying, quotes = _option_inputs(underlying_csv, quotes_csv, effective_at, known_at, max_age)
        header = "\t".join(("marketweft-options", "1", str(len(underlying)), effective_at, known_at, str(max_age)))
        return _option_snapshot(self._invoke(header.encode("ascii") + b"\n" + underlying + quotes, "options"))

    def american_option_valuation(
        self,
        underlying_csv: str,
        quotes_csv: str,
        *,
        contract_id: str,
        effective_at: str,
        known_at: str,
        max_age: int = 300,
        steps: int = 128,
        volatility: float | None = None,
        cash_dividends_csv: str | None = None,
    ) -> AmericanOptionValuation:
        """Price at the specified annual volatility or solve the observed bid–ask midpoint."""
        underlying, quotes = _option_inputs(underlying_csv, quotes_csv, effective_at, known_at, max_age)
        if not isinstance(contract_id, str) or not _IDENTITY.fullmatch(contract_id):
            raise ValueError("Select a valid American contract ID.")
        if type(steps) is not int or not 1 <= steps <= 256:
            raise ValueError("Use 1 to 256 whole pricing steps.")
        if volatility is not None and (type(volatility) not in {float, int} or not 0 <= volatility <= 10):
            raise ValueError("Use annual volatility from 0 to 10.")
        mode = "continuous" if cash_dividends_csv is None else "cash"
        cash = b"" if cash_dividends_csv is None else cash_dividends_csv.encode("utf-8")
        if len(cash) > _MAX_OPTION_DIVIDEND_CSV:
            raise ValueError("Cash dividends CSV must fit within 1 MiB.")
        header = "\t".join(("marketweft-american-option", "1", str(len(underlying)), str(len(quotes)),
                            contract_id, effective_at, known_at, str(max_age), str(steps),
                            "" if volatility is None else str(volatility), mode))
        response = self._invoke(header.encode("ascii") + b"\n" + underlying + quotes + cash, "american-option")
        return _american_option_valuation(response, contract_id)

    def _invoke(self, request: bytes, *arguments: str) -> bytes:
        try:
            process = subprocess.run(
                [self._executable, *arguments], input=request,
                capture_output=True, timeout=self._timeout, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ResearchError("MarketWeft research evaluation timed out.") from exc
        except OSError as exc:
            raise ResearchError("Could not start the MarketWeft research executable.") from exc
        if process.returncode:
            details = process.stderr.decode("utf-8", errors="replace").strip()
            raise ResearchError(details or "MarketWeft research evaluation exited unsuccessfully.")
        return process.stdout
