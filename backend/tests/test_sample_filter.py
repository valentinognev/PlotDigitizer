from __future__ import annotations

import numpy as np

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


def test_dominant_trace_colors_finds_red_and_blue_rects():
    from app.cv.color_filter import dominant_trace_colors

    img = _bgr(80, 80, (255, 255, 255))
    _paint(img, slice(0, 20), slice(0, 20), (0, 0, 255))  # red
    _paint(img, slice(0, 20), slice(20, 40), (255, 0, 0))  # blue
    colors = dominant_trace_colors(img, limit=8)
    assert any(_hex_near(c, "#ff0000") for c in colors)
    assert any(_hex_near(c, "#0000ff") for c in colors)
