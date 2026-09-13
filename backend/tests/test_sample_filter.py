from __future__ import annotations

import numpy as np
import pytest

from app.models.schemas import ColorFilter


def _bgr(h: int, w: int, color: tuple[int, int, int]) -> np.ndarray:
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = color
    return img


def _paint(img: np.ndarray, sl_y: slice, sl_x: slice, color: tuple[int, int, int]) -> None:
    img[sl_y, sl_x] = color


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex_near(got: str, want: str, tol: int = 8) -> bool:
    g = _hex_rgb(got)
    w = _hex_rgb(want)
    return all(abs(a - b) <= tol for a, b in zip(g, w, strict=True))


def test_sample_keeps_red_line_rejects_white():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 255))  # BGR red
    mask = build_filter_mask(
        img, ColorFilter(mode="sample", high=0.12, sample_color="#ff0000")
    )
    assert mask.dtype == np.uint8
    assert mask.shape == (40, 60)
    assert mask[20, 30] == 255
    assert mask[2, 2] == 0


def test_sample_omitted_high_defaults_to_012_keeps_red_rejects_white():
    from app.cv.color_filter import build_filter_mask

    flt = ColorFilter(mode="sample", sample_color="#ff0000")
    assert flt.high == pytest.approx(0.12)

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 255))  # BGR red
    # dist to #ff0000 ≈ 0.25 — kept at the intensity default 0.4, rejected at 0.12
    _paint(img, slice(0, 5), slice(50, 55), (110, 0, 255))
    mask = build_filter_mask(img, flt)
    assert mask[20, 30] == 255
    assert mask[2, 2] == 0
    assert mask[2, 52] == 0


def test_intensity_high_field_default_remains_0_4():
    assert ColorFilter().high == pytest.approx(0.4)
    assert ColorFilter(mode="intensity").high == pytest.approx(0.4)


def test_dominant_trace_colors_finds_red_and_blue_rects():
    from app.cv.color_filter import dominant_trace_colors

    img = _bgr(80, 80, (255, 255, 255))
    _paint(img, slice(0, 20), slice(0, 20), (0, 0, 255))  # red
    _paint(img, slice(0, 20), slice(20, 40), (255, 0, 0))  # blue
    colors = dominant_trace_colors(img, limit=8)
    assert any(_hex_near(c, "#ff0000") for c in colors)
    assert any(_hex_near(c, "#0000ff") for c in colors)


def _is_near_gray_or_black_or_white(hex_color: str, tol: int = 24) -> bool:
    r, g, b = _hex_rgb(hex_color)
    if max(r, g, b) - min(r, g, b) <= tol:
        return True
    return max(r, g, b) <= tol


def test_dominant_trace_colors_skips_gray_grid_on_color_plot():
    from app.cv.color_filter import dominant_trace_colors

    img = _bgr(80, 80, (255, 255, 255))
    for y in range(0, 80, 4):
        img[y, :] = (192, 192, 192)
    for x in range(0, 80, 4):
        img[:, x] = (192, 192, 192)
    img[-1, :] = (0, 0, 0)
    img[:, 0] = (0, 0, 0)
    _paint(img, slice(10, 18), slice(10, 70), (0, 0, 255))  # red
    _paint(img, slice(30, 38), slice(10, 70), (255, 0, 0))  # blue

    colors = dominant_trace_colors(img, limit=8)
    assert any(_hex_near(c, "#ff0000") for c in colors)
    assert any(_hex_near(c, "#0000ff") for c in colors)
    assert colors, "expected chromatic traces"
    assert not any(_is_near_gray_or_black_or_white(c) for c in colors)


def test_dominant_trace_colors_keeps_black_ink_on_white():
    from app.cv.color_filter import dominant_trace_colors

    img = _bgr(80, 80, (255, 255, 255))
    _paint(img, slice(30, 50), slice(10, 70), (0, 0, 0))
    colors = dominant_trace_colors(img, limit=8)
    assert any(_hex_near(c, "#000000") for c in colors)
