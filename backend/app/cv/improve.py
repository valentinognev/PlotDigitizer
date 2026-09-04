from __future__ import annotations

import cv2
import numpy as np

from app.cv.color_filter import build_filter_mask
from app.cv.order import order_points_along_curve
from app.cv.resample import resample_path
from app.cv.snap import snap_to_ink
from app.models.schemas import ColorFilter, Point


def _bbox_from_hints(
    hints: list[tuple[float, float]],
    width: int,
    height: int,
    padding: int = 24,
) -> tuple[int, int, int, int]:
    xs = [h[0] for h in hints]
    ys = [h[1] for h in hints]
    x0 = max(0, int(min(xs)) - padding)
    y0 = max(0, int(min(ys)) - padding)
    x1 = min(width, int(max(xs)) + padding)
    y1 = min(height, int(max(ys)) + padding)
    return x0, y0, max(1, x1 - x0), max(1, y1 - y0)


def _corridor_mask(
    hints: list[tuple[float, float]],
    shape: tuple[int, ...],
    radius: int = 30,
) -> np.ndarray:
    mask = np.zeros(shape[:2], dtype=np.uint8)
    pts = np.array(
        [[int(round(x)), int(round(y))] for x, y in hints],
        dtype=np.int32,
    )
    thickness = max(8, radius)
    if len(pts) >= 2:
        cv2.polylines(mask, [pts], False, 255, thickness=thickness)
    elif len(pts) == 1:
        cv2.circle(mask, tuple(pts[0]), radius, 255, -1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius, radius))
    return cv2.dilate(mask, kernel)


def _bgr_to_hex(b: int, g: int, r: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def _is_near_white(hex_color: str, thresh: int = 235) -> bool:
    hx = hex_color.lstrip("#")
    if len(hx) != 6:
        return False
    r, g, b = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
    return r >= thresh and g >= thresh and b >= thresh


def _sample_color_from_hints(
    img: np.ndarray,
    hints: list[tuple[float, float]],
    fallback_hex: str,
) -> tuple[str, int]:
    """Kept for erase.py; not used by Improve v2 thresholding."""
    height, width = img.shape[:2]
    dark_samples: list[np.ndarray] = []
    center_samples: list[np.ndarray] = []

    for x, y in hints:
        xi, yi = int(round(x)), int(round(y))
        if 0 <= yi < height and 0 <= xi < width:
            center_samples.append(img[yi, xi])
        y0, y1 = max(0, yi - 4), min(height, yi + 5)
        x0, x1 = max(0, xi - 4), min(width, xi + 5)
        patch = img[y0:y1, x0:x1].reshape(-1, 3)
        if patch.size == 0:
            continue
        lum = patch[:, 0] * 0.114 + patch[:, 1] * 0.587 + patch[:, 2] * 0.299
        darkest_n = max(1, len(patch) // 4)
        darkest = patch[np.argsort(lum)[:darkest_n]]
        dark_samples.append(darkest)

    if not dark_samples:
        return fallback_hex, 100

    stacked = np.vstack(dark_samples)
    med = np.median(stacked, axis=0)
    hex_color = _bgr_to_hex(int(med[0]), int(med[1]), int(med[2]))

    if _is_near_white(hex_color) and center_samples:
        center = np.median(np.vstack(center_samples), axis=0)
        hex_color = _bgr_to_hex(int(center[0]), int(center[1]), int(center[2]))

    spread = float(np.std(stacked, axis=0).mean())
    tolerance = int(max(25, min(55, spread * 2 + 22)))
    return hex_color, tolerance


def _local_direction(
    points: list[tuple[float, float]], index: int
) -> tuple[float, float] | None:
    if len(points) < 2:
        return None
    if index <= 0:
        a, b = points[0], points[1]
    elif index >= len(points) - 1:
        a, b = points[-2], points[-1]
    else:
        a, b = points[index - 1], points[index + 1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = float(np.hypot(dx, dy))
    if norm < 1e-9:
        return None
    return (dx / norm, dy / norm)


def _snap_polyline_to_mask(
    hints: list[tuple[float, float]],
    mask: np.ndarray,
    target_count: int,
) -> list[Point]:
    dense_n = max(target_count * 4, len(hints) * 2, 20)
    guide = [p.pixel for p in resample_path(hints, dense_n)]
    if int(cv2.countNonZero(mask)) < 10:
        return resample_path(hints, target_count)
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return resample_path(hints, target_count)
    trace = np.stack([xs.astype(np.float64), ys.astype(np.float64)], axis=1)
    r2 = 25.0 * 25.0
    snapped: list[tuple[float, float]] = []
    for i, pt in enumerate(guide):
        gx, gy = pt
        d2 = (trace[:, 0] - gx) ** 2 + (trace[:, 1] - gy) ** 2
        near = d2 < r2
        if np.any(near):
            idx = int(np.argmin(np.where(near, d2, np.inf)))
            recovered = (float(trace[idx, 0]), float(trace[idx, 1]))
        else:
            recovered = (gx, gy)
        snapped.append(
            snap_to_ink(
                mask, recovered, window=7, direction=_local_direction(guide, i)
            )
        )
    return resample_path(snapped, target_count)


def improve_curve_from_hints(
    image_bytes: bytes,
    color_hex: str,
    hint_points: list[tuple[float, float]],
    target_count: int,
    mask: np.ndarray | None = None,
) -> list[Point]:
    hint_points = order_points_along_curve(hint_points)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return resample_path(hint_points, target_count)

    if mask is None:
        mask = build_filter_mask(img, ColorFilter())

    corridor = _corridor_mask(hint_points, img.shape)
    x, y, w, h = _bbox_from_hints(hint_points, img.shape[1], img.shape[0])
    roi = np.zeros_like(mask)
    roi[y : y + h, x : x + w] = 255
    masked = cv2.bitwise_and(mask, corridor)
    masked = cv2.bitwise_and(masked, roi)
    if int(cv2.countNonZero(masked)) < 10:
        return resample_path(hint_points, target_count)

    # color_hex stays in the signature for callers; thresholding uses `mask`.
    return _snap_polyline_to_mask(hint_points, masked, target_count)
