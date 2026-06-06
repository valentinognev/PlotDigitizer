from __future__ import annotations

import math
from typing import Literal

import numpy as np

from app.models.schemas import Calibration, CalibrationAxis, RefPoint

Scale = Literal["linear", "log"]


class CalibrationError(ValueError):
    pass


def _fit_axis(ref_points: list[RefPoint], scale: Scale, axis_name: str) -> tuple[float, float]:
    if len(ref_points) < 2:
        raise CalibrationError(f"{axis_name} axis needs at least 2 reference points")

    pixels = np.array([p.pixel[0 if axis_name == "x" else 1] for p in ref_points], dtype=float)
    values = np.array([p.value for p in ref_points], dtype=float)

    if scale == "log":
        if np.any(values <= 0):
            raise CalibrationError(f"{axis_name} log scale requires all reference values > 0")
        values = np.log10(values)

    if np.ptp(pixels) < 1e-9:
        raise CalibrationError(f"{axis_name} axis reference pixels are degenerate")

    slope, intercept = np.polyfit(pixels, values, 1)
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
