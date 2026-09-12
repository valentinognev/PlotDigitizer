from __future__ import annotations

import math

from app.calibration.transform import CalibrationError
from app.models.schemas import Calibration, RefPoint

_PIXEL_TOL = 1e-12


def _value_refs(cal: Calibration) -> tuple[RefPoint, RefPoint]:
    refs = cal.y.ref_points
    if len(refs) < 2:
        raise CalibrationError(
            "Bar calibration needs at least 2 value-axis reference points",
            hint="Place two distinct points on the value axis",
        )
    return refs[0], refs[1]


def _pixel_span(p1: tuple[float, float], p2: tuple[float, float]) -> tuple[float, float, float]:
    dx = float(p2[0]) - float(p1[0])
    dy = float(p2[1]) - float(p1[1])
    den = dx * dx + dy * dy
    if den < _PIXEL_TOL:
        raise CalibrationError(
            "Bar value-axis pixels are not distinct",
            hint="Place two distinct points on the value axis",
        )
    return dx, dy, den


def _project_t(pixel: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float]) -> float:
    dx, dy, den = _pixel_span(p1, p2)
    return ((float(pixel[0]) - float(p1[0])) * dx + (float(pixel[1]) - float(p1[1])) * dy) / den


def _log_pair(v1: float, v2: float) -> tuple[float, float]:
    if v1 <= 0 or v2 <= 0:
        raise CalibrationError(
            "y log scale requires all reference values > 0",
            hint="Use linear scale or enter values greater than zero",
        )
    return math.log10(v1), math.log10(v2)


def _interp_value(t: float, v1: float, v2: float, scale: str) -> float:
    if scale == "log":
        a, b = _log_pair(v1, v2)
        return float(10 ** (a + t * (b - a)))
    return float(v1 + t * (v2 - v1))


def _t_from_value(value: float, v1: float, v2: float, scale: str) -> float:
    if scale == "log":
        a, b = _log_pair(v1, v2)
        if value <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log Y requires values > 0",
            )
        span = b - a
        if abs(span) < 1e-15:
            return 0.0
        return (math.log10(value) - a) / span
    span = v2 - v1
    if abs(span) < 1e-15:
        return 0.0
    return (value - v1) / span


def bar_pixel_to_value(cal: Calibration, pixel: tuple[float, float]) -> float:
    p1, p2 = _value_refs(cal)
    t = _project_t(pixel, p1.pixel, p2.pixel)
    return _interp_value(t, float(p1.value), float(p2.value), cal.y.scale)


def bar_value_to_pixel(cal: Calibration, value: float) -> tuple[float, float]:
    p1, p2 = _value_refs(cal)
    t = _t_from_value(value, float(p1.value), float(p2.value), cal.y.scale)
    return (
        float(p1.pixel[0] + t * (float(p2.pixel[0]) - float(p1.pixel[0]))),
        float(p1.pixel[1] + t * (float(p2.pixel[1]) - float(p1.pixel[1]))),
    )


def validate_bar_calibration(cal: Calibration) -> None:
    p1, p2 = _value_refs(cal)
    _pixel_span(p1.pixel, p2.pixel)
    if cal.y.scale == "log":
        _log_pair(float(p1.value), float(p2.value))
