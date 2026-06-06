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


def trace_curve_path(
    image_bytes: bytes,
    color_hex: str,
    region: tuple[int, int, int, int] | None = None,
) -> list[tuple[float, float]]:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    target = np.array(_hex_to_bgr(color_hex), dtype=np.int16)

  # Color distance mask with tolerance
    diff = np.linalg.norm(img.astype(np.int16) - target, axis=2)
    mask[diff < 100] = 255

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    th, _, _ = colorsys.rgb_to_hsv(target[2] / 255, target[1] / 255, target[0] / 255)
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

    if cv2.countNonZero(mask) < 10:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        mask = cv2.bitwise_or(mask, edges)

    if region:
        x, y, w, h = region
        roi = np.zeros_like(mask)
        x2, y2 = min(img.shape[1], x + w), min(img.shape[0], y + h)
        roi[max(0, y) : y2, max(0, x) : x2] = 255
        mask = cv2.bitwise_and(mask, roi)

    if cv2.countNonZero(mask) > 50:
        kernel = np.ones((2, 2), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return []

    order = np.argsort(xs)
    xs_sorted = xs[order]
    ys_sorted = ys[order]

  # One y per x bucket for a simple path
    buckets: dict[int, list[int]] = {}
    for x, y in zip(xs_sorted, ys_sorted, strict=False):
        buckets.setdefault(int(x), []).append(int(y))

    path = [(float(x), float(np.median(ys_list))) for x, ys_list in sorted(buckets.items())]
    return path
