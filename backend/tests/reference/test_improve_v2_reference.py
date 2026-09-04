from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.calibration.calibration import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.improve import improve_curve_from_hints
from app.models.schemas import Calibration, CalibrationAxis, ColorFilter, RefPoint
from metrics import assert_not_worse, rms_error
from tests.reference.refcorpus import sample_image


pytestmark = pytest.mark.reference

BASELINE = Path(__file__).resolve().parents[1] / "reference" / "baselines" / "metrics.json"


@pytest.fixture
def ref_dir(plotdig_ref_dir):
    return plotdig_ref_dir


def _v1(name: str) -> float:
    data = json.loads(BASELINE.read_text())
    return float(data[name])


def _y_rms(pred, truth) -> float:
    pred_a = np.asarray(pred, dtype=np.float64)
    truth_a = np.asarray(truth, dtype=np.float64)
    order = np.argsort(truth_a[:, 0])
    iy = np.interp(pred_a[:, 0], truth_a[order, 0], truth_a[order, 1])
    return rms_error(pred_a[:, 1], iy)


def test_improve_v2_gnuplot_xy_strictly_better_than_v1(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_y_lines_nogrid.png")
    ok, buf = cv2.imencode(".png", img)
    assert ok
    image_bytes = buf.tobytes()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    dark = (gray < 40).astype(np.uint8) * 255
    h_rows = np.where(dark.sum(axis=1) > 0.35 * dark.shape[1] * 255)[0]
    v_cols = np.where(dark.sum(axis=0) > 0.35 * dark.shape[0] * 255)[0]
    x_left, x_right = float(v_cols.min()), float(v_cols.max())
    y_top, y_bottom = float(h_rows.min()), float(h_rows.max())
    xs = np.linspace(-10.0, 10.0, 2000)
    ys = xs * np.sin(xs / 3.0)
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=-10.0),
                RefPoint(pixel=(x_right, y_bottom), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=float(ys.min())),
                RefPoint(pixel=(x_left, y_top), value=float(ys.max())),
            ],
        ),
        source="manual",
    )
    hints = [
        (x_left + 0.2 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
        (x_left + 0.5 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
        (x_left + 0.8 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
    ]
    mask = build_filter_mask(img, ColorFilter())
    points = improve_curve_from_hints(
        image_bytes, "#0000ff", hints, 24, mask=mask
    )
    pred = [pixel_to_data(cal, p.pixel) for p in points]
    truth = [(float(x), float(x * math.sin(x / 3.0))) for x in xs]
    err = _y_rms(pred, truth)
    key = "improve_v1_ref_gnuplot_xy_rms"
    data = json.loads(BASELINE.read_text())
    if key not in data:
        assert_not_worse(key, err, lower_is_better=True)
        pytest.skip("v1 gnuplot key recorded this run; re-run after v2 rewrite")
    assert err < _v1(key)
    assert_not_worse("improve_v2_ref_gnuplot_xy_rms", err, lower_is_better=True)
