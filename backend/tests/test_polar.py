from __future__ import annotations

import math
import os
from pathlib import Path

import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    validate_calibration,
)
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis
from metrics import assert_not_worse
from tests.reference.refcorpus import POLAR_WITH_AXIS_POINTS, iter_docs

POLAR_UNITS = ("degrees", "radians", "gradians", "turns")
THETA_90 = {"degrees": 90.0, "radians": math.pi / 2.0, "gradians": 100.0, "turns": 0.25}

# Usable polar corpus only. guidelines_polar_linear_shear.dig and
# guidelines_polar_log_rotated.dig have zero CmdAddPointAxis records
# (no calibration ground truth) — do not add them.
POLAR_DOCS = POLAR_WITH_AXIS_POINTS

REF_DIR = Path(os.environ.get("PLOTDIG_REF_DIR", "/home/valentin/Projects/t/engauge-digitizer"))


def _polar_cal(
    points: list[AxisPoint],
    *,
    theta_units: str = "degrees",
    origin_radius: float = 0.0,
    radius_scale: str = "linear",
) -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale=radius_scale, ref_points=[]),
        coords_type="polar",
        model="affine",
        axis_points=points,
        theta_units=theta_units,  # type: ignore[arg-type]
        origin_radius=origin_radius,
    )


def test_polar_roundtrip_all_theta_units():
    for units in POLAR_UNITS:
        points = [
            AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(200.0, 120.0), x_value=THETA_90[units], y_value=2.0),
        ]
        cal = _polar_cal(points, theta_units=units)
        validate_calibration(cal)
        theta, radius = pixel_to_data(cal, (280.0, 200.0))
        assert radius == pytest.approx(2.0, abs=1e-9)
        assert theta == pytest.approx(0.0, abs=1e-9)
        back = data_to_pixel(cal, (theta, radius))
        assert back[0] == pytest.approx(280.0, abs=1e-6)
        assert back[1] == pytest.approx(200.0, abs=1e-6)


def test_polar_nonzero_origin_radius():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=1.0),  # ρ = 0
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=3.0),  # ρ = 2
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=3.0),
    ]
    cal = _polar_cal(points, origin_radius=1.0)
    validate_calibration(cal)
    theta, radius = pixel_to_data(cal, (200.0, 200.0))
    assert radius == pytest.approx(1.0, abs=1e-9)
    theta2, radius2 = pixel_to_data(cal, (280.0, 200.0))
    assert radius2 == pytest.approx(3.0, abs=1e-9)
    assert theta2 == pytest.approx(0.0, abs=1e-8)


def test_polar_log_radius():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=1.0),
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=100.0),
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=100.0),
    ]
    cal = _polar_cal(points, radius_scale="log")
    validate_calibration(cal)
    _theta, radius = pixel_to_data(cal, (280.0, 200.0))
    assert radius == pytest.approx(100.0, rel=1e-8)
    back = data_to_pixel(cal, (0.0, 10.0))
    got = pixel_to_data(cal, back)
    assert got[1] == pytest.approx(10.0, rel=1e-7)


def test_polar_checker_is_annular():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=2.0),
    ]
    cal = _polar_cal(points)
    poly = axes_checker_polyline(cal, (400, 400))
    assert len(poly) >= 16


def test_polar_log_checker_skips_non_positive_inner_radius():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=1.0),
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=100.0),
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=100.0),
    ]
    cal = _polar_cal(points, radius_scale="log", origin_radius=0.0)
    validate_calibration(cal)
    poly = axes_checker_polyline(cal, (400, 400))
    assert poly


@pytest.mark.reference
@pytest.mark.parametrize("name", POLAR_DOCS)
def test_polar_reference_docs(name: str):
    if not REF_DIR.exists():
        pytest.skip(f"reference corpus missing: {REF_DIR}")
    docs = {doc.name: doc for doc in iter_docs(REF_DIR)}
    if name not in docs:
        pytest.skip(f"{name} not present")
    doc = docs[name]
    axis_points = []
    for ap in doc.axis_points:
        axis_points.append(
            AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=ap.graph_y)
        )
    # Origin pin is R = origin_radius (Engauge Coords attr). XML ScaleYRadius
    # is Linear even on guidelines_polar_log — do not force log from the name.
    radii = [float(ap.graph_y) for ap in doc.axis_points if ap.graph_y is not None]
    origin_radius = min(radii) if radii else 0.0
    cal = Calibration(
        x=CalibrationAxis(scale="linear" if doc.scale_x != "log" else "log", ref_points=[]),
        y=CalibrationAxis(scale="log" if doc.scale_y == "log" else "linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        axis_points=axis_points,
        theta_units="degrees",
        origin_radius=origin_radius,
    )
    validate_calibration(cal)
    assert doc.expected_csv, name
    rows = doc.expected_csv[1:]
    # expected CSV is θ in column 0, R in following curve columns
    first_curve = next(iter(doc.curve_points.values()))
    mapped = [pixel_to_data(cal, pix) for pix in first_curve]
    expected_pts: list[tuple[float, float]] = []
    for row in rows:
        if len(row) < 2:
            continue
        if str(row[0]).strip().upper() == "XXX" or str(row[1]).strip().upper() == "XXX":
            continue
        try:
            th_exp = float(row[0])
            r_exp = float(row[1])
        except ValueError:
            continue
        expected_pts.append((th_exp, r_exp))
    assert expected_pts, name
    # Score digitized vertices against the (possibly denser) expected CSV.
    # CSV→mapped nearest-θ fails on polar_linear_linear_3curve (~188 export
    # rows vs 68 vertices) even when affine polar mapping is ~1e-5.
    dtheta: list[float] = []
    drel_r: list[float] = []
    for theta, radius in mapped:
        nearest = min(expected_pts, key=lambda p: abs(p[0] - theta))
        dtheta.append(abs(nearest[0] - theta))
        if abs(nearest[1]) > 1e-12:
            drel_r.append(abs(radius - nearest[1]) / abs(nearest[1]))
    assert dtheta, name
    peak_th = max(dtheta)
    peak_r = max(drel_r) if drel_r else 0.0
    assert peak_th <= 0.5, f"{name} θ {peak_th}° > 0.5°"
    assert peak_r <= 0.01, f"{name} R rel {peak_r} > 1%"
    assert_not_worse(f"calibration.polar.{name}.theta_deg", peak_th, lower_is_better=True)
    assert_not_worse(f"calibration.polar.{name}.r_rel", peak_r, lower_is_better=True)
