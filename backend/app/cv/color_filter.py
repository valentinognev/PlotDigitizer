from __future__ import annotations

import math

import cv2
import numpy as np

from app.models.schemas import ColorFilter


def _clip_pixel(img_bgr: np.ndarray, pixel: tuple[float, float]) -> tuple[int, int]:
    h, w = img_bgr.shape[:2]
    x = int(round(pixel[0]))
    y = int(round(pixel[1]))
    x = min(max(x, 0), w - 1)
    y = min(max(y, 0), h - 1)
    return x, y


def _bgr_to_hex(bgr: np.ndarray) -> str:
    b, g, r = (int(bgr[0]), int(bgr[1]), int(bgr[2]))
    return f"#{r:02x}{g:02x}{b:02x}"


def _luminance01(img_bgr: np.ndarray) -> np.ndarray:
    bgr = img_bgr.astype(np.float32)
    y = 0.114 * bgr[:, :, 0] + 0.587 * bgr[:, :, 1] + 0.299 * bgr[:, :, 2]
    return y / 255.0


def _modal_background_bgr(img_bgr: np.ndarray) -> np.ndarray:
    sampled = img_bgr[::4, ::4].reshape(-1, 3)
    if sampled.size == 0:
        sampled = img_bgr.reshape(-1, 3)
    packed = (
        sampled[:, 0].astype(np.uint32) << 16
        | sampled[:, 1].astype(np.uint32) << 8
        | sampled[:, 2].astype(np.uint32)
    )
    values, counts = np.unique(packed, return_counts=True)
    mode = int(values[int(np.argmax(counts))])
    return np.array([(mode >> 16) & 255, (mode >> 8) & 255, mode & 255], dtype=np.float32)


def _hue01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 0].astype(np.float32) / 179.0


def _sat01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 1].astype(np.float32) / 255.0


def _val01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 2].astype(np.float32) / 255.0


def _in_linear_range(channel: np.ndarray, low: float, high: float) -> np.ndarray:
    lo, hi = (low, high) if low <= high else (high, low)
    return (channel >= lo) & (channel <= hi)


def _in_hue_range(hue: np.ndarray, low: float, high: float) -> np.ndarray:
    if low <= high:
        return (hue >= low) & (hue <= high)
    return (hue >= low) | (hue <= high)


def build_filter_mask(img_bgr: np.ndarray, flt: ColorFilter) -> np.ndarray:
    if flt.mode == "intensity":
        keep = _in_linear_range(_luminance01(img_bgr), flt.low, flt.high)
    elif flt.mode == "foreground":
        bg = _modal_background_bgr(img_bgr)
        delta = img_bgr.astype(np.float32) - bg.reshape(1, 1, 3)
        dist = np.sqrt(np.sum(delta * delta, axis=2)) / (255.0 * math.sqrt(3.0))
        keep = _in_linear_range(dist, flt.low, flt.high)
    elif flt.mode == "hue":
        # Hue is undefined at S=0 (OpenCV reports H=0 for white/gray).
        keep = _in_hue_range(_hue01(img_bgr), flt.low, flt.high) & (_sat01(img_bgr) > 0)
    elif flt.mode == "saturation":
        keep = _in_linear_range(_sat01(img_bgr), flt.low, flt.high)
    else:
        keep = _in_linear_range(_val01(img_bgr), flt.low, flt.high)
    return keep.astype(np.uint8) * 255


def suggest_filter_from_pixel(img_bgr: np.ndarray, pixel: tuple[float, float]) -> ColorFilter:
    x, y = _clip_pixel(img_bgr, pixel)
    bgr = img_bgr[y, x]
    hex_color = _bgr_to_hex(bgr)
    hsv = cv2.cvtColor(bgr.reshape(1, 1, 3), cv2.COLOR_BGR2HSV)[0, 0]
    hue = float(hsv[0]) / 179.0
    sat = float(hsv[1]) / 255.0
    intensity = float(0.114 * bgr[0] + 0.587 * bgr[1] + 0.299 * bgr[2]) / 255.0
    if sat >= 0.25:
        half = 0.04
        low = (hue - half) % 1.0
        high = (hue + half) % 1.0
        return ColorFilter(mode="hue", low=low, high=high, sample_color=hex_color)
    low = max(0.0, intensity - 0.15)
    high = min(1.0, intensity + 0.15)
    return ColorFilter(mode="intensity", low=low, high=high, sample_color=hex_color)
