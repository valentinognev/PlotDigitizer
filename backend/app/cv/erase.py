from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

from app.cv.improve import _is_near_white, _sample_color_from_hints
from app.cv.resample import resample_path


def _hex_to_bgr(color_hex: str) -> tuple[int, int, int]:
    color_hex = color_hex.lstrip("#")
    if len(color_hex) != 6:
        return 59, 130, 246
    r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
    return b, g, r


def _erase_corridor_mask(
    hint_points: list[tuple[float, float]],
    shape: tuple[int, ...],
    *,
    line_radius: int = 8,
) -> np.ndarray:
    """Narrow corridor along the hint polyline — only covers the target stroke."""
    dense_n = max(len(hint_points) * 4, 24)
    dense = [p.pixel for p in resample_path(hint_points, dense_n)]
    mask = np.zeros(shape[:2], dtype=np.uint8)
    pts = np.array([[int(round(x)), int(round(y))] for x, y in dense], dtype=np.int32)
    thickness = max(4, line_radius * 2)
    if len(pts) >= 2:
        cv2.polylines(mask, [pts], False, 255, thickness=thickness)
    elif len(pts) == 1:
        cv2.circle(mask, tuple(pts[0]), line_radius, 255, -1)
    # Small dilation for anti-aliased stroke edges only
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.dilate(mask, kernel, iterations=1)


def _color_match_in_corridor(
    img: np.ndarray,
    corridor: np.ndarray,
    color_hex: str,
    tolerance: int,
) -> np.ndarray:
    """Match target ink color only where the corridor mask is set."""
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    ys, xs = np.where(corridor > 0)
    if len(xs) == 0:
        return mask
    target = np.array(_hex_to_bgr(color_hex), dtype=np.int16)
    pixels = img[ys, xs].astype(np.int16)
    diff = np.linalg.norm(pixels - target, axis=1)
    match = diff < tolerance
    mask[ys[match], xs[match]] = 255
    return mask


def _ink_mask_in_corridor(
    img: np.ndarray,
    corridor: np.ndarray,
    bg_bgr: np.ndarray,
    *,
    lum_margin: float = 22.0,
) -> np.ndarray:
    """Pixels noticeably darker than plot background, clipped to the corridor."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg_lum = float(bg_bgr[0] * 0.114 + bg_bgr[1] * 0.587 + bg_bgr[2] * 0.299)
    dark = (gray < bg_lum - lum_margin).astype(np.uint8) * 255
    return cv2.bitwise_and(dark, corridor)


def _sample_background_bgr(img: np.ndarray, corridor: np.ndarray) -> np.ndarray:
    """Estimate plot background from corners and pixels outside the erase corridor."""
    height, width = img.shape[:2]
    margin = max(2, min(width, height) // 40)
    corners = [
        img[margin, margin],
        img[margin, width - margin - 1],
        img[height - margin - 1, margin],
        img[height - margin - 1, width - margin - 1],
    ]
    outside = img[corridor == 0]
    samples = list(corners)
    if len(outside) > 0:
        step = max(1, len(outside) // 500)
        samples.extend(outside[::step])
    return np.median(np.stack(samples, axis=0), axis=0).astype(np.uint8)


def remove_curve_from_image(
    image_bytes: bytes,
    hint_points: list[tuple[float, float]],
    color_hex: str,
) -> bytes:
    """Erase a curve from the image using hint points; returns PNG bytes."""
    if len(hint_points) < 2:
        raise ValueError("At least 2 points are required to remove a curve from the plot")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode plot image")

    height, width = img.shape[:2]
    corridor = _erase_corridor_mask(hint_points, img.shape, line_radius=8)

    bg = _sample_background_bgr(img, corridor)
    ink_mask = _ink_mask_in_corridor(img, corridor, bg)
    ink_px = int(cv2.countNonZero(ink_mask))

    sampled_hex, tolerance = _sample_color_from_hints(img, hint_points, color_hex)
    color_mask = np.zeros(img.shape[:2], dtype=np.uint8)
    if not _is_near_white(sampled_hex):
        color_mask = _color_match_in_corridor(img, corridor, sampled_hex, tolerance)

    erase_mask = cv2.bitwise_or(ink_mask, color_mask)
    if int(cv2.countNonZero(erase_mask)) < 8:
        erase_mask = ink_mask if ink_px >= 4 else corridor

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    erase_mask = cv2.morphologyEx(erase_mask, cv2.MORPH_CLOSE, kernel)
    erase_mask = cv2.dilate(erase_mask, kernel, iterations=1)
    erase_mask = cv2.bitwise_and(erase_mask, corridor)

    result = img.copy()
    result[erase_mask > 0] = bg

    rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="PNG")
    return buf.getvalue()
