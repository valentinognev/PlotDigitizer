from __future__ import annotations

import math

import numpy as np
import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    resolution_at,
    validate_calibration,
)
from app.calibration.transform import CalibrationError
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis, RefPoint
from tests.metrics import max_abs_error
from tests.synth.plotgen import render_plot


# --- independent oracle: the v2.2 1D extreme-two-point fit (our code, not Engauge) ---

def _extreme_ref_index(ref_points, axis_name: str, which: str) -> int:
    coord = 0 if axis_name == "x" else 1
    idx = 0
    for i in range(1, len(ref_points)):
        v = ref_points[i].pixel[coord]
        best = ref_points[idx].pixel[coord]
        if which == "min" and v < best:
            idx = i
        elif which == "max" and v > best:
            idx = i
    return idx


def _fit_axis(ref_points, scale: str, axis_name: str) -> tuple[float, float]:
    i_a = _extreme_ref_index(ref_points, axis_name, "min")
    i_b = _extreme_ref_index(ref_points, axis_name, "max")
    pix_a = float(ref_points[i_a].pixel[0 if axis_name == "x" else 1])
    pix_b = float(ref_points[i_b].pixel[0 if axis_name == "x" else 1])
    val_a = float(ref_points[i_a].value)
    val_b = float(ref_points[i_b].value)
    if abs(pix_b - pix_a) < 1e-9:
        raise RuntimeError("oracle degenerate")
    if scale == "log":
        val_a = math.log10(val_a)
        val_b = math.log10(val_b)
    slope = (val_b - val_a) / (pix_b - pix_a)
    intercept = val_a - slope * pix_a
    return float(slope), float(intercept)


def oracle_pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    xs, xi = _fit_axis(cal.x.ref_points, cal.x.scale, "x")
    ys, yi = _fit_axis(cal.y.ref_points, cal.y.scale, "y")
    xt = xs * pixel[0] + xi
    yt = ys * pixel[1] + yi
    x = 10**xt if cal.x.scale == "log" else xt
    y = 10**yt if cal.y.scale == "log" else yt
    return float(x), float(y)


def _cal(x_scale, y_scale, x_pix, x_val, y_pix, y_val) -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale=x_scale,
            ref_points=[
                RefPoint(pixel=x_pix[0], value=x_val[0]),
                RefPoint(pixel=x_pix[1], value=x_val[1]),
            ],
        ),
        y=CalibrationAxis(
            scale=y_scale,
            ref_points=[
                RefPoint(pixel=y_pix[0], value=y_val[0]),
                RefPoint(pixel=y_pix[1], value=y_val[1]),
            ],
        ),
        source="manual",
    )


ORTHOGONAL_CASES = [
    (
        "linear_linear",
        _cal(
            "linear",
            "linear",
            ((100.0, 400.0), (500.0, 400.0)),
            (0.0, 10.0),
            ((100.0, 400.0), (100.0, 100.0)),
            (0.0, 5.0),
        ),
        [(300.0, 250.0), (100.0, 400.0), (500.0, 100.0), (250.5, 333.25)],
    ),
    (
        "linear_log",
        _cal(
            "linear",
            "log",
            ((80.0, 500.0), (720.0, 500.0)),
            (-2.0, 8.0),
            ((80.0, 500.0), (80.0, 40.0)),
            (0.1, 100.0),
        ),
        [(200.0, 200.0), (80.0, 500.0), (400.0, 120.0)],
    ),
    (
        "log_linear",
        _cal(
            "log",
            "linear",
            ((50.0, 350.0), (550.0, 350.0)),
            (0.1, 100.0),
            ((50.0, 350.0), (50.0, 50.0)),
            (-3.0, 7.0),
        ),
        [(150.0, 200.0), (300.0, 100.0), (50.0, 350.0)],
    ),
    (
        "log_log",
        _cal(
            "log",
            "log",
            ((20.0, 480.0), (620.0, 480.0)),
            (1.0, 1000.0),
            ((20.0, 480.0), (20.0, 30.0)),
            (0.01, 10.0),
        ),
        [(120.0, 240.0), (400.0, 90.0), (20.0, 480.0)],
    ),
    (
        "reversed_x",
        _cal(
            "linear",
            "linear",
            ((500.0, 400.0), (100.0, 400.0)),
            (0.0, 10.0),
            ((500.0, 400.0), (500.0, 100.0)),
            (0.0, 5.0),
        ),
        [(300.0, 250.0), (500.0, 400.0), (100.0, 100.0)],
    ),
    (
        "negative_values",
        _cal(
            "linear",
            "linear",
            ((40.0, 300.0), (440.0, 300.0)),
            (-20.0, 20.0),
            ((40.0, 300.0), (40.0, 20.0)),
            (-5.0, 15.0),
        ),
        [(240.0, 160.0), (40.0, 300.0), (440.0, 20.0)],
    ),
]


