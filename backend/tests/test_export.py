import pytest

from app.calibration.calibration import CalibrationError
from app.export.export import export_csv, export_json
from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, Session


def _session_ready() -> Session:
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=0.0),
                RefPoint(pixel=(100.0, 0.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 100.0), value=0.0),
                RefPoint(pixel=(0.0, 0.0), value=10.0),
            ],
        ),
    )
    return Session(
        image_meta={"width": 100, "height": 100, "scale_factor": 1.0},
        calibration=cal,
        curves=[
            Curve(
                label="A",
                points=[Point(pixel=(50.0, 50.0), origin="ai")],
            )
        ],
    )


def test_export_json():
    out = export_json(_session_ready())
    assert '"curves"' in out
    assert "A" in out


def test_export_csv():
    out = export_csv(_session_ready())
    assert "curve_label" in out
    assert "A" in out


def test_export_blocked_without_calibration():
    s = Session(image_meta={"width": 10, "height": 10, "scale_factor": 1.0})
    with pytest.raises(CalibrationError):
        export_json(s)
