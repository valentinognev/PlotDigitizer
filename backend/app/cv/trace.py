from __future__ import annotations

import colorsys

import cv2
import numpy as np


def _hex_to_bgr(color_hex: str) -> tuple[int, int, int]:
    color_hex = color_hex.lstrip("#")
    if len(color_hex) != 6:
        return 59, 130, 246
    r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
    return b, g, r


def _interp_y_at_x(hints: list[tuple[float, float]], x: float) -> float:
    ordered = sorted(hints, key=lambda p: p[0])
    hx = [p[0] for p in ordered]
    hy = [p[1] for p in ordered]
    if x <= hx[0]:
        return hy[0]
    if x >= hx[-1]:
        return hy[-1]
    return float(np.interp(x, hx, hy))


def build_trace_mask(
    img: np.ndarray,
    color_hex: str,
    region: tuple[int, int, int, int] | None = None,
    corridor_mask: np.ndarray | None = None,
    *,
    allow_canny: bool = True,
    color_tolerance: int = 100,
) -> tuple[np.ndarray, dict]:
    """Build a binary mask of pixels matching the target curve color."""
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    target = np.array(_hex_to_bgr(color_hex), dtype=np.int16)

    diff = np.linalg.norm(img.astype(np.int16) - target, axis=2)
    mask[diff < color_tolerance] = 255
    color_mask_px = int(cv2.countNonZero(mask))

    target_rgb = (target[2] / 255, target[1] / 255, target[0] / 255)
    _, sat, _ = colorsys.rgb_to_hsv(*target_rgb)
    if sat > 0.15:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        th, _, _ = colorsys.rgb_to_hsv(*target_rgb)
        hue = int(th * 179)
        if hue <= 15 or hue >= 165:
            hue_mask = cv2.inRange(hsv, np.array([0, 50, 50]), np.array([15, 255, 255]))
            hue_mask2 = cv2.inRange(hsv, np.array([165, 50, 50]), np.array([179, 255, 255]))
            hue_mask = cv2.bitwise_or(hue_mask, hue_mask2)
        else:
            lower = np.array([max(0, hue - 20), 40, 40])
            upper = np.array([min(179, hue + 20), 255, 255])
            hue_mask = cv2.inRange(hsv, lower, upper)
        mask = cv2.bitwise_or(mask, hue_mask)

    after_hue_px = int(cv2.countNonZero(mask))

    used_canny = False
    if allow_canny and after_hue_px < 10:
        used_canny = True
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        mask = cv2.bitwise_or(mask, edges)

    if region:
        x, y, w, h = region
        roi = np.zeros_like(mask)
        x2, y2 = min(img.shape[1], x + w), min(img.shape[0], y + h)
        roi[max(0, y) : y2, max(0, x) : x2] = 255
        mask = cv2.bitwise_and(mask, roi)

    after_region_px = int(cv2.countNonZero(mask))

    if corridor_mask is not None:
        mask = cv2.bitwise_and(mask, corridor_mask)

    after_corridor_px = int(cv2.countNonZero(mask))

    if cv2.countNonZero(mask) > 50:
        kernel = np.ones((2, 2), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    meta = {
        "color_hex": color_hex,
        "target_bgr": list(map(int, target)),
        "color_tolerance": color_tolerance,
        "color_mask_px": color_mask_px,
        "after_hue_px": after_hue_px,
        "used_canny": used_canny,
        "after_region_px": after_region_px,
        "after_corridor_px": after_corridor_px,
    }
    return mask, meta


def trace_curve_path(
    image_bytes: bytes,
    color_hex: str,
    region: tuple[int, int, int, int] | None = None,
    corridor_mask: np.ndarray | None = None,
    *,
    allow_canny: bool = True,
    color_tolerance: int = 100,
    hint_polyline: list[tuple[float, float]] | None = None,
) -> list[tuple[float, float]]:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    mask, meta = build_trace_mask(
        img,
        color_hex,
        region=region,
        corridor_mask=corridor_mask,
        allow_canny=allow_canny,
        color_tolerance=color_tolerance,
    )

    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return []

    order = np.argsort(xs)
    xs_sorted = xs[order]
    ys_sorted = ys[order]

    buckets: dict[int, list[int]] = {}
    for x, y in zip(xs_sorted, ys_sorted, strict=False):
        buckets.setdefault(int(x), []).append(int(y))

    path: list[tuple[float, float]] = []
    for x, ys_list in sorted(buckets.items()):
        if hint_polyline:
            expected_y = _interp_y_at_x(hint_polyline, float(x))
            best_y = min(ys_list, key=lambda y: abs(y - expected_y))
            if abs(best_y - expected_y) > 40:
                continue
            path.append((float(x), float(best_y)))
        else:
            path.append((float(x), float(np.median(ys_list))))

    return path
