from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

from app.models.schemas import Calibration, RefPoint, Session


class UnskewError(ValueError):
    pass


@dataclass(frozen=True)
class UnskewResult:
    matrix: np.ndarray  # 3x3, maps source -> dest
    width: float
    height: float


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


def _line_intersection(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    p4: tuple[float, float],
) -> tuple[float, float]:
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        raise UnskewError("Axis lines are parallel")
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return float(px), float(py)


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    length = math.hypot(v[0], v[1])
    if length < 1e-9:
        raise UnskewError("Degenerate axis direction")
    return v[0] / length, v[1] / length


def _project_point_on_line(
    point: tuple[float, float],
    line_a: tuple[float, float],
    line_b: tuple[float, float],
) -> tuple[float, float]:
    ax, ay = line_a
    bx, by = line_b
    px, py = point
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom < 1e-9:
        raise UnskewError("Degenerate axis line")
    t = ((px - ax) * dx + (py - ay) * dy) / denom
    return ax + t * dx, ay + t * dy


def _gram_schmidt_y(x_dir: tuple[float, float], raw_y: tuple[float, float]) -> tuple[float, float]:
    dot = raw_y[0] * x_dir[0] + raw_y[1] * x_dir[1]
    y = (raw_y[0] - dot * x_dir[0], raw_y[1] - dot * x_dir[1])
    return _normalize(y)


def _quad_area(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> float:
    pts = [a, b, c, d]
    area = 0.0
    for i in range(4):
        j = (i + 1) % 4
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    return abs(area) * 0.5


def _translate_homography(matrix: np.ndarray, tx: float, ty: float) -> np.ndarray:
    t = np.array([[1.0, 0.0, tx], [0.0, 1.0, ty], [0.0, 0.0, 1.0]], dtype=np.float64)
    return t @ matrix.astype(np.float64)


def _expand_homography_to_full_image(
    matrix: np.ndarray,
    image_width: int,
    image_height: int,
) -> tuple[np.ndarray, float, float]:
    corners = (
        (0.0, 0.0),
        (float(image_width), 0.0),
        (float(image_width), float(image_height)),
        (0.0, float(image_height)),
    )
    transformed = [apply_homography_to_point(matrix, c) for c in corners]
    min_x = min(p[0] for p in transformed)
    min_y = min(p[1] for p in transformed)
    max_x = max(p[0] for p in transformed)
    max_y = max(p[1] for p in transformed)
    final = _translate_homography(matrix, -min_x, -min_y)
    return final, max_x - min_x, max_y - min_y


def compute_unskew_homography(
    xmin: tuple[float, float],
    xmax: tuple[float, float],
    ymin: tuple[float, float],
    ymax: tuple[float, float],
    *,
    image_width: int,
    image_height: int,
) -> UnskewResult:
    origin = _line_intersection(xmin, xmax, ymin, ymax)
    br = _project_point_on_line(xmax, xmin, xmax)
    tl = _project_point_on_line(ymax, ymin, ymax)

    x_raw = _normalize((br[0] - origin[0], br[1] - origin[1]))
    y_raw = (tl[0] - origin[0], tl[1] - origin[1])
    _gram_schmidt_y(x_raw, y_raw)

    plot_width = math.hypot(br[0] - origin[0], br[1] - origin[1])
    plot_height = math.hypot(tl[0] - origin[0], tl[1] - origin[1])
    if plot_width < 1 or plot_height < 1:
        raise UnskewError("Degenerate plot area")

    tr = (
        origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
        origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]),
    )

    src = np.float32([origin, br, tr, tl])
    # Image coords: y down — ymax (tl) at top, origin (ymin/xmin corner) at bottom.
    dst = np.float32(
        [
            [0, plot_height],
            [plot_width, plot_height],
            [plot_width, 0],
            [0, 0],
        ]
    )
    if _quad_area(tuple(src[0]), tuple(src[1]), tuple(src[2]), tuple(src[3])) < 1:
        raise UnskewError("Degenerate plot area")

    plot_matrix = cv2.getPerspectiveTransform(src, dst)
    matrix, out_width, out_height = _expand_homography_to_full_image(
        plot_matrix,
        image_width,
        image_height,
    )
    return UnskewResult(matrix=matrix, width=out_width, height=out_height)


def apply_homography_to_point(
    matrix: np.ndarray,
    point: tuple[float, float],
    *,
    inverse: bool = False,
) -> tuple[float, float]:
    m = np.linalg.inv(matrix) if inverse else matrix
    v = np.array([point[0], point[1], 1.0], dtype=np.float64)
    out = m @ v
    if abs(out[2]) < 1e-12:
        raise UnskewError("Point at infinity under homography")
    return float(out[0] / out[2]), float(out[1] / out[2])


def warp_image(image: np.ndarray, matrix: np.ndarray, width: float, height: float) -> np.ndarray:
    w, h = int(round(width)), int(round(height))
    return cv2.warpPerspective(image, matrix, (w, h))


def bounds_pixels_from_calibration(
    cal: Calibration,
) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float], tuple[float, float]]:
    xi = _extreme_ref_index(cal.x.ref_points, "x", "min")
    xa = _extreme_ref_index(cal.x.ref_points, "x", "max")
    yi = _extreme_ref_index(cal.y.ref_points, "y", "max")
    ya = _extreme_ref_index(cal.y.ref_points, "y", "min")
    xmin = tuple(cal.x.ref_points[xi].pixel)
    xmax = tuple(cal.x.ref_points[xa].pixel)
    ymin = tuple(cal.y.ref_points[yi].pixel)
    ymax = tuple(cal.y.ref_points[ya].pixel)
    return xmin, xmax, ymin, ymax


def remap_session_pixels(session: Session, matrix: np.ndarray) -> None:
    if session.calibration:
        for axis in (session.calibration.x, session.calibration.y):
            for ref in axis.ref_points:
                ref.pixel = apply_homography_to_point(matrix, ref.pixel)
    for curve in session.curves:
        for pt in curve.points:
            pt.pixel = apply_homography_to_point(matrix, pt.pixel)
