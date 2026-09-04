from __future__ import annotations

import math

from app.calibration.transform import (
    CalibrationError,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import Calibration

_RESOLVE_EPS = 0.5


def _transform_of(cal: Calibration) -> Transform2D:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map adapter is not available yet",
            hint="Use cartesian calibration",
        )
    if cal.coords_type == "polar":
        raise CalibrationError(
            "Polar adapter is not available yet",
            hint="Use cartesian calibration",
        )
    constraints = build_constraints(cal)
    requested = cal.model
    if requested == "auto" and not cal.axis_points:
        requested = "orthogonal"
    return solve_transform(constraints, model=requested)


def _from_linear_axes(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    x = 10**u if cal.x.scale == "log" else u
    y = 10**v if cal.y.scale == "log" else v
    return float(x), float(y)


def _to_linear_axes(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    x, y = data
    if cal.x.scale == "log":
        if x <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log X requires values > 0",
            )
        u = math.log10(x)
    else:
        u = x
    if cal.y.scale == "log":
        if y <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log Y requires values > 0",
            )
        v = math.log10(y)
    else:
        v = y
    return float(u), float(v)


def validate_calibration(cal: Calibration) -> None:
    if cal.coords_type == "cartesian" and not cal.axis_points:
        if len(cal.x.ref_points) < 2:
            raise CalibrationError(
                "x axis needs at least 2 reference points",
                hint="Place X min and X max",
            )
        if len(cal.y.ref_points) < 2:
            raise CalibrationError(
                "y axis needs at least 2 reference points",
                hint="Place Y min and Y max",
            )
    _transform_of(cal)


def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    return _from_linear_axes(cal, t.to_linear(pixel))


def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    return t.from_linear(_to_linear_axes(cal, data))


def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    x0, y0 = pixel_to_data(cal, pixel)
    x1, _y1 = pixel_to_data(cal, (pixel[0] + _RESOLVE_EPS, pixel[1]))
    _x2, y2 = pixel_to_data(cal, (pixel[0], pixel[1] + _RESOLVE_EPS))
    return abs(x1 - x0) / _RESOLVE_EPS, abs(y2 - y0) / _RESOLVE_EPS


def _data_limits(cal: Calibration) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    if cal.axis_points:
        for pt in cal.axis_points:
            if pt.x_value is not None:
                xs.append(float(pt.x_value))
            if pt.y_value is not None:
                ys.append(float(pt.y_value))
    else:
        xs = [float(p.value) for p in cal.x.ref_points]
        ys = [float(p.value) for p in cal.y.ref_points]
    if len(xs) < 2 or len(ys) < 2:
        raise CalibrationError(
            "Not enough pinned values to draw axes checker",
            hint="Pin both X and Y extents",
        )
    return min(xs), max(xs), min(ys), max(ys)


def axes_checker_polyline(
    cal: Calibration,
    image_size: tuple[int, int],
) -> list[tuple[float, float]]:
    xmin, xmax, ymin, ymax = _data_limits(cal)
    corners = [
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
        (xmin, ymin),
    ]
    return [data_to_pixel(cal, c) for c in corners]
