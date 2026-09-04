from __future__ import annotations

import math

import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    resolution_at,
    validate_calibration,
)
from app.calibration.transform import CalibrationError
from app.models.schemas import Calibration, CalibrationAxis, ScaleBar


def _map_cal(bar: ScaleBar | None) -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=bar,
    )


def test_map_horizontal_scale_bar_distances():
    cal = _map_cal(
        ScaleBar(pixel_a=(10.0, 50.0), pixel_b=(110.0, 50.0), length=50.0, units="m")
    )
    validate_calibration(cal)
    x, y = pixel_to_data(cal, (10.0, 50.0))
    assert x == pytest.approx(0.0)
    assert y == pytest.approx(0.0)
    x2, y2 = pixel_to_data(cal, (110.0, 50.0))
    assert x2 == pytest.approx(50.0)
    assert y2 == pytest.approx(0.0)
    x3, y3 = pixel_to_data(cal, (10.0, 0.0))
    assert x3 == pytest.approx(0.0)
    assert y3 == pytest.approx(25.0)  # 50 px up * 0.5 m/px
    back = data_to_pixel(cal, (25.0, 10.0))
    got = pixel_to_data(cal, back)
    assert got[0] == pytest.approx(25.0)
    assert got[1] == pytest.approx(10.0)


def test_map_rotated_scale_bar():
    # 3-4-5 triangle: (0,0) -> (30,40) is 50 px for 10 units → s = 0.2
    cal = _map_cal(
        ScaleBar(pixel_a=(0.0, 0.0), pixel_b=(30.0, 40.0), length=10.0, units="km")
    )
    validate_calibration(cal)
    x, y = pixel_to_data(cal, (30.0, 40.0))
    dist = math.hypot(x, y)
    assert dist == pytest.approx(10.0, abs=1e-9)
    dx, dy = resolution_at(cal, (0.0, 0.0))
    assert dx == pytest.approx(0.2, abs=1e-12)
    assert dy == pytest.approx(0.2, abs=1e-12)


def test_map_missing_scale_bar_raises():
    with pytest.raises(CalibrationError, match="scale bar"):
        validate_calibration(_map_cal(None))


def test_map_zero_length_bar_raises():
    with pytest.raises(CalibrationError):
        validate_calibration(
            _map_cal(ScaleBar(pixel_a=(5.0, 5.0), pixel_b=(5.0, 5.0), length=10.0))
        )
    with pytest.raises(CalibrationError):
        validate_calibration(
            _map_cal(ScaleBar(pixel_a=(5.0, 5.0), pixel_b=(15.0, 5.0), length=0.0))
        )


def test_map_checker_includes_scale_bar_endpoints():
    cal = _map_cal(
        ScaleBar(pixel_a=(10.0, 20.0), pixel_b=(40.0, 20.0), length=3.0, units="m")
    )
    poly = axes_checker_polyline(cal, (100, 80))
    assert (10.0, 20.0) in poly or pytest.approx(poly[0][0]) == 10.0
    assert len(poly) >= 2
