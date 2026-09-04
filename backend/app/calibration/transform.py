from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.schemas import Calibration, TransformModel

_RANK_TOL = 1e-10
_COLLINEAR_AREA = 1e-6
_DENOM_TOL = 1e-15


class CalibrationError(ValueError):
    def __init__(self, message: str, hint: str = "") -> None:
        super().__init__(message)
        self.hint = hint


@dataclass(frozen=True)
class Constraint:
    pixel: tuple[float, float]
    axis: Literal["u", "v"]
    value: float


@dataclass(frozen=True)
class Transform2D:
    model: TransformModel
    matrix: np.ndarray

    def to_linear(self, pixel: tuple[float, float]) -> tuple[float, float]:
        vec = self.matrix @ np.array([pixel[0], pixel[1], 1.0], dtype=np.float64)
        w = float(vec[2])
        if abs(w) < _DENOM_TOL:
            raise CalibrationError(
                "Projective transform denominator is zero",
                hint="Move axis points off the vanishing line",
            )
        return float(vec[0] / w), float(vec[1] / w)

    def from_linear(self, uv: tuple[float, float]) -> tuple[float, float]:
        try:
            inv = np.linalg.inv(self.matrix)
        except np.linalg.LinAlgError as exc:
            raise CalibrationError(
                "Transform matrix is not invertible",
                hint="Add more non-collinear axis points",
            ) from exc
        vec = inv @ np.array([uv[0], uv[1], 1.0], dtype=np.float64)
        w = float(vec[2])
        if abs(w) < _DENOM_TOL:
            raise CalibrationError(
                "Inverse transform denominator is zero",
                hint="Move axis points off the vanishing line",
            )
        return float(vec[0] / w), float(vec[1] / w)


def _log_value(value: float, scale: str, axis_name: str) -> float:
    if scale == "log":
        if value <= 0:
            raise CalibrationError(
                f"{axis_name} log scale requires all reference values > 0",
                hint="Use linear scale or enter values greater than zero",
            )
        return math.log10(value)
    return float(value)


def _theta_to_radians(theta: float, units: str) -> float:
    if units == "degrees":
        return theta * math.pi / 180.0
    if units == "radians":
        return theta
    if units == "gradians":
        return theta * math.pi / 200.0
    if units == "turns":
        return theta * 2.0 * math.pi
    raise CalibrationError(f"Unknown theta units: {units}")


def _rho(radius: float, scale: str, origin_radius: float) -> float:
    if scale == "log":
        if radius <= 0:
            raise CalibrationError(
                "polar log radius requires all R values > 0",
                hint="Enter a positive radius",
            )
        return math.log10(radius)
    return float(radius) - float(origin_radius)


def build_constraints(cal: Calibration) -> list[Constraint]:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map calibrations do not use axis-point constraints",
            hint="Set a scale bar instead of axis points",
        )
    if cal.axis_points:
        if cal.coords_type == "polar":
            return _constraints_polar(cal)
        return _constraints_from_axis_points(cal)
    return _constraints_from_ref_points(cal)


