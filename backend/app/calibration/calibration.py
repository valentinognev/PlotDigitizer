from __future__ import annotations

import math
from typing import Literal

import numpy as np

from app.models.schemas import Calibration, CalibrationAxis, RefPoint

Scale = Literal["linear", "log"]


class CalibrationError(ValueError):
    pass


def _extreme_ref_index(ref_points: list[RefPoint], axis_name: str, which: str) -> int:
    coord = 0 if axis_name == "x" else 1
    idx = 0
    for i in range(1, len(ref_points)):
        v = ref_points[i].pixel[coord]
        best = ref_points[idx].pixel[coord]
        if which == "min" and v < best:
            idx = i
        elif which == "max" and v > best:
            idx = i
    return idx


def _fit_axis(ref_points: list[RefPoint], scale: Scale, axis_name: str) -> tuple[float, float]:
    """Two-point fit at extreme pixel refs — matches xmin/xmax/ymin/ymax UI."""
    if len(ref_points) < 2:
        raise CalibrationError(f"{axis_name} axis needs at least 2 reference points")

    i_a = _extreme_ref_index(ref_points, axis_name, "min")
    i_b = _extreme_ref_index(ref_points, axis_name, "max")
    pix_a = float(ref_points[i_a].pixel[0 if axis_name == "x" else 1])
    pix_b = float(ref_points[i_b].pixel[0 if axis_name == "x" else 1])
    val_a = float(ref_points[i_a].value)
    val_b = float(ref_points[i_b].value)

    if abs(pix_b - pix_a) < 1e-9:
        raise CalibrationError(f"{axis_name} axis reference pixels are degenerate")

    if scale == "log":
        if val_a <= 0 or val_b <= 0:
            raise CalibrationError(f"{axis_name} log scale requires all reference values > 0")
        val_a = math.log10(val_a)
        val_b = math.log10(val_b)

    slope = (val_b - val_a) / (pix_b - pix_a)
    intercept = val_a - slope * pix_a
    return float(slope), float(intercept)


def validate_calibration(calibration: Calibration) -> None:
    _fit_axis(calibration.x.ref_points, calibration.x.scale, "x")
    _fit_axis(calibration.y.ref_points, calibration.y.scale, "y")


def _axis_pixel_to_value(pixel: float, slope: float, intercept: float, scale: Scale) -> float:
    transformed = slope * pixel + intercept
    if scale == "log":
        return float(10**transformed)
    return float(transformed)


def _axis_value_to_pixel(value: float, slope: float, intercept: float, scale: Scale) -> float:
    if scale == "log":
        if value <= 0:
            raise CalibrationError("Cannot map non-positive value on log axis")
        transformed = math.log10(value)
    else:
        transformed = value
    if abs(slope) < 1e-12:
        raise CalibrationError("Degenerate axis mapping")
    return float((transformed - intercept) / slope)


def pixel_to_data(calibration: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    validate_calibration(calibration)
    xs, xi = _fit_axis(calibration.x.ref_points, calibration.x.scale, "x")
    ys, yi = _fit_axis(calibration.y.ref_points, calibration.y.scale, "y")
    x_val = _axis_pixel_to_value(pixel[0], xs, xi, calibration.x.scale)
    y_val = _axis_pixel_to_value(pixel[1], ys, yi, calibration.y.scale)
    return x_val, y_val


def data_to_pixel(calibration: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    validate_calibration(calibration)
    xs, xi = _fit_axis(calibration.x.ref_points, calibration.x.scale, "x")
    ys, yi = _fit_axis(calibration.y.ref_points, calibration.y.scale, "y")
    px = _axis_value_to_pixel(data[0], xs, xi, calibration.x.scale)
    py = _axis_value_to_pixel(data[1], ys, yi, calibration.y.scale)
    return px, py


def calibration_from_vlm(axes_x: CalibrationAxis, axes_y: CalibrationAxis) -> Calibration:
    cal = Calibration(x=axes_x, y=axes_y, source="ai")
    validate_calibration(cal)
    return cal


def vlm_ticks_to_axis(ticks: list, scale: str) -> CalibrationAxis:
    ref_points = [RefPoint(pixel=t.pixel, value=t.value) for t in ticks]
    return CalibrationAxis(scale=scale, ref_points=ref_points)
