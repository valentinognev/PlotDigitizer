from __future__ import annotations

import pytest

from app.calibration.bar import bar_pixel_to_value
from app.calibration.coords import data_to_pixel, pixel_to_data, validate_calibration
from app.calibration.transform import CalibrationError
from app.models.schemas import Calibration, CalibrationAxis, Point, RefPoint


def _bar_cal(
    *,
    p1: tuple[float, float] = (50.0, 100.0),
    v1: float = 0.0,
    p2: tuple[float, float] = (50.0, 0.0),
    v2: float = 10.0,
    scale: str = "linear",
    bar_horizontal: bool = False,
) -> Calibration:
    refs = [
        RefPoint(pixel=p1, value=v1),
        RefPoint(pixel=p2, value=v2),
    ]
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale=scale, ref_points=refs),
        coords_type="bar",
        bar_horizontal=bar_horizontal,
    )


def test_bar_pixel_to_value_linear_midpoint():
    cal = _bar_cal()
    assert bar_pixel_to_value(cal, (50.0, 50.0)) == pytest.approx(5.0, abs=1e-12)


def test_bar_pixel_to_value_log_midpoint():
    cal = _bar_cal(v1=1.0, v2=100.0, scale="log")
    assert bar_pixel_to_value(cal, (50.0, 50.0)) == pytest.approx(10.0, abs=1e-12)


def test_pixel_to_data_returns_value_and_zero_for_vertical_and_horizontal():
    vertical = _bar_cal()
    vx, vy = pixel_to_data(vertical, (50.0, 50.0))
    assert vx == pytest.approx(5.0, abs=1e-12)
    assert vy == pytest.approx(0.0, abs=1e-12)

    horizontal = _bar_cal(
        p1=(100.0, 50.0),
        v1=0.0,
        p2=(0.0, 50.0),
        v2=10.0,
        bar_horizontal=True,
    )
    hx, hy = pixel_to_data(horizontal, (50.0, 50.0))
    assert hx == pytest.approx(5.0, abs=1e-12)
    assert hy == pytest.approx(0.0, abs=1e-12)


def test_bar_projects_off_axis_pixel_onto_value_line():
    cal = _bar_cal()
    assert bar_pixel_to_value(cal, (80.0, 50.0)) == pytest.approx(5.0, abs=1e-12)


def test_bar_data_to_pixel_roundtrip_on_value_axis():
    cal = _bar_cal()
    back = data_to_pixel(cal, (5.0, 0.0))
    assert back[0] == pytest.approx(50.0, abs=1e-8)
    assert back[1] == pytest.approx(50.0, abs=1e-8)


def test_validate_bar_requires_two_y_ref_points():
    cal = _bar_cal()
    cal.y.ref_points = cal.y.ref_points[:1]
    with pytest.raises(CalibrationError, match="value-axis"):
        validate_calibration(cal)


def test_validate_bar_requires_distinct_value_pixels():
    cal = _bar_cal(p1=(50.0, 50.0), p2=(50.0, 50.0))
    with pytest.raises(CalibrationError, match="distinct"):
        validate_calibration(cal)


def test_validate_bar_accepts_two_distinct_points():
    validate_calibration(_bar_cal())


def test_existing_sessions_default_bar_horizontal_and_optional_label():
    cal = Calibration.model_validate(
        {
            "x": {
                "scale": "linear",
                "ref_points": [
                    {"pixel": [100.0, 400.0], "value": 0.0},
                    {"pixel": [500.0, 400.0], "value": 10.0},
                ],
            },
            "y": {
                "scale": "linear",
                "ref_points": [
                    {"pixel": [100.0, 400.0], "value": 0.0},
                    {"pixel": [100.0, 100.0], "value": 5.0},
                ],
            },
            "source": "manual",
        }
    )
    assert cal.bar_horizontal is False
    assert cal.coords_type == "cartesian"
    point = Point.model_validate({"pixel": [1.0, 2.0], "origin": "user"})
    assert point.label is None
    labeled = Point(pixel=(3.0, 4.0), origin="user", label="Bar 1")
    assert labeled.label == "Bar 1"
