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
_TWO_PI = 2.0 * math.pi


def _theta_to_radians(theta: float, units: str) -> float:
    if units == "degrees":
        return theta * math.pi / 180.0
    if units == "radians":
        return theta
    if units == "gradians":
        return theta * math.pi / 200.0
    if units == "turns":
        return theta * _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _radians_to_theta(rad: float, units: str) -> float:
    if units == "degrees":
        return rad * 180.0 / math.pi
    if units == "radians":
        return rad
    if units == "gradians":
        return rad * 200.0 / math.pi
    if units == "turns":
        return rad / _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _transform_of(cal: Calibration) -> Transform2D:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map adapter is not available yet",
            hint="Use cartesian or polar calibration",
        )
    constraints = build_constraints(cal)
    requested = cal.model
    if requested == "auto" and not cal.axis_points and cal.coords_type == "cartesian":
        requested = "orthogonal"
    if cal.coords_type == "polar" and requested == "auto":
        requested = "affine"
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


def _polar_from_linear(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    rho = math.hypot(u, v)
    theta_rad = math.atan2(v, u)
    theta = _radians_to_theta(theta_rad, cal.theta_units)
    if cal.y.scale == "log":
        radius = 10**rho
    else:
        radius = rho + cal.origin_radius
    return float(theta), float(radius)


def _polar_to_linear(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    theta, radius = data
    theta_rad = _theta_to_radians(theta, cal.theta_units)
    if cal.y.scale == "log":
        if radius <= 0:
            raise CalibrationError(
                "Cannot map non-positive radius on log polar axis",
                hint="Log radius requires R > 0",
            )
        rho = math.log10(radius)
    else:
        rho = radius - cal.origin_radius
    return rho * math.cos(theta_rad), rho * math.sin(theta_rad)


def validate_calibration(cal: Calibration) -> None:
    if cal.coords_type == "polar":
        if len(cal.axis_points) < 3:
            raise CalibrationError(
                "Polar calibration needs at least 3 axis points",
                hint="Place origin plus two more (θ, R) points",
            )
        _transform_of(cal)
        return
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
    uv = t.to_linear(pixel)
    if cal.coords_type == "polar":
        return _polar_from_linear(cal, uv)
    return _from_linear_axes(cal, uv)


def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    if cal.coords_type == "polar":
        return t.from_linear(_polar_to_linear(cal, data))
    return t.from_linear(_to_linear_axes(cal, data))


def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    a0 = pixel_to_data(cal, pixel)
    a1 = pixel_to_data(cal, (pixel[0] + _RESOLVE_EPS, pixel[1]))
    a2 = pixel_to_data(cal, (pixel[0], pixel[1] + _RESOLVE_EPS))
    return abs(a1[0] - a0[0]) / _RESOLVE_EPS, abs(a2[1] - a0[1]) / _RESOLVE_EPS


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


def _polar_checker(cal: Calibration) -> list[tuple[float, float]]:
    radii = [float(pt.y_value) for pt in cal.axis_points if pt.y_value is not None]
    thetas = [float(pt.x_value) for pt in cal.axis_points if pt.x_value is not None]
    if cal.y.scale == "log":
        # Log radius cannot draw R≤0. Inner ring is the smallest pinned R > 0
        # (fallback 1.0 if none). origin_radius is unchanged for pixel_to_data.
        positive = [r for r in radii if r > 0]
        r_inner = min(positive) if positive else 1.0
        r_outer = max(positive) if positive else r_inner
    else:
        r_inner = cal.origin_radius
        r_outer = max(radii) if radii else r_inner + 1.0
    t0 = min(thetas) if thetas else 0.0
    t1 = max(thetas) if thetas else (
        360.0 if cal.theta_units == "degrees" else math.pi * 2 if cal.theta_units == "radians" else 400.0 if cal.theta_units == "gradians" else 1.0
    )
    n = 32
    poly: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        poly.append(data_to_pixel(cal, (t, r_outer)))
    for i in range(n + 1):
        t = t1 + (t0 - t1) * i / n
        poly.append(data_to_pixel(cal, (t, r_inner)))
    poly.append(poly[0])
    return poly


def axes_checker_polyline(
    cal: Calibration,
    image_size: tuple[int, int],
) -> list[tuple[float, float]]:
    if cal.coords_type == "polar":
        return _polar_checker(cal)
    xmin, xmax, ymin, ymax = _data_limits(cal)
    corners = [
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
        (xmin, ymin),
    ]
    return [data_to_pixel(cal, c) for c in corners]
