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


def test_intensity_keeps_dark_ink_rejects_white():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 0))
    mask = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.2))
    assert mask.dtype == np.uint8
    assert mask.shape == (40, 60)
    assert set(np.unique(mask)).issubset({0, 255})
    assert mask[20, 30] == 255
    assert mask[2, 2] == 0


def test_value_differs_from_intensity_on_pure_blue():
    from app.cv.color_filter import build_filter_mask

    # BGR pure blue: V is high, Rec.601 luminance is low (~0.114).
    img = _bgr(20, 20, (255, 255, 255))
    _paint(img, slice(5, 15), slice(5, 15), (255, 0, 0))
    by_value = build_filter_mask(img, ColorFilter(mode="value", low=0.8, high=1.0))
    by_intensity = build_filter_mask(img, ColorFilter(mode="intensity", low=0.8, high=1.0))
    assert by_value[10, 10] == 255
    assert by_intensity[10, 10] == 0
    assert by_value[1, 1] == 255  # white also has V=1
    dark = _bgr(20, 20, (0, 0, 0))
    assert build_filter_mask(dark, ColorFilter(mode="value", low=0.8, high=1.0))[5, 5] == 0


def test_saturation_keeps_chroma_rejects_gray():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(20, 20, (128, 128, 128))
    _paint(img, slice(5, 15), slice(5, 15), (0, 0, 255))  # saturated red in BGR
    mask = build_filter_mask(img, ColorFilter(mode="saturation", low=0.5, high=1.0))
    assert mask[10, 10] == 255
    assert mask[1, 1] == 0


def test_foreground_uses_modal_background():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(30, 40, (255, 255, 255))
    _paint(img, slice(8, 22), slice(10, 30), (0, 0, 255))
    mask = build_filter_mask(img, ColorFilter(mode="foreground", low=0.2, high=1.0))
    assert mask[15, 20] == 255
    assert mask[1, 1] == 0


def test_hue_wraps_across_red():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(20, 30, (255, 255, 255))
    _paint(img, slice(2, 8), slice(2, 8), (0, 0, 255))      # OpenCV hue ~0 (red)
    _paint(img, slice(12, 18), slice(2, 8), (0, 0, 180))    # darker red, still near 0
    _paint(img, slice(2, 8), slice(20, 28), (255, 0, 0))    # blue, hue ~0.66
    flt = ColorFilter(mode="hue", low=0.90, high=0.10)
    mask = build_filter_mask(img, flt)
    assert mask[5, 5] == 255
    assert mask[15, 5] == 255
    assert mask[5, 24] == 0
    assert mask[1, 15] == 0


def test_hue_nonwrap_band_excludes_reds():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(16, 16, (255, 255, 255))
    _paint(img, slice(4, 12), slice(4, 12), (255, 0, 0))  # blue
    mask = build_filter_mask(img, ColorFilter(mode="hue", low=0.50, high=0.80))
    assert mask[8, 8] == 255
    red = _bgr(16, 16, (0, 0, 255))
    assert build_filter_mask(red, ColorFilter(mode="hue", low=0.50, high=0.80))[8, 8] == 0


def test_suggest_filter_from_pixel_captures_ink_rejects_background():
    from app.cv.color_filter import build_filter_mask, suggest_filter_from_pixel

    img = _bgr(50, 80, (255, 255, 255))
    _paint(img, slice(10, 40), slice(20, 60), (255, 0, 0))  # blue ink
    flt = suggest_filter_from_pixel(img, (40.2, 25.7))
    assert flt.sample_color is not None
    hex_color = flt.sample_color.lstrip("#")
    assert len(hex_color) == 6
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    assert b >= 240 and r <= 15 and g <= 15
    mask = build_filter_mask(img, flt)
    assert mask[25, 40] == 255
    assert mask[2, 2] == 0


def test_intensity_mask_f1_against_labelled_ink():
    from app.cv.color_filter import build_filter_mask
    from tests.metrics import mask_f1

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 0))
    truth = np.zeros((40, 60), dtype=np.uint8)
    truth[10:30, 20:40] = 255
    pred = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.2))
    assert mask_f1(pred, truth) >= 0.90


def test_color_filter_from_engauge_intensity_and_hue():
    from tests.reference.refcorpus import color_filter_from_engauge

    intensity = color_filter_from_engauge(
        {
            "ModeString": "Intensity",
            "IntensityLow": 10,
            "IntensityHigh": 50,
            "HueLow": 180,
            "HueHigh": 360,
        }
    )
    assert intensity.mode == "intensity"
    assert intensity.low == pytest.approx(0.10)
    assert intensity.high == pytest.approx(0.50)

    hue = color_filter_from_engauge(
        {"ModeString": "Hue", "HueLow": 330, "HueHigh": 30, "IntensityLow": 0, "IntensityHigh": 50}
    )
    assert hue.mode == "hue"
    assert hue.low == pytest.approx(330 / 360)
    assert hue.high == pytest.approx(30 / 360)
