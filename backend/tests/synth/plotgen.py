from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class AxisPoint:
    pixel: tuple[float, float]
    x_value: float | None = None
    y_value: float | None = None


@dataclass
class SynthPlot:
    image: np.ndarray
    pixel_of: Callable[[float, float], tuple[float, float]]
    data_of: Callable[[float, float], tuple[float, float]]
    axis_points: list[AxisPoint]
    truth: list[tuple[float, float]]


def _homography(
    width: float, height: float, rotation_deg: float, perspective: float | None
) -> np.ndarray:
    rotation = np.eye(3, dtype=np.float64)
    if rotation_deg:
        affine = cv2.getRotationMatrix2D((width / 2.0, height / 2.0), float(rotation_deg), 1.0)
        rotation[:2, :] = affine
    persp = np.eye(3, dtype=np.float64)
    if perspective:
        inset = float(perspective) * width
        src = np.array(
            [[0.0, 0.0], [width, 0.0], [width, height], [0.0, height]],
            dtype=np.float32,
        )
        dst = np.array(
            [[inset, 0.0], [width - inset, 0.0], [width, height], [0.0, height]],
            dtype=np.float32,
        )
        persp = cv2.getPerspectiveTransform(src, dst).astype(np.float64)
    return persp @ rotation


def _apply(matrix: np.ndarray, x: float, y: float) -> tuple[float, float]:
    vec = matrix @ np.array([x, y, 1.0], dtype=np.float64)
    if abs(vec[2]) < 1e-18:
        raise ValueError("degenerate transform")
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def _to_unit(val: float, lo: float, hi: float, log: bool) -> float:
    if log:
        return (math.log10(val) - math.log10(lo)) / (math.log10(hi) - math.log10(lo))
    return (val - lo) / (hi - lo)


def _from_unit(u: float, lo: float, hi: float, log: bool) -> float:
    if log:
        return float(10 ** (math.log10(lo) + u * (math.log10(hi) - math.log10(lo))))
    return float(lo + u * (hi - lo))


def _draw_polyline(
    img: np.ndarray,
    pts: list[tuple[float, float]],
    color: tuple[int, int, int],
    width: int,
) -> None:
    if len(pts) < 2:
        return
    arr = np.array([[int(round(x)), int(round(y))] for x, y in pts], dtype=np.int32)
    cv2.polylines(img, [arr], False, color, thickness=int(width), lineType=cv2.LINE_8)


def _draw_marker(
    img: np.ndarray, px: float, py: float, spec: dict
) -> None:
    shape = str(spec.get("shape", "circle"))
    size = int(spec.get("size", 5))
    color = tuple(int(c) for c in spec.get("color", (0, 0, 255)))
    x, y = int(round(px)), int(round(py))
    if shape == "diamond":
        pts = np.array(
            [[x, y - size], [x + size, y], [x, y + size], [x - size, y]],
            dtype=np.int32,
        )
        cv2.fillConvexPoly(img, pts, color)
        return
    if shape == "square":
        cv2.rectangle(img, (x - size, y - size), (x + size, y + size), color, -1)
        return
    if shape == "triangle":
        pts = np.array(
            [[x, y - size], [x + size, y + size], [x - size, y + size]],
            dtype=np.int32,
        )
        cv2.fillConvexPoly(img, pts, color)
        return
    cv2.circle(img, (x, y), size, color, -1, lineType=cv2.LINE_8)


