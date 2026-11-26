"""Read-only research backed by the local MarketWeft Rust engine."""

from dataclasses import dataclass
import math
from pathlib import Path
import re
import subprocess
from typing import Sequence

__all__ = [
    "FormulaFunction", "FormulaResult", "FormulaRow", "ResearchEngine", "ResearchError",
]

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,31}\Z")
_WHOLE = re.compile(r"-?(?:0|[1-9][0-9]{0,18})\Z")
_MIN_I64 = -(1 << 63)
_MAX_I64 = (1 << 63) - 1
_MAX_SOURCE = 2048
_MAX_CSV = 8 * 1024 * 1024


class ResearchError(Exception):
    """The native engine rejected the formula or could not return a valid result."""


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


def _result(output: bytes) -> FormulaResult:
    try:
        response = output.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ResearchError("Research response is not ASCII.") from exc
    header, newline, body = response.partition("\n")
    fields = header.split("\t")
    if not newline or len(fields) != 3 or fields[:2] != ["marketweft-research", "1"]:
        raise ResearchError("Invalid research response or protocol version.")
    version_number = _whole(fields[2])
    if not 1 <= version_number <= 0xFFFFFFFF:
        raise ResearchError("Invalid research formula language version.")
    rows: list[FormulaRow] = []
    if body:
        if not body.endswith("\n"):
            raise ResearchError("Incomplete research result.")
        for line in body[:-1].split("\n"):
            instant, tab, value = line.partition("\t")
            if not tab or len(rows) == 100_000:
                raise ResearchError("Invalid research result row or row limit.")
            timestamp = _whole(instant)
            if rows and timestamp <= rows[-1].observed_at:
                raise ResearchError("Research rows are not in observed order.")
            rows.append(FormulaRow(timestamp, _whole(value) if value else None))
    return FormulaResult(version_number, tuple(rows))


class ResearchEngine:
    """Evaluate market formulas using a caller-selected native executable."""

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
        try:
            process = subprocess.run(
                [self._executable], input=header + source + library + history,
                capture_output=True, timeout=self._timeout, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ResearchError("MarketWeft research evaluation timed out.") from exc
        except OSError as exc:
            raise ResearchError("Could not start the MarketWeft research executable.") from exc
        if process.returncode:
            details = process.stderr.decode("utf-8", errors="replace").strip()
            raise ResearchError(details or "MarketWeft research evaluation exited unsuccessfully.")
        return _result(process.stdout)
