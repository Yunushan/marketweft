"""Read-only research backed by the local MarketWeft Rust engine."""

from dataclasses import dataclass
from datetime import date, datetime
import math
from pathlib import Path
import re
import subprocess
from typing import Sequence

__all__ = [
    "AmericanOptionValuation", "OptionCashDividend",
    "DividendLedgerEvent", "DividendLedgerMovement", "DividendLedgerSnapshot",
    "EquityConcentration", "EquityConcentrationPosition", "EquityConcentrationSnapshot",
    "EquityTargetDrift", "EquityTargetReport", "EquityTargetSnapshot",
    "FinancialFiling", "FinancialMarketCap", "FinancialMultiple", "FinancialMultiples",
    "FinancialSnapshot", "FinancialTrailing",
    "FormulaFunction", "FormulaResult", "FormulaRow",
    "FxAmount", "FxCurrencyValue", "FxRateEvidence", "FxTranslation",
    "ListingDownsideRiskPoint", "ListingDownsideRiskSnapshot",
    "MacroRecord", "MacroRelease",
    "MonthlyClose", "MonthlyReturn",
    "NotionalBar", "NotionalBarsSnapshot",
    "OptionChainAnalytics", "OptionChainQuote", "OptionChainSnapshot", "OptionUnderlyingQuote",
    "PortfolioAllocationListing", "PortfolioAllocationSample", "PortfolioAllocationSnapshot",
    "PortfolioScenarioCoverage", "PortfolioScenarioPath", "PortfolioScenarioResult", "ScenarioAllocation",
    "RecordedTradePrint", "RecordedTradePrintsSnapshot",
    "ResearchEngine", "ResearchError", "ScalarPluginPoint",
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
_MAX_SCALAR_PLUGIN = 64 * 1024
_MAX_SCALAR_SERIES = 256
_MONTHLY_PROTOCOL = "marketweft-monthly-returns"
_MACRO_PROTOCOL = "marketweft-macro-calendar"
_NOTIONAL_BARS_PROTOCOL = "marketweft-notional-bars"
_TRADE_PRINTS_PROTOCOL = "marketweft-recorded-trade-prints"
_DIVIDEND_LEDGER_PROTOCOL = "marketweft-dividend-ledger"
_DIVIDEND_EVENT_KINDS = ("report", "ex", "pay", "entitlement")
_MAX_DIVIDEND_CSV = 1024 * 1024
_MAX_DIVIDEND_SHARES = 1_000_000
_LISTING_DOWNSIDE_RISK_PROTOCOL = "marketweft-listing-downside-risk"
_ALLOCATION_PROTOCOL = "marketweft-portfolio-allocation"
_PORTFOLIO_PROTOCOL = "marketweft-portfolio-scenarios"
_FX_PROTOCOL = "marketweft-portfolio-fx"
_CONCENTRATION_PROTOCOL = "marketweft-equity-concentration"
_EQUITY_TARGET_PROTOCOL = "marketweft-equity-target-drift"
_MAX_CONCENTRATION_POSITIONS = 1_000
_MAX_EQUITY_TARGET_ROWS = 10_000 + _MAX_CONCENTRATION_POSITIONS
_FULL_WEIGHT_MICROS = 100_000_000
_I128_LIMIT = 1 << 127
_MAX_FX_CURRENCIES = 26 ** 3
_PORTFOLIO_START = r"[0-9]{1,20}(?:\.[0-9]{1,6})?"
_MAX_MACRO_CSV = 1024 * 1024
_MAX_MACRO_REPORTS = 10_000
_MAX_MACRO_TICKS = 10 ** 27
_MAX_MONTHLY_YEARS = 30
_MAX_PRICE_TICKS = 2_000_000_000_000_000
_EPOCH_ORDINAL = date(1970, 1, 1).toordinal()
_MIN_UTC_SECOND = (date.min.toordinal() - _EPOCH_ORDINAL) * 86400
_MAX_UTC_SECOND = (date.max.toordinal() - _EPOCH_ORDINAL + 1) * 86400 - 1
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
class ScalarPluginPoint:
    time: int
    close: int
    value: int


@dataclass(frozen=True)
class MonthlyClose:
    at: int
    ticks: int


@dataclass(frozen=True)
class MonthlyReturn:
    year: int
    month: int
    window: str
    prior: MonthlyClose | None
    current: MonthlyClose | None
    percent_micros: int | None


@dataclass(frozen=True)
class MacroRecord:
    record_id: str
    published_at: int
    observed_at: int
    scheduled_at: int | None
    value: int | None
    supersedes: str | None


@dataclass(frozen=True)
class MacroRelease:
    release_id: str
    series_id: str
    reference_date: int
    unit: str
    schedule: MacroRecord | None
    forecast: MacroRecord | None
    actual_history: tuple[MacroRecord, ...]


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
class ScenarioAllocation:
    listing_id: str
    weight_basis_points: int


@dataclass(frozen=True)
class PortfolioAllocationListing:
    listing_id: str
    known_returns: int
    equal_basis_points: int | None
    optimized_basis_points: int | None


@dataclass(frozen=True)
class PortfolioAllocationSample:
    equal_mean: float
    equal_volatility: float
    optimized_mean: float
    optimized_volatility: float
    variance_gap: float
    iterations: int


@dataclass(frozen=True)
class PortfolioAllocationSnapshot:
    from_at: int
    through_at: int
    known_at: int
    interval_seconds: int
    expected_returns: int
    common_returns: int
    listings: tuple[PortfolioAllocationListing, ...]
    sample: PortfolioAllocationSample | None
    maximum_weight_basis_points: int | None = None


@dataclass(frozen=True)
class NotionalBar:
    first_observed_at: int
    available_at: int
    first_sequence: int
    last_sequence: int
    observed_trades: int
    complete: bool
    gross_notional_trillionths: int
    open_ticks: int
    high_ticks: int
    low_ticks: int
    close_ticks: int
    volume_ticks: int


@dataclass(frozen=True)
class NotionalBarsSnapshot:
    instrument: str
    target_notional_ticks: int
    known_at: int | None
    bars: tuple[NotionalBar, ...]


@dataclass(frozen=True)
class RecordedTradePrint:
    executed_at: int
    observed_at: int
    sequence: int
    price_ticks: int
    size_ticks: int
    reported_side: str


@dataclass(frozen=True)
class RecordedTradePrintsSnapshot:
    instrument: str
    known_at: int | None
    prints: tuple[RecordedTradePrint, ...]


@dataclass(frozen=True)
class DividendLedgerMovement:
    currency: str
    receivable_delta: int
    cash_delta: int
    receivable: int
    cash: int
    withholding_delta: int | None
    withholding: int | None


@dataclass(frozen=True)
class DividendLedgerEvent:
    at: int
    kind: str
    dividend_id: str
    announced_at: int
    ex_at: int
    pay_at: int
    observed_at: int
    currency: str
    amount_per_share: int
    entitled_shares: int | None
    withholding_per_share: int | None
    movements: tuple[DividendLedgerMovement, ...]


@dataclass(frozen=True)
class DividendLedgerSnapshot:
    instrument: str
    known_at: int | None
    fixed_shares: int | None
    events: tuple[DividendLedgerEvent, ...]


@dataclass(frozen=True)
class ListingDownsideRiskPoint:
    from_at: int
    through_at: int
    expected_returns: int
    left_returns: int
    right_returns: int
    paired_returns: int
    left_loss_returns: int
    right_loss_returns: int
    left_volatility: float | None
    right_volatility: float | None
    correlation: float | None
    left_downside: float | None
    right_downside: float | None


@dataclass(frozen=True)
class ListingDownsideRiskSnapshot:
    left_listing_id: str
    right_listing_id: str
    from_at: int
    through_at: int
    known_at: int
    interval_seconds: int
    window_periods: int
    volatility_periods: int
    rows: tuple[ListingDownsideRiskPoint, ...]


@dataclass(frozen=True)
class PortfolioScenarioCoverage:
    listing_id: str
    weight_basis_points: int
    known_returns: int


@dataclass(frozen=True)
class PortfolioScenarioPath:
    ending_value: int
    drawdown_millionths: int
    fees: int


@dataclass(frozen=True)
class PortfolioScenarioResult:
    expected_vectors: int
    eligible_vectors: int
    block_size: int
    eligible_blocks: int
    loss_paths: int
    coverage: tuple[PortfolioScenarioCoverage, ...]
    ending_value: tuple[int, int, int]
    drawdown_millionths: tuple[int, int, int]
    fees: tuple[int, int, int]
    paths: tuple[PortfolioScenarioPath, ...]


@dataclass(frozen=True)
class FxAmount:
    currency: str
    subtotal: int


@dataclass(frozen=True)
class FxRateEvidence:
    base_currency: str
    quote_currency: str
    rate_at: int
    observed_at: int
    rate_ticks: int
    inverted: bool


@dataclass(frozen=True)
class FxCurrencyValue:
    currency: str
    subtotal: int
    converted: int | None
    rate: FxRateEvidence | None


@dataclass(frozen=True)
class FxTranslation:
    reporting_currency: str
    known_subtotal: int | None
    rows: tuple[FxCurrencyValue, ...]


@dataclass(frozen=True)
class EquityConcentrationPosition:
    listing_id: str
    mark: int | None
    rank: int | None
    weight_micros: int | None


@dataclass(frozen=True)
class EquityConcentration:
    currency: str | None
    gross_mark: int | None
    positions: tuple[EquityConcentrationPosition, ...]


@dataclass(frozen=True)
class EquityConcentrationSnapshot:
    effective_at: int
    known_at: int
    groups: tuple[EquityConcentration, ...]


@dataclass(frozen=True)
class EquityTargetReport:
    effective_at: int
    observed_at: int
    weight_micros: int | None


@dataclass(frozen=True)
class EquityTargetDrift:
    currency: str | None
    listing_id: str
    in_equity: bool
    actual_weight_micros: int | None
    target: EquityTargetReport | None
    drift_micros: int | None


@dataclass(frozen=True)
class EquityTargetSnapshot:
    effective_at: int
    known_at: int
    rows: tuple[EquityTargetDrift, ...]


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


def _validate_scalar_module(module: bytes) -> None:
    if not isinstance(module, bytes):
        raise TypeError("Provide the scalar plugin as bytes.")
    if len(module) > _MAX_SCALAR_PLUGIN:
        raise ValueError("Scalar plugin exceeds 64 KiB.")


def _response(output: bytes, protocol: str, version: str = "1") -> tuple[str, list[str]]:
    try:
        response = output.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ResearchError("Research response is not ASCII.") from exc
    header, newline, body = response.partition("\n")
    fields = header.split("\t")
    if not newline or len(fields) != 3 or fields[:2] != [protocol, version]:
        raise ResearchError("Invalid research response or protocol version.")
    if body and not body.endswith("\n"):
        raise ResearchError("Incomplete research result.")
    return fields[2], body[:-1].split("\n") if body else []


def _scenario_values(row: str, tag: str) -> tuple[int, int, int]:
    fields = row.split("\t")
    if len(fields) != 4 or fields[0] != tag:
        raise ResearchError("Invalid portfolio scenario result row.")
    values = (_whole(fields[1]), _whole(fields[2]), _whole(fields[3]))
    if any(value < 0 for value in values):
        raise ResearchError("Portfolio scenario values must be nonnegative.")
    return values


def _i128(text: str) -> int:
    if not _WIDE.fullmatch(text):
        raise ResearchError("Invalid fixed-point value in research response.")
    value = int(text)
    if not -_I128_LIMIT <= value < _I128_LIMIT:
        raise ResearchError("Research value exceeds the signed 128-bit range.")
    return value


def _concentration_group(currency: str, gross: str, rows: list[EquityConcentrationPosition]) -> EquityConcentration:
    ordered = sorted(rows, key=lambda row: (row.mark is None, -abs(row.mark or 0), row.listing_id))
    marks = [abs(row.mark) for row in rows if row.mark is not None]
    total = _i128(gross) if gross else None
    if not rows or ordered != rows or total != (sum(marks) if marks else None) or (not currency and marks):
        raise ResearchError("Invalid or inconsistent equity concentration group.")
    for index, row in enumerate(rows, 1):
        rank = weight = None
        if total and row.mark is not None:
            rank = index
            weight = (abs(row.mark) * 100_000_000 + total // 2) // total
        if (row.rank, row.weight_micros) != (rank, weight):
            raise ResearchError("Equity concentration weights do not match the known gross mark.")
    return EquityConcentration(currency or None, total, tuple(rows))


def _equity_concentration(output: bytes, effective: int, known: int) -> EquityConcentrationSnapshot:
    count, lines = _response(output, _CONCENTRATION_PROTOCOL)
    if not lines or len(lines) > 1 + 2 * _MAX_CONCENTRATION_POSITIONS:
        raise ResearchError("Invalid equity concentration row count.")
    header = lines[0].split("\t")
    if len(header) != 3 or header[0] != "H" or tuple(map(_whole, header[1:])) != (effective, known):
        raise ResearchError("Equity concentration cutoffs do not match the request.")
    blocks: list[tuple[str, str, list[EquityConcentrationPosition]]] = []
    listings: set[str] = set()
    for line in lines[1:]:
        fields = line.split("\t")
        if fields[0] == "G" and len(fields) == 3:
            _, currency, gross = fields
            if (currency and not _CURRENCY.fullmatch(currency)) or (blocks and currency <= blocks[-1][0]):
                raise ResearchError("Invalid equity concentration currencies.")
            blocks.append((currency, gross, []))
        elif fields[0] == "E" and len(fields) == 5 and blocks:
            _, listing, mark, rank, weight = fields
            if not _IDENTITY.fullmatch(listing) or listing in listings:
                raise ResearchError("Invalid or repeated holding in equity concentration response.")
            listings.add(listing)
            blocks[-1][2].append(EquityConcentrationPosition(
                listing, _i128(mark) if mark else None, _whole(rank) if rank else None,
                _whole(weight) if weight else None,
            ))
        else:
            raise ResearchError("Invalid equity concentration response row.")
    if len(blocks) != _whole(count) or len(listings) > _MAX_CONCENTRATION_POSITIONS:
        raise ResearchError("Invalid equity concentration row count.")
    return EquityConcentrationSnapshot(effective, known, tuple(_concentration_group(*block) for block in blocks))


def _target_report(
    effective: str, observed: str, weight: str, cutoff: int, known: int,
) -> EquityTargetReport | None:
    if not effective and not observed and not weight:
        return None
    at, since = _whole(effective), _whole(observed)
    amount = _whole(weight) if weight else None
    if (not _MIN_UTC_SECOND <= at <= cutoff or not _MIN_UTC_SECOND <= since <= known
            or (amount is not None and not 0 <= amount <= _FULL_WEIGHT_MICROS)):
        raise ResearchError("Invalid equity target report evidence.")
    return EquityTargetReport(at, since, amount)


def _equity_target_snapshot(output: bytes, effective: int, known: int) -> EquityTargetSnapshot:
    count, lines = _response(output, _EQUITY_TARGET_PROTOCOL)
    if not lines or not 0 <= _whole(count) == len(lines) - 1 <= _MAX_EQUITY_TARGET_ROWS:
        raise ResearchError("Invalid equity target row count.")
    header = lines[0].split("\t")
    if len(header) != 3 or header[0] != "H" or tuple(map(_whole, header[1:])) != (effective, known):
        raise ResearchError("Equity target cutoffs do not match the request.")
    rows = []
    previous = None
    totals: dict[str, int] = {}
    for line in lines[1:]:
        fields = line.split("\t")
        if len(fields) != 8:
            raise ResearchError("Invalid equity target response row.")
        currency, listing, status, actual, at, since, weight, drift = fields
        key = (currency, listing)
        if ((currency and not _CURRENCY.fullmatch(currency)) or not _IDENTITY.fullmatch(listing)
                or status not in ("0", "1") or (previous is not None and key <= previous)):
            raise ResearchError("Invalid or unordered equity target response row.")
        previous = key
        target = _target_report(at, since, weight, effective, known)
        in_equity = status == "1"
        actual_weight = _whole(actual) if actual else None
        target_weight = target.weight_micros if target else None
        if ((not in_equity and target is None) or (target is not None and not currency)
                or (actual_weight is not None
                    and (not in_equity or not currency or not 0 <= actual_weight <= _FULL_WEIGHT_MICROS))):
            raise ResearchError("Invalid equity weight evidence.")
        difference = _whole(drift) if drift else None
        expected = actual_weight - target_weight if actual_weight is not None and target_weight is not None else None
        if difference != expected:
            raise ResearchError("Equity target drift does not match the reported weights.")
        if target_weight is not None:
            totals[currency] = totals.get(currency, 0) + target_weight
            if totals[currency] > _FULL_WEIGHT_MICROS:
                raise ResearchError("Equity target weights exceed 100% in the response.")
        rows.append(EquityTargetDrift(currency or None, listing, in_equity, actual_weight, target, difference))
    return EquityTargetSnapshot(effective, known, tuple(rows))


def _fx_translation(
    output: bytes, reporting: str, effective: int, known: int, amounts: dict[str, int],
) -> FxTranslation:
    count, rows = _response(output, _FX_PROTOCOL)
    if _whole(count) != len(amounts) or len(rows) != len(amounts) + 1:
        raise ResearchError("Invalid portfolio FX currency count.")
    header = rows[0].split("\t")
    if len(header) != 3 or header[:2] != ["H", reporting]:
        raise ResearchError("Invalid portfolio FX reporting currency.")
    subtotal = _i128(header[2]) if header[2] else None
    values = []
    converted_amounts = []
    for (currency, source), row in zip(sorted(amounts.items()), rows[1:]):
        fields = row.split("\t")
        if len(fields) not in (4, 10) or fields[:2] != ["R", currency] or _i128(fields[2]) != source:
            raise ResearchError("Portfolio FX source evidence does not match the request.")
        converted = _i128(fields[3]) if fields[3] else None
        rate = None
        if len(fields) == 10:
            base, quote, at, observed, ticks, orientation = fields[4:]
            invert = orientation == "1"
            if (orientation not in ("0", "1") or (base, quote) != ((reporting, currency) if invert else (currency, reporting))
                    or currency == reporting or converted is None):
                raise ResearchError("Invalid portfolio FX quote orientation.")
            rate_at, observed_at, rate_ticks = map(_whole, (at, observed, ticks))
            if (not _MIN_UTC_SECOND <= rate_at <= effective or not rate_at <= observed_at <= known
                    or not 1 <= rate_ticks <= _MAX_PRICE_TICKS):
                raise ResearchError("Portfolio FX rate evidence falls outside the applied cutoffs or price range.")
            rate = FxRateEvidence(base, quote, rate_at, observed_at, rate_ticks, invert)
        elif converted != (source if currency == reporting else None):
            raise ResearchError("Invalid identity or missing FX currency amount.")
        if converted is not None:
            converted_amounts.append(converted)
        values.append(FxCurrencyValue(currency, source, converted, rate))
    if subtotal != (sum(converted_amounts) if converted_amounts else None):
        raise ResearchError("Portfolio FX subtotal does not match the converted currency amounts.")
    return FxTranslation(reporting, subtotal, tuple(values))


def _notional_bars(output: bytes, instrument: str, target: int, cutoff: int | None) -> NotionalBarsSnapshot:
    count, rows = _response(output, _NOTIONAL_BARS_PROTOCOL)
    count = _whole(count)
    if not 0 <= count <= 100_000 or len(rows) != count + 1:
        raise ResearchError("Invalid notional bars row count.")
    if rows[0].split("\t") != ["T", instrument, str(target), "" if cutoff is None else str(cutoff)]:
        raise ResearchError("Notional bar settings differ from the request.")
    bars = []
    previous_time, previous_sequence, total_trades = _MIN_UTC_SECOND, 0, 0
    for index, row in enumerate(rows[1:]):
        fields = row.split("\t")
        if len(fields) != 12:
            raise ResearchError("Invalid notional bar row.")
        start, available = map(_whole, fields[:2])
        first, last = map(_i128, fields[2:4])
        trades, complete = map(_whole, fields[4:6])
        gross = _i128(fields[6])
        opened, high, low, closed, volume = map(_whole, fields[7:])
        total_trades += trades
        if (not previous_time <= start <= available <= (_MAX_UTC_SECOND if cutoff is None else cutoff)
                or not previous_sequence < first <= last < 1 << 64
                or not 1 <= trades <= last - first + 1 or total_trades > 100_000
                or not -_MAX_PRICE_TICKS <= low <= min(opened, closed)
                or not max(opened, closed) <= high <= _MAX_PRICE_TICKS
                or not 1 <= volume <= _MAX_PRICE_TICKS
                or not 0 <= gross <= max(abs(low), abs(high)) * volume
                or complete != int(gross >= target * 1_000_000)
                or not complete and index < count - 1):
            raise ResearchError("Invalid or inconsistent notional bar evidence.")
        bars.append(NotionalBar(start, available, first, last, trades, bool(complete), gross,
                                opened, high, low, closed, volume))
        previous_time, previous_sequence = available, last
    return NotionalBarsSnapshot(instrument, target, cutoff, tuple(bars))


def _recorded_trade_prints(output: bytes, instrument: str, cutoff: int | None) -> RecordedTradePrintsSnapshot:
    count, rows = _response(output, _TRADE_PRINTS_PROTOCOL)
    total = _whole(count)
    if not 0 <= total <= 100_000 or len(rows) != total + 1:
        raise ResearchError("Invalid trade print count.")
    if rows[0].split("\t") != ["T", instrument, "" if cutoff is None else str(cutoff)]:
        raise ResearchError("Trade print settings differ from the request.")
    last_observed, last_sequence = _MIN_UTC_SECOND, 0
    latest = _MAX_UTC_SECOND if cutoff is None else cutoff
    prints = []
    for row in rows[1:]:
        fields = row.split("\t")
        if len(fields) != 6:
            raise ResearchError("Invalid trade print row.")
        executed, observed = map(_whole, fields[:2])
        sequence = _i128(fields[2])
        price, size = map(_whole, fields[3:5])
        side = fields[5]
        if (not _MIN_UTC_SECOND <= executed <= observed <= latest or observed < last_observed
                or not last_sequence < sequence < 1 << 64
                or not -_MAX_PRICE_TICKS <= price <= _MAX_PRICE_TICKS or not 1 <= size <= _MAX_PRICE_TICKS
                or side not in ("buy", "sell", "unknown")):
            raise ResearchError("Trade print evidence is inconsistent with the capture or cutoff.")
        prints.append(RecordedTradePrint(executed, observed, sequence, price, size, side))
        last_observed, last_sequence = observed, sequence
    return RecordedTradePrintsSnapshot(instrument, cutoff, tuple(prints))


def _dividend_ledger(output: bytes, instrument: str, cutoff: int | None, fixed: int | None) -> DividendLedgerSnapshot:
    count, rows = _response(output, _DIVIDEND_LEDGER_PROTOCOL)
    total = _whole(count)
    if not 0 <= total <= 50_000 or len(rows) != total + 1:
        raise ResearchError("Invalid dividend event count.")
    mode = "dated" if fixed is None else "fixed"
    fields = ["D", instrument, "" if cutoff is None else str(cutoff), mode, "" if fixed is None else str(fixed)]
    if rows[0].split("\t") != fields:
        raise ResearchError("Dividend ledger settings differ from the request.")

    latest = _MAX_UTC_SECOND if cutoff is None else cutoff
    prior = (_MIN_UTC_SECOND, "")
    reported = None
    balances: dict[str, tuple[int, int, int]] = {}
    events = []
    for row in rows[1:]:
        fields = row.split("\t")
        if len(fields) < 10:
            raise ResearchError("Invalid dividend event row.")
        at, kind_index = map(_whole, fields[:2])
        dividend_id, currency = fields[2], fields[7]
        announced, ex, pay, observed = map(_whole, fields[3:7])
        amount = _whole(fields[8])
        shares = _whole(fields[9]) if fields[9] else None
        if (not 0 <= kind_index < len(_DIVIDEND_EVENT_KINDS) or not _IDENTITY.fullmatch(dividend_id)
                or not _CURRENCY.fullmatch(currency) or not _MIN_UTC_SECOND <= announced <= observed <= at <= latest
                or not _MIN_UTC_SECOND <= ex <= pay <= _MAX_UTC_SECOND or not 0 <= amount <= _MAX_PRICE_TICKS
                or (at, dividend_id) < prior or shares is not None and not 0 <= shares <= _MAX_DIVIDEND_SHARES
                or fixed is not None and shares != fixed):
            raise ResearchError("Dividend evidence is inconsistent with the cutoff or requested entitlement.")
        kind = _DIVIDEND_EVENT_KINDS[kind_index]
        if (kind == "report" and at != observed or kind == "ex" and (at != ex or at <= observed or ex == pay)
                or kind == "pay" and (at != pay or at <= observed)
                or kind == "entitlement" and (at < ex or fixed is not None)):
            raise ResearchError("Dividend evidence has an invalid event time.")
        movements = fields[10:]
        withholding = _whole(movements.pop(0)[2:]) if movements and movements[0].startswith("W=") else None
        has_withholding = withholding is not None
        if (has_withholding and not 0 <= withholding <= amount
                or reported is not None and reported != has_withholding or len(movements) > 2):
            raise ResearchError("Invalid dividend withholding or currency movements.")
        reported = has_withholding
        changes = []
        seen = set()
        for movement in movements:
            components = movement.split(",")
            code = components[0]
            if len(components) != (7 if has_withholding else 5) or not _CURRENCY.fullmatch(code) or code in seen:
                raise ResearchError("Invalid dividend movement fields.")
            receivable_delta, cash_delta, receivable, cash, *withheld = map(_i128, components[1:])
            withholding_delta, withheld_balance = withheld if has_withholding else (None, None)
            old_receivable, old_cash, old_withheld = balances.get(code, (0, 0, 0))
            new_withheld = 0 if withheld_balance is None else withheld_balance
            if (min(receivable, cash, new_withheld) < 0 or receivable != old_receivable + receivable_delta
                    or cash != old_cash + cash_delta or new_withheld != old_withheld + (withholding_delta or 0)):
                raise ResearchError("Dividend movement does not reconcile with its prior balance.")
            seen.add(code)
            balances[code] = (receivable, cash, new_withheld)
            changes.append(DividendLedgerMovement(code, receivable_delta, cash_delta, receivable, cash,
                                                   withholding_delta, withheld_balance))
        events.append(DividendLedgerEvent(at, kind, dividend_id, announced, ex, pay, observed, currency,
                                          amount, shares, withholding, tuple(changes)))
        prior = (at, dividend_id)
    return DividendLedgerSnapshot(instrument, cutoff, fixed, tuple(events))


def _listing_downside_risk(
    output: bytes, listings: tuple[str, str], times: tuple[int, int, int], settings: tuple[int, int, int],
) -> ListingDownsideRiskSnapshot:
    count, rows = _response(output, _LISTING_DOWNSIDE_RISK_PROTOCOL)
    start, end, _ = times
    interval, window, _ = settings
    expected_count = max(0, (end - start) // interval - window + 1)
    if _whole(count) != expected_count or len(rows) != expected_count + 1:
        raise ResearchError("Invalid listing risk row count.")
    if rows[0].split("\t") != ["H", *map(str, times), *listings, *map(str, settings)]:
        raise ResearchError("Listing risk evidence differs from the requested cutoffs or settings.")

    results = []
    for index, row in enumerate(rows[1:]):
        fields = row.split("\t")
        if len(fields) != 14 or fields[0] != "R":
            raise ResearchError("Invalid listing risk row.")
        beginning, through, expected, left, right, paired, left_losses, right_losses = map(_whole, fields[1:9])
        if (beginning != start + index * interval or through != beginning + window * interval
                or expected != window or not 0 <= paired <= min(left, right) <= max(left, right) <= expected
                or not 0 <= left_losses <= left or not 0 <= right_losses <= right):
            raise ResearchError("Listing risk evidence is outside the requested window bounds.")
        try:
            left_vol, right_vol, correlation, left_down, right_down = (
                float(value) if value else None for value in fields[9:]
            )
        except ValueError as error:
            raise ResearchError("Invalid listing risk statistics.") from error
        for metric, available, minimum in ((left_vol, left, 2), (right_vol, right, 2),
                                           (left_down, left, 1), (right_down, right, 1)):
            if (metric is None) != (available < minimum) or (
                metric is not None and (not math.isfinite(metric) or metric < 0.0)
            ):
                raise ResearchError("Listing risk statistics do not match the available returns.")
        if (correlation is not None and (paired < 2 or not -1.0 <= correlation <= 1.0)
                or left_down is not None and (left_down == 0.0) != (left_losses == 0)
                or right_down is not None and (right_down == 0.0) != (right_losses == 0)):
            raise ResearchError("Listing risk statistics do not match the available losses or pairs.")
        results.append(ListingDownsideRiskPoint(
            beginning, through, expected, left, right, paired, left_losses, right_losses,
            left_vol, right_vol, correlation, left_down, right_down,
        ))
    return ListingDownsideRiskSnapshot(*listings, *times, *settings, tuple(results))


def _portfolio_allocation(
    output: bytes, listing_ids: tuple[str, ...], times: tuple[int, int, int], interval: int,
    maximum: int | None = None,
) -> PortfolioAllocationSnapshot:
    count, rows = _response(output, _ALLOCATION_PROTOCOL, "1" if maximum is None else "2")
    if _whole(count) != len(listing_ids) or len(rows) != len(listing_ids) + 3:
        raise ResearchError("Invalid portfolio allocation row count.")
    settings = ["T", *map(str, times), str(interval)]
    if maximum is not None:
        settings.append(str(maximum))
    if rows[0].split("\t") != settings:
        raise ResearchError("Portfolio allocation cutoffs or maximum weight differ from the request.")
    coverage = rows[1].split("\t")
    if len(coverage) != 2:
        raise ResearchError("Invalid portfolio allocation coverage.")
    expected, common = map(_whole, coverage)
    if not 0 <= common <= expected == (times[1] - times[0]) // interval <= 100_000:
        raise ResearchError("Portfolio allocation coverage is outside its requested bounds.")

    sample = None
    if common < 2:
        if rows[2]:
            raise ResearchError("Portfolio estimates require two common returns.")
    else:
        metrics = rows[2].split("\t")
        if len(metrics) != 6:
            raise ResearchError("Invalid portfolio allocation statistics.")
        try:
            numeric = [float(value) for value in metrics[:-1]]
        except ValueError as error:
            raise ResearchError("Invalid portfolio allocation statistics.") from error
        iteration_count = _whole(metrics[-1])
        if (any(not math.isfinite(value) for value in numeric)
                or not 0.0 <= numeric[3] <= numeric[1] or numeric[4] < 0.0
                or not 0 <= iteration_count <= 20_000):
            raise ResearchError("Portfolio allocation statistics are outside their valid bounds.")
        sample = PortfolioAllocationSample(*numeric, iteration_count)

    listings = []
    for listing, row in zip(sorted(listing_ids), rows[3:]):
        fields = row.split("\t")
        if len(fields) != 4 or fields[0] != listing:
            raise ResearchError("Portfolio allocation evidence must match the requested listings.")
        known = _whole(fields[1])
        if not common <= known <= expected:
            raise ResearchError("Invalid portfolio allocation listing coverage.")
        weights = (None, None)
        if sample is None:
            if any(fields[2:]):
                raise ResearchError("Portfolio weights require two common returns.")
        else:
            weights = tuple(map(_whole, fields[2:]))
            if any(not 0 <= weight <= (10_000 if maximum is None else maximum) for weight in weights):
                raise ResearchError("Invalid portfolio allocation weights.")
        listings.append(PortfolioAllocationListing(listing, known, *weights))
    if sample is not None:
        equal, optimized = zip(*[(row.equal_basis_points, row.optimized_basis_points) for row in listings])
        if sum(equal) != 10_000 or sum(optimized) != 10_000 or max(equal) - min(equal) > 1:
            raise ResearchError("Portfolio allocation weights must sum to 10,000 basis points.")
    return PortfolioAllocationSnapshot(*times, interval, expected, common, tuple(listings), sample, maximum)


def _portfolio_scenarios(
    output: bytes, allocations: tuple[ScenarioAllocation, ...], paths: int, block_size: int,
) -> PortfolioScenarioResult:
    count, rows = _response(output, _PORTFOLIO_PROTOCOL)
    if _whole(count) != paths or len(rows) != 4 + len(allocations) + paths:
        raise ResearchError("Invalid portfolio scenario path or result count.")
    header = rows[0].split("\t")
    if header[0] != "H" or len(header) != (4 if block_size == 1 else 6):
        raise ResearchError("Invalid portfolio scenario summary.")
    expected, eligible, losses = map(_whole, header[1:4])
    size, blocks = (1, eligible) if block_size == 1 else tuple(map(_whole, header[4:]))
    if not (1 <= blocks <= eligible <= expected <= 100_000 and size == block_size and 0 <= losses <= paths):
        raise ResearchError("Portfolio scenario coverage is outside its requested bounds.")

    end_coverage = 1 + len(allocations)
    coverage = []
    for allocation, row in zip(sorted(allocations, key=lambda entry: entry.listing_id), rows[1:end_coverage]):
        fields = row.split("\t")
        if len(fields) != 4 or fields[:3] != ["A", allocation.listing_id, str(allocation.weight_basis_points)]:
            raise ResearchError("Portfolio scenario coverage must match the requested allocations.")
        known = _whole(fields[3])
        if not eligible <= known <= expected:
            raise ResearchError("Invalid portfolio scenario listing coverage.")
        coverage.append(PortfolioScenarioCoverage(allocation.listing_id, allocation.weight_basis_points, known))

    ending, drawdown, fees = (_scenario_values(row, tag)
                              for row, tag in zip(rows[end_coverage:end_coverage + 3], "VDF"))
    outcomes = tuple(PortfolioScenarioPath(*_scenario_values(row, "P")) for row in rows[end_coverage + 3:])
    return PortfolioScenarioResult(expected, eligible, size, blocks, losses, tuple(coverage),
                                   ending, drawdown, fees, outcomes)


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


def _month_second(index: int) -> int:
    year, month = divmod(index, 12)
    ordinal = date.max.toordinal() + 1 if year == 9999 else date(year + 1, month + 1, 1).toordinal()
    return (ordinal - _EPOCH_ORDINAL) * 86400


def _epoch_second(instant: datetime) -> int:
    return ((instant.toordinal() - _EPOCH_ORDINAL) * 86400
            + instant.hour * 3600 + instant.minute * 60 + instant.second)


def _monthly_close(at: str, ticks: str, start: int, end: int, through: int) -> MonthlyClose | None:
    if not at and not ticks:
        return None
    second, amount = _whole(at), _whole(ticks)
    if not start <= second < end or second > through or abs(amount) > _MAX_PRICE_TICKS:
        raise ResearchError("Monthly return close lies outside its price or UTC bounds.")
    return MonthlyClose(second, amount)


def _monthly_returns(output: bytes, first_year: int, last_year: int, through: int) -> tuple[MonthlyReturn, ...]:
    count, lines = _response(output, _MONTHLY_PROTOCOL)
    if len(lines) != 12 * (last_year - first_year + 1) or _whole(count) != len(lines):
        raise ResearchError("Invalid monthly returns row count.")
    results: list[MonthlyReturn] = []
    for index, line in enumerate(lines, start=(first_year - 1) * 12):
        fields = line.split("\t")
        if len(fields) != 8:
            raise ResearchError("Invalid monthly return response row.")
        year_text, month_text, window, prior_at, prior_ticks, close_at, close_ticks, percent = fields
        year, month = _whole(year_text), _whole(month_text)
        start, end = _month_second(index), _month_second(index + 1)
        expected = "future" if through < start else "month-to-date" if through < end - 1 else "complete"
        if (year, month, window) != (index // 12 + 1, index % 12 + 1, expected):
            raise ResearchError("Invalid monthly return date or window.")
        prior = _monthly_close(prior_at, prior_ticks, _month_second(max(0, index - 1)), start, through)
        current = _monthly_close(close_at, close_ticks, start, end, through)
        if (window == "future" and prior is not None) or (window != "future" and results and prior != results[-1].current):
            raise ResearchError("Inconsistent prior close in monthly returns response.")
        available = prior is not None and prior.ticks != 0 and current is not None
        if bool(percent) != available or (percent and not _WIDE.fullmatch(percent)):
            raise ResearchError("Invalid percentage in monthly returns response.")
        value = int(percent) if percent else None
        if value is not None and not -(1 << 127) <= value < (1 << 127):
            raise ResearchError("Invalid percentage in monthly returns response.")
        results.append(MonthlyReturn(year, month, window, prior, current, value))
    return tuple(results)


def _macro_release(group: list[list[str]], published_limit: int, known_limit: int) -> MacroRelease:
    _, release_id, series_id, reference, unit = group[0]
    reference_date = _whole(reference)
    if (not all(_IDENTITY.fullmatch(key) for key in (release_id, series_id, unit))
            or reference_date % 86400 or not _MIN_UTC_SECOND <= reference_date <= _MAX_UTC_SECOND):
        raise ResearchError("Invalid macro release identity or reference date.")

    schedule = forecast = None
    history: list[MacroRecord] = []
    ids: set[str] = set()
    for row in group[1:]:
        if len(row) != 7:
            raise ResearchError("Invalid macro calendar evidence row.")
        kind, record_id, published, observed, scheduled, amount, supersedes = row
        published_at, observed_at = _whole(published), _whole(observed)
        if (not _IDENTITY.fullmatch(record_id) or record_id in ids
                or not _MIN_UTC_SECOND <= published_at <= min(observed_at, published_limit)
                or observed_at > known_limit):
            raise ResearchError("Invalid macro report identity or cutoff evidence.")
        ids.add(record_id)
        if kind == "S":
            scheduled_at = _whole(scheduled)
            if (schedule or forecast or history or not published_at <= scheduled_at <= _MAX_UTC_SECOND
                    or amount or supersedes):
                raise ResearchError("Invalid visible macro schedule.")
            schedule = MacroRecord(record_id, published_at, observed_at, scheduled_at, None, None)
            continue
        if scheduled or not _WIDE.fullmatch(amount) or abs(int(amount)) > _MAX_MACRO_TICKS:
            raise ResearchError("Invalid macro report value.")
        report = MacroRecord(record_id, published_at, observed_at, None, int(amount), supersedes or None)
        if kind == "F" and not forecast and not history and not supersedes:
            forecast = report
        elif kind == "A" and not history and not supersedes and (not forecast or forecast.observed_at < published_at):
            history.append(report)
        elif (kind == "R" and history and supersedes == history[-1].record_id
              and published_at > history[-1].published_at):
            history.append(report)
        else:
            raise ResearchError("Invalid macro report order or revision chain.")
    return MacroRelease(release_id, series_id, reference_date, unit, schedule, forecast, tuple(history))


def _macro_as_of(output: bytes, published: int, known: int) -> tuple[MacroRelease, ...]:
    count, lines = _response(output, _MACRO_PROTOCOL)
    groups: list[list[list[str]]] = []
    records = 0
    for line in lines:
        row = line.split("\t")
        if row[0] == "H":
            if len(row) != 5 or (groups and len(groups[-1]) == 1):
                raise ResearchError("Invalid macro release header.")
            groups.append([row])
        elif not groups:
            raise ResearchError("Missing macro release header.")
        else:
            groups[-1].append(row)
            records += 1
    if (_whole(count) != len(groups) or records > _MAX_MACRO_REPORTS
            or (groups and len(groups[-1]) == 1)):
        raise ResearchError("Invalid macro calendar row count.")
    releases = tuple(_macro_release(group, published, known) for group in groups)
    if len(releases) != len({row.release_id for row in releases}):
        raise ResearchError("Repeated macro release identity.")
    return releases


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
        _validate_scalar_module(module)
        if type(ticks) is not int or not _MIN_I64 <= ticks <= _MAX_I64:
            raise ValueError("Scalar plugin input must fit a signed 64-bit integer.")
        header = f"marketweft-scalar-plugin\t1\t{ticks}\n".encode("ascii")
        value, rows = _response(self._invoke(header + module, "scalar-plugin"), "marketweft-scalar-plugin")
        if rows:
            raise ResearchError("Unexpected rows in the scalar plugin response.")
        return _whole(value)

    def evaluate_scalar_plugin_series(
        self, module: bytes, csv: str, *, from_second: int, through_second: int,
    ) -> tuple[ScalarPluginPoint, ...]:
        """Evaluate observed closes independently in an inclusive UTC range."""
        _validate_scalar_module(module)
        if any(type(value) is not int or not _MIN_I64 <= value <= _MAX_I64
               for value in (from_second, through_second)) or from_second > through_second:
            raise ValueError("Use an ordered UTC range in whole seconds for scalar plugin closes.")
        history = csv.encode("utf-8")
        if len(history) > _MAX_CSV:
            raise ValueError("CSV exceeds 8 MiB.")
        protocol = "marketweft-scalar-series"
        header = f"{protocol}\t1\t{len(module)}\t{from_second}\t{through_second}\n".encode("ascii")
        output = self._invoke(header + module + history, "scalar-plugin-series")
        count, rows = _response(output, protocol)
        if _whole(count) != len(rows) or len(rows) > _MAX_SCALAR_SERIES:
            raise ResearchError("Invalid scalar plugin series row count.")
        points = []
        for row in rows:
            fields = row.split("\t")
            if len(fields) != 3:
                raise ResearchError("Invalid scalar plugin series row.")
            point = ScalarPluginPoint(*map(_whole, fields))
            if (not from_second <= point.time <= through_second
                    or (points and point.time <= points[-1].time)):
                raise ResearchError("Scalar plugin series rows must be ordered within the requested UTC range.")
            points.append(point)
        return tuple(points)

    def monthly_returns(
        self, csv: str, *, first_year: int, last_year: int, observed_through: str,
    ) -> tuple[MonthlyReturn, ...]:
        """Return ordered UTC months with price and cutoff evidence from the supplied OHLCV."""
        if (type(first_year) is not int or type(last_year) is not int
                or not 1 <= first_year <= last_year <= 9999 or last_year - first_year >= _MAX_MONTHLY_YEARS):
            raise ValueError("Choose up to 30 consecutive UTC calendar years between 0001 and 9999.")
        if not isinstance(observed_through, str) or not _UTC.fullmatch(observed_through):
            raise ValueError("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")
        try:
            cutoff = datetime.fromisoformat(observed_through[:-1])
        except ValueError as exc:
            raise ValueError("Use a valid UTC observation cutoff.") from exc
        through = _epoch_second(cutoff)
        history = csv.encode("utf-8")
        if len(history) > _MAX_CSV:
            raise ValueError("CSV exceeds 8 MiB.")
        header = f"{_MONTHLY_PROTOCOL}\t1\t{first_year}\t{last_year}\t{observed_through}\n".encode("ascii")
        output = self._invoke(header + history, "monthly-returns")
        return _monthly_returns(output, first_year, last_year, through)

    def macro_as_of(
        self, csv: str, *, published_through: str, known_at: str,
    ) -> tuple[MacroRelease, ...]:
        """Replay authorized release records visible at both inclusive UTC cutoffs."""
        times = (published_through, known_at)
        if any(not isinstance(value, str) or not _UTC.fullmatch(value) for value in times):
            raise ValueError("Calendar times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        try:
            published, known = (_epoch_second(datetime.fromisoformat(value[:-1])) for value in times)
        except ValueError as exc:
            raise ValueError("Use valid UTC macro calendar cutoffs.") from exc
        history = csv.encode("utf-8")
        if len(history) > _MAX_MACRO_CSV:
            raise ValueError("Macro calendar CSV exceeds 1 MiB.")
        header = f"{_MACRO_PROTOCOL}\t1\t{published_through}\t{known_at}\n".encode("ascii")
        output = self._invoke(header + history, "macro-calendar")
        return _macro_as_of(output, published, known)

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

    def recorded_notional_bars(
        self, instrument: str, trades_csv: str, target_notional_ticks: int, *, known_at: str | None = None,
    ) -> NotionalBarsSnapshot:
        """Group observed whole trades by their exact gross quote notional."""
        if not isinstance(instrument, str) or not _INSTRUMENT.fullmatch(instrument):
            raise ValueError("Use a canonical recorded instrument.")
        if type(target_notional_ticks) is not int or not 1 <= target_notional_ticks <= _MAX_PRICE_TICKS:
            raise ValueError("Use a positive notional target in whole millionths.")
        cutoff = None
        if known_at is not None:
            if not isinstance(known_at, str) or not _UTC.fullmatch(known_at):
                raise ValueError("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")
            try:
                cutoff = _epoch_second(datetime.fromisoformat(known_at[:-1]))
            except ValueError as error:
                raise ValueError("Use a valid UTC observation cutoff.") from error
        source = trades_csv.encode("utf-8")
        if len(source) > _MAX_CSV:
            raise ValueError("Trade CSV exceeds 8 MiB.")
        header = "\n".join((_NOTIONAL_BARS_PROTOCOL + "\t1", instrument, str(target_notional_ticks), known_at or "", ""))
        output = self._invoke(header.encode("ascii") + source, "notional-bars")
        return _notional_bars(output, instrument, target_notional_ticks, cutoff)

    def recorded_trade_prints(
        self, instrument: str, trades_csv: str, *, known_at: str | None = None,
    ) -> RecordedTradePrintsSnapshot:
        """Return exact trade prints in observation order up to an inclusive cutoff."""
        if not isinstance(instrument, str) or not _INSTRUMENT.fullmatch(instrument):
            raise ValueError("Use a canonical recorded instrument.")
        cutoff = None
        if known_at is not None:
            if not isinstance(known_at, str) or not _UTC.fullmatch(known_at):
                raise ValueError("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")
            try:
                cutoff = _epoch_second(datetime.fromisoformat(known_at[:-1]))
            except ValueError as error:
                raise ValueError("Use a valid UTC observation cutoff.") from error
        if not isinstance(trades_csv, str):
            raise TypeError("Supply trade CSV contents as text.")
        capture = trades_csv.encode("utf-8")
        if len(capture) > _MAX_CSV:
            raise ValueError("Trade CSV exceeds 8 MiB.")
        header = "\n".join((_TRADE_PRINTS_PROTOCOL + "\t1", instrument, known_at or "", "")).encode("ascii")
        output = self._invoke(header + capture, "trade-prints")
        return _recorded_trade_prints(output, instrument, cutoff)

    def dividend_ledger(
        self, instrument: str, dividends_csv: str, *, shares: int | None = None,
        positions_csv: str | None = None, known_at: str | None = None,
    ) -> DividendLedgerSnapshot:
        """Replay cash dividend evidence through an inclusive UTC observation cutoff."""
        if not isinstance(instrument, str) or not _INSTRUMENT.fullmatch(instrument):
            raise ValueError("Use a canonical dividend instrument.")
        if (shares is None) == (positions_csv is None):
            raise ValueError("Supply fixed shares or a dated position CSV.")
        if shares is not None and (type(shares) is not int or not 0 <= shares <= _MAX_DIVIDEND_SHARES):
            raise ValueError("Supply 0–1,000,000 whole entitled shares.")
        if not isinstance(dividends_csv, str) or positions_csv is not None and not isinstance(positions_csv, str):
            raise TypeError("Supply dividend and dated position CSV contents as text.")
        dividend_bytes = dividends_csv.encode("utf-8")
        position_bytes = b"" if positions_csv is None else positions_csv.encode("utf-8")
        if max(len(dividend_bytes), len(position_bytes)) > _MAX_DIVIDEND_CSV:
            raise ValueError("Each dividend and position CSV must be at most 1 MiB.")
        cutoff = None
        if known_at is not None:
            if not isinstance(known_at, str) or not _UTC.fullmatch(known_at):
                raise ValueError("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")
            try:
                cutoff = _epoch_second(datetime.fromisoformat(known_at[:-1]))
            except ValueError as error:
                raise ValueError("Use a valid UTC observation cutoff.") from error
        mode = "dated" if shares is None else "fixed"
        prefix = "\t".join((_DIVIDEND_LEDGER_PROTOCOL, "1", mode, str(len(dividend_bytes))))
        header = "\n".join((prefix, instrument, known_at or "", "" if shares is None else str(shares), "")).encode("ascii")
        output = self._invoke(header + dividend_bytes + position_bytes, "dividend-ledger")
        return _dividend_ledger(output, instrument, cutoff, shares)

    def listing_downside_risk_as_of(
        self, membership_csv: str, prices_csv: str, left_listing_id: str, right_listing_id: str, *,
        from_at: str, through_at: str, known_at: str, interval_seconds: int, window_periods: int,
        volatility_periods: int = 1,
    ) -> ListingDownsideRiskSnapshot:
        """Calculate listing risk and downside deviation over observed return windows."""
        timestamps = (from_at, through_at, known_at)
        if any(not isinstance(value, str) or not _UTC.fullmatch(value) for value in timestamps):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ listing risk cutoffs.")
        try:
            start, end, known = (_epoch_second(datetime.fromisoformat(value[:-1])) for value in timestamps)
        except ValueError as error:
            raise ValueError("Use valid UTC listing risk cutoffs.") from error
        settings = (interval_seconds, window_periods, volatility_periods)
        if (any(type(value) is not int or not 1 <= value <= 0xFFFFFFFF for value in settings)
                or not 2 <= window_periods <= 100_000):
            raise ValueError("Use a positive interval and scale, and a window of 2 to 100,000 returns.")
        if start > end or (end - start) % interval_seconds or (end - start) // interval_seconds > 100_000:
            raise ValueError("Use at most 100,000 intervals with the UTC end on the selected grid.")
        listings = (left_listing_id, right_listing_id)
        if (any(not isinstance(value, str) or not _IDENTITY.fullmatch(value) for value in listings)
                or left_listing_id == right_listing_id):
            raise ValueError("Use two distinct listing IDs.")
        membership, prices = membership_csv.encode("utf-8"), prices_csv.encode("utf-8")
        if len(membership) > 1024 * 1024 or len(prices) > 2 * 1024 * 1024:
            raise ValueError("Membership and prices CSV exceed the listing risk input limits.")
        header = "\t".join((_LISTING_DOWNSIDE_RISK_PROTOCOL, "1", str(len(membership))))
        request = "\n".join((header, *timestamps, "\t".join(listings), "\t".join(map(str, settings)), "")).encode("ascii")
        output = self._invoke(request + membership + prices, "listing-downside-risk")
        return _listing_downside_risk(output, listings, (start, end, known), settings)

    def portfolio_allocation_as_of(
        self, membership_csv: str, prices_csv: str, listing_ids: Sequence[str], *,
        from_at: str, through_at: str, known_at: str, interval_seconds: int,
        maximum_weight_basis_points: int | None = None,
    ) -> PortfolioAllocationSnapshot:
        """Estimate long-only portfolio weights using common returns at the supplied cutoffs."""
        times = (from_at, through_at, known_at)
        if any(not isinstance(value, str) or not _UTC.fullmatch(value) for value in times):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ portfolio allocation cutoffs.")
        try:
            start, end, known = (_epoch_second(datetime.fromisoformat(instant[:-1])) for instant in times)
        except ValueError as error:
            raise ValueError("Use valid UTC portfolio allocation cutoffs.") from error
        if type(interval_seconds) is not int or not 1 <= interval_seconds <= 0xFFFFFFFF:
            raise ValueError("Use a positive whole number for the price interval.")
        if start > end or (end - start) % interval_seconds or (end - start) // interval_seconds > 100_000:
            raise ValueError("Use at most 100,000 intervals with the UTC end on the selected grid.")
        if isinstance(listing_ids, (str, bytes)):
            raise ValueError("Supply a sequence of portfolio listing IDs.")
        listings = tuple(listing_ids)
        if (not 2 <= len(listings) <= 16
                or any(not isinstance(listing, str) or not _IDENTITY.fullmatch(listing) for listing in listings)
                or len(set(listings)) != len(listings)):
            raise ValueError("Use 2 to 16 distinct portfolio listing IDs.")
        maximum = maximum_weight_basis_points
        if maximum is not None and (type(maximum) is not int or not 1 <= maximum <= 10_000
                                    or maximum * len(listings) < 10_000):
            raise ValueError("Use a whole basis-point maximum that allows a fully allocated portfolio.")
        membership, prices = membership_csv.encode("utf-8"), prices_csv.encode("utf-8")
        if len(membership) > 1024 * 1024 or len(prices) > 2 * 1024 * 1024:
            raise ValueError("Membership and prices CSV exceed the portfolio allocation input limits.")
        command = (_ALLOCATION_PROTOCOL, "1", str(len(membership))) if maximum is None else (
            _ALLOCATION_PROTOCOL, "2", str(len(membership)), str(maximum),
        )
        header = "\t".join(command)
        request = "\n".join((header, *times, str(interval_seconds), "\t".join(listings), "")).encode("ascii")
        output = self._invoke(request + membership + prices, "portfolio-allocation")
        return _portfolio_allocation(output, listings, (start, end, known), interval_seconds, maximum)

    def portfolio_scenarios(
        self, membership_csv: str, prices_csv: str, allocations: Sequence[ScenarioAllocation], *,
        from_at: str, through_at: str, known_at: str, interval_seconds: int, starting_value: str,
        fee_basis_points: int, seed: int, paths: int, horizon: int, block_size: int = 1,
    ) -> PortfolioScenarioResult:
        """Sample joint return vectors or contiguous blocks using independent UTC cutoffs."""
        times = (from_at, through_at, known_at)
        if any(not isinstance(value, str) or not _UTC.fullmatch(value) for value in times):
            raise ValueError("Scenario times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        if type(seed) is not int or not 0 <= seed < 1 << 64:
            raise ValueError("Use an unsigned 64-bit seed.")
        settings = (interval_seconds, fee_basis_points, paths, horizon, block_size)
        if (any(type(value) is not int or not 0 <= value <= 0xFFFFFFFF for value in settings)
                or not isinstance(starting_value, str)
                or not re.fullmatch(_PORTFOLIO_START, starting_value)):
            raise ValueError("Use whole scenario settings and a starting value with up to six fractional digits.")
        weights = tuple(allocations)
        if not 2 <= len(weights) <= 16 or any(
                not isinstance(entry, ScenarioAllocation) or not isinstance(entry.listing_id, str)
                or not _IDENTITY.fullmatch(entry.listing_id) or type(entry.weight_basis_points) is not int
                or not 1 <= entry.weight_basis_points <= 10_000 for entry in weights):
            raise ValueError("Choose 2 to 16 stable listing IDs with positive whole weights in basis points.")
        membership, prices = membership_csv.encode("utf-8"), prices_csv.encode("utf-8")
        if len(membership) > 1024 * 1024 or len(prices) > 2 * 1024 * 1024:
            raise ValueError("Membership and prices CSV exceed the scenario input limits.")
        sampling = str(horizon) if block_size == 1 else f"{horizon}:{block_size}"
        weight_field = "\t".join(f"{entry.listing_id}={entry.weight_basis_points}" for entry in weights)
        settings_header = "\t".join((_PORTFOLIO_PROTOCOL, "1", str(len(membership))))
        request = "\n".join((settings_header, *times, str(interval_seconds), starting_value,
                             str(fee_basis_points), str(seed), str(paths), sampling, weight_field, ""))
        output = self._invoke(request.encode("ascii") + membership + prices, "portfolio-scenarios")
        return _portfolio_scenarios(output, weights, paths, block_size)

    def equity_concentration_as_of(
        self, membership_csv: str, holdings_csv: str, prices_csv: str, *, effective_at: str, known_at: str,
    ) -> EquityConcentrationSnapshot:
        """Rank known share marks within quote currencies at independent UTC cutoffs."""
        times = (effective_at, known_at)
        if any(not isinstance(instant, str) or not _UTC.fullmatch(instant) for instant in times):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ UTC portfolio cutoffs.")
        try:
            effective, known = (_epoch_second(datetime.fromisoformat(instant[:-1])) for instant in times)
        except ValueError as error:
            raise ValueError("Use valid UTC equity concentration cutoffs.") from error
        reports = tuple(csv.encode("utf-8") for csv in (membership_csv, holdings_csv, prices_csv))
        if any(len(csv) > limit * 1024 * 1024 for csv, limit in zip(reports, (1, 2, 2))):
            raise ValueError("Equity concentration CSV exceeds its byte limit.")
        header = "\n".join((f"{_CONCENTRATION_PROTOCOL}\t1\t{len(reports[0])}\t{len(reports[1])}", *times, ""))
        output = self._invoke(header.encode("ascii") + b"".join(reports), "equity-concentration")
        return _equity_concentration(output, effective, known)

    def equity_target_drift_as_of(
        self, membership_csv: str, holdings_csv: str, prices_csv: str, terms_csv: str, targets_csv: str,
        *, effective_at: str, known_at: str,
    ) -> EquityTargetSnapshot:
        """Compare marked equity weights with the latest known allocation targets."""
        times = (effective_at, known_at)
        if any(not isinstance(instant, str) or not _UTC.fullmatch(instant) for instant in times):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ UTC portfolio cutoffs.")
        try:
            effective, known = (_epoch_second(datetime.fromisoformat(instant[:-1])) for instant in times)
        except ValueError as error:
            raise ValueError("Use valid UTC equity target cutoffs.") from error
        sources = (membership_csv, holdings_csv, prices_csv, terms_csv, targets_csv)
        if any(not isinstance(csv, str) for csv in sources):
            raise TypeError("Supply equity target source reports as text.")
        reports = tuple(csv.encode("utf-8") for csv in sources)
        if any(len(csv) > limit * 1024 * 1024 for csv, limit in zip(reports, (1, 2, 2, 1, 2))):
            raise ValueError("An equity target CSV exceeds its byte limit.")
        frame = "\t".join((_EQUITY_TARGET_PROTOCOL, "1", *(str(len(report)) for report in reports[:-1])))
        header = "\n".join((frame, *times, "")).encode("ascii")
        output = self._invoke(header + b"".join(reports), "equity-target-drift")
        return _equity_target_snapshot(output, effective, known)

    def portfolio_fx_as_of(
        self, rates_csv: str, amounts: Sequence[FxAmount], *, reporting_currency: str,
        effective_at: str, known_at: str,
    ) -> FxTranslation:
        """Translate source currency subtotals at separate effective and observed UTC times."""
        if not isinstance(reporting_currency, str) or not _CURRENCY.fullmatch(reporting_currency):
            raise ValueError("Use a three-letter uppercase reporting currency.")
        times = (effective_at, known_at)
        if any(not isinstance(instant, str) or not _UTC.fullmatch(instant) for instant in times):
            raise ValueError("Use YYYY-MM-DDTHH:MM:SSZ UTC portfolio cutoffs.")
        try:
            effective, known = (_epoch_second(datetime.fromisoformat(instant[:-1])) for instant in times)
        except ValueError as error:
            raise ValueError("Use valid UTC portfolio FX cutoffs.") from error
        if len(amounts) > _MAX_FX_CURRENCIES:
            raise ValueError("Supply each source currency subtotal once.")
        subtotals = {}
        for amount in amounts:
            if (not isinstance(amount, FxAmount) or not isinstance(amount.currency, str)
                    or not _CURRENCY.fullmatch(amount.currency) or amount.currency in subtotals
                    or type(amount.subtotal) is not int or not -_I128_LIMIT <= amount.subtotal < _I128_LIMIT):
                raise ValueError("Supply distinct source currencies and exact signed 128-bit subtotals.")
            subtotals[amount.currency] = amount.subtotal
        rates = rates_csv.encode("utf-8")
        if len(rates) > 1024 * 1024:
            raise ValueError("FX rates CSV exceeds 1 MiB.")
        currency_line = "\t".join(f"{currency}={subtotal}" for currency, subtotal in subtotals.items())
        header = "\n".join((f"{_FX_PROTOCOL}\t1", *times, reporting_currency, currency_line, ""))
        output = self._invoke(header.encode("ascii") + rates, "portfolio-fx")
        return _fx_translation(output, reporting_currency, effective, known, subtotals)

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