def _constraints_from_ref_points(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for rp in cal.x.ref_points:
        out.append(
            Constraint(
                pixel=(float(rp.pixel[0]), float(rp.pixel[1])),
                axis="u",
                value=_log_value(float(rp.value), cal.x.scale, "x"),
            )
        )
    for rp in cal.y.ref_points:
        out.append(
            Constraint(
                pixel=(float(rp.pixel[0]), float(rp.pixel[1])),
                axis="v",
                value=_log_value(float(rp.value), cal.y.scale, "y"),
            )
        )
    if not out:
        raise CalibrationError(
            "Calibration has no reference points",
            hint="Place X/Y bounds or precise axis points",
        )
    return out


def _constraints_from_axis_points(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for pt in cal.axis_points:
        pixel = (float(pt.pixel[0]), float(pt.pixel[1]))
        if pt.x_value is not None:
            out.append(
                Constraint(
                    pixel=pixel,
                    axis="u",
                    value=_log_value(float(pt.x_value), cal.x.scale, "x"),
                )
            )
        if pt.y_value is not None:
            out.append(
                Constraint(
                    pixel=pixel,
                    axis="v",
                    value=_log_value(float(pt.y_value), cal.y.scale, "y"),
                )
            )
    if not out:
        raise CalibrationError(
            "Precise axis points do not pin any coordinate",
            hint="Enter X and/or Y for each placed point",
        )
    return out


def _constraints_polar(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for pt in cal.axis_points:
        if pt.x_value is None or pt.y_value is None:
            raise CalibrationError(
                "Polar axis points must pin both θ and R",
                hint="Enter angle and radius for every polar axis point",
            )
        theta = _theta_to_radians(float(pt.x_value), cal.theta_units)
        rho = _rho(float(pt.y_value), cal.y.scale, cal.origin_radius)
        u = rho * math.cos(theta)
        v = rho * math.sin(theta)
        pixel = (float(pt.pixel[0]), float(pt.pixel[1]))
        out.append(Constraint(pixel=pixel, axis="u", value=u))
        out.append(Constraint(pixel=pixel, axis="v", value=v))
    if not out:
        raise CalibrationError(
            "Polar calibration has no (θ, R) axis points",
            hint="Place origin plus two more (θ, R) points",
        )
    return out


def _pixels_for(constraints: list[Constraint], axis: Literal["u", "v"]) -> list[tuple[float, float]]:
    return [c.pixel for c in constraints if c.axis == axis]


def _full_points(constraints: list[Constraint]) -> list[tuple[tuple[float, float], float, float]]:
    by_pixel: dict[tuple[float, float], dict[str, float]] = defaultdict(dict)
    for c in constraints:
        by_pixel[c.pixel][c.axis] = c.value
    out: list[tuple[tuple[float, float], float, float]] = []
    for pixel, axes in by_pixel.items():
        if "u" in axes and "v" in axes:
            out.append((pixel, axes["u"], axes["v"]))
    return out


def _collinear(pixels: list[tuple[float, float]]) -> bool:
    if len(pixels) < 3:
        return False
    unique: list[tuple[float, float]] = []
    for p in pixels:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9 for q in unique):
            unique.append(p)
    if len(unique) < 3:
        return True
    x0, y0 = unique[0]
    x1, y1 = unique[1]
    for x, y in unique[2:]:
        area = abs((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0))
        if area > _COLLINEAR_AREA:
            return False
    return True


def _distinct_coord(pixels: list[tuple[float, float]], index: int) -> bool:
    vals = {p[index] for p in pixels}
    return len(vals) >= 2


def _lstsq(A: np.ndarray, b: np.ndarray, n_unknowns: int, hint: str) -> np.ndarray:
    if A.shape[0] < n_unknowns:
        raise CalibrationError("Not enough constraints for this transform model", hint=hint)
    sol, _residuals, rank, _s = np.linalg.lstsq(A, b, rcond=None)
    if int(rank) < n_unknowns:
        raise CalibrationError("Transform system is degenerate", hint=hint)
    if np.any(~np.isfinite(sol)):
        raise CalibrationError("Transform system is degenerate", hint=hint)
    return sol.astype(np.float64)


def _solve_orthogonal(constraints: list[Constraint]) -> Transform2D:
    u_pts = _pixels_for(constraints, "u")
    v_pts = _pixels_for(constraints, "v")
    hint = "Need ≥2 X constraints with distinct px and ≥2 Y constraints with distinct py"
    if len(u_pts) < 2 or len(v_pts) < 2:
        raise CalibrationError("Orthogonal model needs 2 X and 2 Y constraints", hint=hint)
    if not _distinct_coord(u_pts, 0) or not _distinct_coord(v_pts, 1):
        raise CalibrationError("Orthogonal reference pixels are degenerate", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for c in constraints:
        px, py = c.pixel
        if c.axis == "u":
            rows.append([px, 1.0, 0.0, 0.0])
            rhs.append(c.value)
        else:
            rows.append([0.0, 0.0, py, 1.0])
            rhs.append(c.value)
    a, c0, e, f = _lstsq(np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 4, hint)
    matrix = np.array([[a, 0.0, c0], [0.0, e, f], [0.0, 0.0, 1.0]], dtype=np.float64)
    return Transform2D(model="orthogonal", matrix=matrix)


def _solve_affine(constraints: list[Constraint]) -> Transform2D:
    u_pts = _pixels_for(constraints, "u")
    v_pts = _pixels_for(constraints, "v")
    hint = "Need ≥3 non-collinear points pinning X and ≥3 non-collinear points pinning Y"
    if len(u_pts) < 3 or len(v_pts) < 3:
        raise CalibrationError("Affine model needs 3 X and 3 Y constraints", hint=hint)
    if _collinear(u_pts) or _collinear(v_pts):
        raise CalibrationError("Affine axis points are collinear", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for c in constraints:
        px, py = c.pixel
        if c.axis == "u":
            rows.append([px, py, 1.0, 0.0, 0.0, 0.0])
            rhs.append(c.value)
        else:
            rows.append([0.0, 0.0, 0.0, px, py, 1.0])
            rhs.append(c.value)
    a, b, c0, d, e, f = _lstsq(
        np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 6, hint
    )
    matrix = np.array([[a, b, c0], [d, e, f], [0.0, 0.0, 1.0]], dtype=np.float64)
    return Transform2D(model="affine", matrix=matrix)


def _solve_projective(constraints: list[Constraint]) -> Transform2D:
    full = _full_points(constraints)
    hint = "Need ≥4 points that each pin both X and Y, with no 3 collinear"
    if len(full) < 4:
        raise CalibrationError("Projective model needs 4 full (X,Y) points", hint=hint)
    pixels = [p for p, _u, _v in full]
    # any 3 of 4+ collinear is degenerate for a homography
    if len(pixels) >= 3:
        for i in range(len(pixels)):
            for j in range(i + 1, len(pixels)):
                for k in range(j + 1, len(pixels)):
                    if _collinear([pixels[i], pixels[j], pixels[k]]):
                        raise CalibrationError("Projective axis points have 3 collinear", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for (px, py), u, v in full:
        rows.append([px, py, 1.0, 0.0, 0.0, 0.0, -u * px, -u * py])
        rhs.append(u)
        rows.append([0.0, 0.0, 0.0, px, py, 1.0, -v * px, -v * py])
        rhs.append(v)
    h = _lstsq(np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 8, hint)
    matrix = np.array(
        [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]],
        dtype=np.float64,
    )
    return Transform2D(model="projective", matrix=matrix)


_SOLVERS = {
    "orthogonal": _solve_orthogonal,
    "affine": _solve_affine,
    "projective": _solve_projective,
}


def solve_transform(
    constraints: list[Constraint],
    model: TransformModel = "auto",
) -> Transform2D:
    if not constraints:
        raise CalibrationError(
            "No constraints to solve",
            hint="Place axis bounds or precise axis points",
        )
    if model != "auto":
        return _SOLVERS[model](constraints)
    last_error: CalibrationError | None = None
    for candidate in ("projective", "affine", "orthogonal"):
        try:
            return _SOLVERS[candidate](constraints)
        except CalibrationError as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise CalibrationError(
            "Cannot determine a transform from these axis points",
            hint=last_error.hint or "Add more non-collinear points that pin X and Y",
        )
    raise CalibrationError(
        "Cannot determine a transform from these axis points",
        hint="Add more non-collinear points that pin X and Y",
    )
