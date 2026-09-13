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


def _hex_to_bgr(hex_color: str) -> np.ndarray:
    h = hex_color.strip().lstrip("#")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return np.array([b, g, r], dtype=np.float32)


def _bgr_dist01(pixels_bgr: np.ndarray, sample_bgr: np.ndarray) -> np.ndarray:
    delta = pixels_bgr.astype(np.float32) - sample_bgr.reshape((1,) * (pixels_bgr.ndim - 1) + (3,))
    return np.sqrt(np.sum(delta * delta, axis=-1)) / (255.0 * math.sqrt(3.0))


def build_filter_mask(img_bgr: np.ndarray, flt: ColorFilter) -> np.ndarray:
    if flt.mode == "intensity":
        keep = _in_linear_range(_luminance01(img_bgr), flt.low, flt.high)
    elif flt.mode == "foreground":
        bg = _modal_background_bgr(img_bgr)
        dist = _bgr_dist01(img_bgr, bg)
        keep = _in_linear_range(dist, flt.low, flt.high)
    elif flt.mode == "hue":
        # Hue is undefined at S=0 (OpenCV reports H=0 for white/gray).
        keep = _in_hue_range(_hue01(img_bgr), flt.low, flt.high) & (_sat01(img_bgr) > 0)
    elif flt.mode == "saturation":
        keep = _in_linear_range(_sat01(img_bgr), flt.low, flt.high)
    elif flt.mode == "sample":
        if not flt.sample_color:
            keep = np.zeros(img_bgr.shape[:2], dtype=bool)
        else:
            sample = _hex_to_bgr(flt.sample_color)
            keep = _bgr_dist01(img_bgr, sample) <= flt.high
    else:
        keep = _in_linear_range(_val01(img_bgr), flt.low, flt.high)
    return keep.astype(np.uint8) * 255


def dominant_trace_colors(img_bgr: np.ndarray, limit: int = 8) -> list[str]:
    bg = _modal_background_bgr(img_bgr)
    sampled = img_bgr[::4, ::4]
    pixels = sampled.reshape(-1, 3).astype(np.float32)
    if pixels.size == 0:
        return []

    dist = _bgr_dist01(pixels, bg)
    sat = _sat01(sampled).reshape(-1)
    keep = dist > 0.08
    # Median sat of the whole figure is ~0 (paper). Detect a colour plot from
    # chromatic pixels among the non-background remainder so grey grid/axes
    # are not proposed as traces.
    chromatic = keep & (sat >= 0.08)
    if int(np.count_nonzero(chromatic)) >= 8:
        keep = chromatic
    else:
        lum = _luminance01(sampled).reshape(-1)
        bg_lum = float(0.114 * bg[0] + 0.587 * bg[1] + 0.299 * bg[2]) / 255.0
        keep &= np.abs(lum - bg_lum) > 0.08

    remaining = pixels[keep]
    if remaining.shape[0] == 0:
        return []

    rgb_u8 = np.clip(np.rint(remaining[:, ::-1]), 0, 255).astype(np.int32)
    bins = rgb_u8 >> 3
    keys = bins[:, 0] * 1024 + bins[:, 1] * 32 + bins[:, 2]
    unique, counts = np.unique(keys, return_counts=True)
    order = np.argsort(-counts)[: max(limit, 0)]
    out: list[str] = []
    for i in order:
        mean_bgr = remaining[keys == unique[i]].mean(axis=0)
        out.append(_bgr_to_hex(mean_bgr))
    return out


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