@pytest.mark.parametrize("name,cal,pixels", ORTHOGONAL_CASES, ids=[c[0] for c in ORTHOGONAL_CASES])
def test_orthogonal_matches_old_1d_fit_to_1e_12(name, cal, pixels):
    validate_calibration(cal)
    for px in pixels:
        got = pixel_to_data(cal, px)
        exp = oracle_pixel_to_data(cal, px)
        assert got[0] == pytest.approx(exp[0], abs=1e-12), f"{name} x {px}"
        assert got[1] == pytest.approx(exp[1], abs=1e-12), f"{name} y {px}"
        back = data_to_pixel(cal, got)
        assert back[0] == pytest.approx(px[0], abs=1e-8)
        assert back[1] == pytest.approx(px[1], abs=1e-8)


def test_existing_calibration_helpers_still_importable():
    from app.calibration.calibration import (
        CalibrationError as FacadeError,
        data_to_pixel as d2p,
        pixel_to_data as p2d,
        validate_calibration as validate,
    )

    cal = ORTHOGONAL_CASES[0][1]
    validate(cal)
    assert p2d(cal, (300.0, 250.0)) == pixel_to_data(cal, (300.0, 250.0))
    assert d2p(cal, (5.0, 2.5))
    with pytest.raises(FacadeError):
        validate(
            _cal(
                "log",
                "linear",
                ((10.0, 10.0), (100.0, 10.0)),
                (1.0, 0.0),
                ((0.0, 100.0), (0.0, 10.0)),
                (0.0, 1.0),
            )
        )


def test_affine_accuracy_on_rotated_synth_plot():
    plot = render_plot(
        np.sin,
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        rotation_deg=15.0,
    )
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="cartesian",
        model="affine",
        axis_points=[
            AxisPoint(pixel=ap.pixel, x_value=ap.x_value, y_value=ap.y_value)
            for ap in plot.axis_points
        ],
    )
    validate_calibration(cal)
    got = [pixel_to_data(cal, plot.pixel_of(x, y)) for x, y in plot.truth]
    err = max_abs_error(got, plot.truth)
    x_span = 2.0 * math.pi
    y_span = 3.0
    axis_range = max(x_span, y_span)
    assert err <= 0.002 * axis_range


def test_projective_accuracy_on_perspective_synth_plot():
    plot = render_plot(
        lambda x: 0.3 * x + 1.0,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(800, 600),
        perspective=0.18,
    )
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="cartesian",
        model="projective",
        axis_points=[
            AxisPoint(pixel=ap.pixel, x_value=ap.x_value, y_value=ap.y_value)
            for ap in plot.axis_points
        ],
    )
    validate_calibration(cal)
    got = [pixel_to_data(cal, plot.pixel_of(x, y)) for x, y in plot.truth]
    err = max_abs_error(got, plot.truth)
    axis_range = 10.0
    assert err <= 0.005 * axis_range


def test_resolution_at_positive_for_linear():
    cal = ORTHOGONAL_CASES[0][1]
    dx, dy = resolution_at(cal, (300.0, 250.0))
    assert dx > 0
    assert dy > 0


def test_axes_checker_polyline_is_closed_quad():
    cal = ORTHOGONAL_CASES[0][1]
    poly = axes_checker_polyline(cal, (800, 600))
    assert len(poly) >= 4
    assert poly[0] == pytest.approx(poly[-1], abs=1e-6)
