from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from app.cv.improve import improve_curve_from_hints
from app.models.schemas import Curve, Point, Session
from app.pipeline.pipeline import run_cv_improve
from metrics import assert_not_worse, rms_error
from tests.synth.plotgen import render_plot


def _sine_plot():
    return render_plot(
        lambda x: math.sin(x),
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )


def _offset_hints(plot, n: int = 5, offset_px: float = 3.0):
    xs = [2.0 * math.pi * i / (n - 1) for i in range(n)]
    hints = []
    for x in xs:
        px, py = plot.pixel_of(x, math.sin(x))
        hints.append((px, py + offset_px))
    return hints


def _encode(plot) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".png", plot.image)
    assert ok
    return buf.tobytes()


def _y_rms(pred, truth) -> float:
    """Y-RMS of pred vs truth interpolated onto pred x (point counts differ)."""
    pred_a = np.asarray(pred, dtype=np.float64)
    truth_a = np.asarray(truth, dtype=np.float64)
    order = np.argsort(truth_a[:, 0])
    iy = np.interp(pred_a[:, 0], truth_a[order, 0], truth_a[order, 1])
    return rms_error(pred_a[:, 1], iy)


def _rms_for_hints(plot, hints, target=24) -> float:
    image_bytes = _encode(plot)
    points = improve_curve_from_hints(image_bytes, "#0000ff", hints, target)
    pred = [plot.data_of(p.pixel[0], p.pixel[1]) for p in points]
    return _y_rms(pred, plot.truth)


def test_improve_v1_baseline_keys_remain_frozen():
    data = json.loads(BASELINE.read_text())
    assert "improve_v1_synth_sine_rms" in data
    assert "improve_v1_synth_line_rms" in data
    # Must not remeasure — v2 lives in improve.py now.


def test_improve_white_corridor_falls_back_to_resample():
    import io

    from PIL import Image

    img = Image.new("RGB", (200, 100), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    hints = [(30.0, 40.0), (90.0, 40.0), (160.0, 40.0)]
    points = improve_curve_from_hints(buf.getvalue(), "#ff0000", hints, target_count=8)
    assert len(points) == 8
    assert points[0].pixel[0] == pytest.approx(30.0, abs=1.0)
    assert points[-1].pixel[0] == pytest.approx(160.0, abs=1.0)


def test_improve_signature_still_accepts_four_positional_args():
    plot = _sine_plot()
    hints = _offset_hints(plot)
    points = improve_curve_from_hints(_encode(plot), "#0000ff", hints, 12)
    assert len(points) == 12


BASELINE = Path(__file__).resolve().parent / "reference" / "baselines" / "metrics.json"


def _v1(name: str) -> float:
    data = json.loads(BASELINE.read_text())
    assert name in data, f"missing frozen v1 key {name}"
    return float(data[name])


def test_improve_v2_sine_strictly_better_than_v1():
    plot = _sine_plot()
    err = _rms_for_hints(plot, _offset_hints(plot))
    v1 = _v1("improve_v1_synth_sine_rms")
    assert err < v1
    assert_not_worse("improve_v2_synth_sine_rms", err, lower_is_better=True)


def test_improve_v2_line_strictly_better_than_v1():
    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(-1.0, 6.0),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )
    hints = []
    for x in (1.0, 4.0, 7.0, 9.0):
        px, py = plot.pixel_of(x, 0.5 * x)
        hints.append((px, py + 3.0))
    err = _rms_for_hints(plot, hints, target=16)
    v1 = _v1("improve_v1_synth_line_rms")
    assert err < v1
    assert_not_worse("improve_v2_synth_line_rms", err, lower_is_better=True)


def test_run_cv_improve_still_replaces_points_via_pipeline():
    plot = _sine_plot()
    image_bytes = _encode(plot)
    hints = _offset_hints(plot)
    session = Session(
        image_meta={"width": 800, "height": 600, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#0000ff",
                target_point_count=10,
                points=[Point(pixel=h, origin="user") for h in hints],
            )
        ],
    )
    result = run_cv_improve(session, image_bytes, "c1")
    assert len(result.curves[0].points) == 10
