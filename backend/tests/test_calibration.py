import pytest

from app.calibration.calibration import (
    CalibrationError,
    data_to_pixel,
    pixel_to_data,
    validate_calibration,
)
from app.models.schemas import Calibration, CalibrationAxis, RefPoint


def _cal_linear() -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(500.0, 400.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(100.0, 100.0), value=5.0),
            ],
        ),
        source="manual",
    )


def test_pixel_data_roundtrip():
    cal = _cal_linear()
    px = (300.0, 250.0)
    data = pixel_to_data(cal, px)
    back = data_to_pixel(cal, data)
    assert back[0] == pytest.approx(px[0], abs=1e-6)
    assert back[1] == pytest.approx(px[1], abs=1e-6)


def test_log_axis_rejects_non_positive():
    cal = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 10.0), value=1.0),
                RefPoint(pixel=(100.0, 10.0), value=0.0),
            ],
        ),
        y=CalibrationAxis(scale="linear", ref_points=[
            RefPoint(pixel=(0.0, 100.0), value=0.0),
            RefPoint(pixel=(0.0, 10.0), value=1.0),
        ]),
    )
    with pytest.raises(CalibrationError):
        validate_calibration(cal)


def test_too_few_ref_points():
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[RefPoint(pixel=(1.0, 1.0), value=0.0)]),
        y=CalibrationAxis(scale="linear", ref_points=[
            RefPoint(pixel=(0.0, 100.0), value=0.0),
            RefPoint(pixel=(0.0, 10.0), value=1.0),
        ]),
    )
    with pytest.raises(CalibrationError):
        validate_calibration(cal)
