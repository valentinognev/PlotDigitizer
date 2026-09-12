from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Literal

from app.calibration.transform import CalibrationError

UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

_SECONDS_PER_DAY = 86400.0

_DATE_FORMATS = (
    "%Y/%m/%d %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d",
    "%Y-%m-%d",
)


def parse_axis_token(text: str) -> tuple[float, Literal["number", "date"]]:
    raw = text.strip()
    if not raw:
        raise CalibrationError(
            "Invalid axis token",
            hint="Enter a number or a date like YYYY/MM/DD",
        )
    for fmt in _DATE_FORMATS:
        try:
            naive = datetime.strptime(raw, fmt)
        except ValueError:
            continue
        aware = naive.replace(tzinfo=UTC)
        days = (aware - UNIX_EPOCH).total_seconds() / _SECONDS_PER_DAY
        return days, "date"
    try:
        value = float(raw)
    except ValueError as exc:
        raise CalibrationError(
            "Invalid axis token",
            hint="Enter a number or a date like YYYY/MM/DD",
        ) from exc
    if not math.isfinite(value):
        raise CalibrationError(
            "Invalid axis token",
            hint="Enter a finite number or a date like YYYY/MM/DD",
        )
    return value, "number"


def format_unix_days(value: float, pattern: str) -> str:
    if not math.isfinite(value):
        raise CalibrationError(
            "Invalid unix-days value",
            hint="Unix days must be a finite number",
        )
    dt = UNIX_EPOCH + timedelta(days=value)
    replacements = (
        ("YYYY", f"{dt.year:04d}"),
        ("MM", f"{dt.month:02d}"),
        ("DD", f"{dt.day:02d}"),
        ("hh", f"{dt.hour:02d}"),
        ("mm", f"{dt.minute:02d}"),
        ("ss", f"{dt.second:02d}"),
    )
    out = pattern
    for token, repl in replacements:
        out = out.replace(token, repl)
    return out
