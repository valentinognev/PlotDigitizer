from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.calibration.calibration import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.segments import build_segments, fill_segment
from app.models.schemas import Calibration, CalibrationAxis, ColorFilter, RefPoint
from metrics import assert_not_worse, rms_error
from tests.reference.refcorpus import sample_image


pytestmark = pytest.mark.reference


@pytest.fixture
def ref_dir(plotdig_ref_dir):
    return plotdig_ref_dir


def _plot_frame_bounds(img_bgr: np.ndarray) -> tuple[float, float, float, float]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    dark = (gray < 40).astype(np.uint8) * 255
    row_counts = dark.sum(axis=1)
    col_counts = dark.sum(axis=0)
    h_rows = np.where(row_counts > 0.35 * dark.shape[1] * 255)[0]
    v_cols = np.where(col_counts > 0.35 * dark.shape[0] * 255)[0]
    assert h_rows.size >= 2 and v_cols.size >= 2, "gnuplot axis frame not found"
    return (
        float(v_cols.min()),
        float(v_cols.max()),
        float(h_rows.min()),
        float(h_rows.max()),
    )


def _cal_from_frame(
    img_bgr: np.ndarray,
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    *,
    log_y: bool = False,
) -> Calibration:
    x_left, x_right, y_top, y_bottom = _plot_frame_bounds(img_bgr)
    return Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=x0),
                RefPoint(pixel=(x_right, y_bottom), value=x1),
            ],
        ),
        y=CalibrationAxis(
            scale="log" if log_y else "linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=y0),
                RefPoint(pixel=(x_left, y_top), value=y1),
            ],
        ),
        source="manual",
    )


def _rms_against_funcs(
    filled_data: list[tuple[float, float]],
    funcs,
    x_lo: float,
    x_hi: float,
) -> tuple[float, float]:
    pred = np.asarray(filled_data, dtype=np.float64)
    in_range = (pred[:, 0] >= x_lo) & (pred[:, 0] <= x_hi)
    px = pred[in_range, 0]
    py = pred[in_range, 1]
    xs = np.linspace(x_lo, x_hi, 1500)
    best = math.inf
    all_ys: list[float] = []
    for fn in funcs:
        ys = np.array([float(fn(x)) for x in xs], dtype=np.float64)
        all_ys.extend(ys.tolist())
        truth_y = np.array([float(fn(x)) for x in px], dtype=np.float64)
        err = rms_error(py, truth_y)
        best = min(best, err)
    y_span = float(max(all_ys) - min(all_ys)) if all_ys else 1.0
    return best, y_span


def _hue_stroke_mask(img_bgr: np.ndarray, low: float, high: float) -> np.ndarray:
    """Hue-isolate a gnuplot curve and dilate 1px strokes so build_segments can walk them."""
    mask = build_filter_mask(img_bgr, ColorFilter(mode="hue", low=low, high=high))
    if int(cv2.countNonZero(mask)) < 50:
        mask = build_filter_mask(img_bgr, ColorFilter())
    return cv2.dilate(mask, np.ones((2, 2), np.uint8))


def test_fill_corners_on_reference_corners_png(ref_dir):
    img = sample_image(ref_dir, "corners.png")
    mask = build_filter_mask(img, ColorFilter())
    segs = build_segments(mask, min_length=8.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    plain = fill_segment(seg, separation=40.0, fill_corners=False, mask=mask)
    with_corners = fill_segment(seg, separation=40.0, fill_corners=True, mask=mask)
    assert len(with_corners) > len(plain)


def test_segment_fill_gnuplot_x_y_lines_rms(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_y_lines_nogrid.png")
    # Red x*sin(x/3). 2×2 dilate: 1px gnuplot strokes otherwise fragment in build_segments.
    mask = _hue_stroke_mask(img, 0.0, 0.08)
    segs = build_segments(mask, min_length=30.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    # Labeled axes on this PNG are X∈[-10,10], Y∈[-2,10] (gnuplot padded ticks).
    cal = _cal_from_frame(img, -10.0, 10.0, -2.0, 10.0, log_y=False)
    pred = [pixel_to_data(cal, p) for p in filled]
    err, y_span = _rms_against_funcs(
        pred,
        [
            lambda x: x * math.sin(x / 3.0),
            lambda x: x * math.sin(x / 4.0),
            lambda x: x * math.sin(x / 5.0),
        ],
        -10.0,
        10.0,
    )
    assert err <= 0.02 * y_span
    assert_not_worse("segment_fill_ref_gnuplot_xy_rms", err, lower_is_better=True)


def test_segment_fill_gnuplot_x_log_y_lines_rms(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_log_y_lines_nogrid.png")
    # Default intensity filter keeps the axis frame (longest "segment"). Hue+dilate isolates red.
    mask = _hue_stroke_mask(img, 0.0, 0.08)
    segs = build_segments(mask, min_length=30.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    # Labeled axes: X∈[-10,10], log Y∈[0.1,1000]. Curves exist for x>0.
    cal = _cal_from_frame(img, -10.0, 10.0, 0.1, 1000.0, log_y=True)
    pred = [pixel_to_data(cal, p) for p in filled]
    err, y_span = _rms_against_funcs(
        pred,
        [
            lambda x: x * math.exp(x / 3.0),
            lambda x: x * math.exp(x / 4.0),
            lambda x: x * math.exp(x / 5.0),
        ],
        0.2,
        10.0,
    )
    assert err <= 0.02 * y_span
    assert_not_worse("segment_fill_ref_gnuplot_xlogy_rms", err, lower_is_better=True)
