"""Read-only research backed by the local MarketWeft Rust engine."""

from dataclasses import dataclass
import math
from pathlib import Path
import re
import subprocess
from typing import Sequence

__all__ = [
    "FormulaFunction", "FormulaResult", "FormulaRow", "ResearchEngine", "ResearchError",
    "ScreenPrice", "ScreenResult", "ScreenRow",
]

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,31}\Z")
_IDENTITY = re.compile(r"[A-Za-z0-9._-]{1,40}\Z")
_UTC = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\Z")
_WHOLE = re.compile(r"-?(?:0|[1-9][0-9]{0,18})\Z")
_WIDE = re.compile(r"-?(?:0|[1-9][0-9]{0,38})\Z")
_MIN_I64 = -(1 << 63)
_MAX_I64 = (1 << 63) - 1
_MAX_SOURCE = 2048
_MAX_CSV = 8 * 1024 * 1024


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