def render_plot(
    func: Callable[[float], float],
    *,
    x_range: tuple[float, float],
    y_range: tuple[float, float],
    size: tuple[int, int] = (800, 600),
    log_x: bool = False,
    log_y: bool = False,
    grid: tuple[int, int] | None = None,
    rotation_deg: float = 0.0,
    perspective: float | None = None,
    line_width: int = 2,
    line_color: tuple[int, int, int] = (0, 0, 255),
    markers: int | Sequence[dict] | None = None,
    noise: float = 0.0,
    background: tuple[int, int, int] = (255, 255, 255),
) -> SynthPlot:
    width, height = int(size[0]), int(size[1])
    xmin, xmax = float(x_range[0]), float(x_range[1])
    ymin, ymax = float(y_range[0]), float(y_range[1])
    if log_x and (xmin <= 0 or xmax <= 0):
        raise ValueError("log_x requires x_range > 0")
    if log_y and (ymin <= 0 or ymax <= 0):
        raise ValueError("log_y requires y_range > 0")

    x0 = 0.12 * width
    x1 = width - x0
    y_top = 0.12 * height
    y_bot = height - y_top

    def plot_xy(x: float, y: float) -> tuple[float, float]:
        u = _to_unit(x, xmin, xmax, log_x)
        v = _to_unit(y, ymin, ymax, log_y)
        return x0 + u * (x1 - x0), y_bot - v * (y_bot - y_top)

    def data_xy(px: float, py: float) -> tuple[float, float]:
        u = (px - x0) / (x1 - x0)
        v = (y_bot - py) / (y_bot - y_top)
        return _from_unit(u, xmin, xmax, log_x), _from_unit(v, ymin, ymax, log_y)

    transform = _homography(float(width), float(height), rotation_deg, perspective)
    inverse = np.linalg.inv(transform)

    def pixel_of(x: float, y: float) -> tuple[float, float]:
        px, py = plot_xy(x, y)
        return _apply(transform, px, py)

    def data_of(px: float, py: float) -> tuple[float, float]:
        qx, qy = _apply(inverse, px, py)
        return data_xy(qx, qy)

    img = np.full((height, width, 3), background, dtype=np.uint8)
    grid_color = (200, 200, 200)
    if grid is not None:
        nx, ny = int(grid[0]), int(grid[1])
        for i in range(1, nx + 1):
            t = i / (nx + 1)
            x = x0 + t * (x1 - x0)
            p1 = (int(round(x)), int(round(y_top)))
            p2 = (int(round(x)), int(round(y_bot)))
            cv2.line(img, p1, p2, grid_color, 1, lineType=cv2.LINE_8)
        for j in range(1, ny + 1):
            t = j / (ny + 1)
            y = y_top + t * (y_bot - y_top)
            p1 = (int(round(x0)), int(round(y)))
            p2 = (int(round(x1)), int(round(y)))
            cv2.line(img, p1, p2, grid_color, 1, lineType=cv2.LINE_8)

    n = 400
    xs = (
        np.logspace(math.log10(xmin), math.log10(xmax), n)
        if log_x
        else np.linspace(xmin, xmax, n)
    )
    truth: list[tuple[float, float]] = []
    pts: list[tuple[float, float]] = []
    for raw_x in xs:
        x = float(raw_x)
        y = float(func(x))
        if y < ymin or y > ymax:
            if pts:
                _draw_polyline(img, pts, line_color, line_width)
                pts = []
            continue
        truth.append((x, y))
        pts.append(plot_xy(x, y))
    if pts:
        _draw_polyline(img, pts, line_color, line_width)

    if isinstance(markers, Sequence) and not isinstance(markers, (str, bytes)):
        for spec in markers:
            xy = spec["xy"]
            px, py = plot_xy(float(xy[0]), float(xy[1]))
            _draw_marker(img, px, py, spec)
    elif markers is not None:
        visible = [(x, y) for x, y in truth if ymin <= y <= ymax]
        if visible:
            radius = int(markers)
            idxs = np.linspace(0, len(visible) - 1, 12).astype(int)
            for i in idxs:
                px, py = plot_xy(*visible[int(i)])
                cv2.circle(
                    img,
                    (int(round(px)), int(round(py))),
                    radius,
                    line_color,
                    -1,
                    lineType=cv2.LINE_8,
                )

    if rotation_deg or perspective:
        img = cv2.warpPerspective(
            img,
            transform.astype(np.float32),
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=background,
        )

    if noise > 0:
        rng = np.random.default_rng(0)
        gauss = rng.normal(0.0, float(noise), img.shape)
        img = np.clip(img.astype(np.float64) + gauss, 0, 255).astype(np.uint8)

    axis_points = [
        AxisPoint(pixel=pixel_of(xmin, ymin), x_value=xmin, y_value=ymin),
        AxisPoint(pixel=pixel_of(xmax, ymin), x_value=xmax, y_value=ymin),
        AxisPoint(pixel=pixel_of(xmin, ymax), x_value=xmin, y_value=ymax),
        AxisPoint(pixel=pixel_of(xmax, ymax), x_value=xmax, y_value=ymax),
    ]
    return SynthPlot(
        image=img,
        pixel_of=pixel_of,
        data_of=data_of,
        axis_points=axis_points,
        truth=truth,
    )
