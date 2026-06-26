import io

import pytest
from PIL import Image

from app.calibration.calibration import CalibrationError
from app.export.export import export_csv, export_json
from app.export.project_io import is_project_payload
from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, Session

_TINY_PNG = io.BytesIO()
Image.new("RGB", (4, 4), "white").save(_TINY_PNG, format="PNG")
TINY_PNG_BYTES = _TINY_PNG.getvalue()


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
    import json

    out = export_json(_session_ready(), image_bytes=TINY_PNG_BYTES)
    payload = json.loads(out)
    assert is_project_payload(payload)
    assert '"curves"' in out
    assert "A" in out
    assert payload["image"]["encoding"] == "base64"


def test_export_json_without_calibration():
    s = Session(image_meta={"width": 10, "height": 10, "scale_factor": 1.0})
    out = export_json(s, image_bytes=TINY_PNG_BYTES)
    assert "plot_digitizer" in out


def test_export_csv():
    out = export_csv(_session_ready())
    assert "curve_label" in out
    assert "A" in out


def test_export_csv_blocked_without_calibration():
    s = Session(image_meta={"width": 10, "height": 10, "scale_factor": 1.0})
    with pytest.raises(CalibrationError):
        export_csv(s)
