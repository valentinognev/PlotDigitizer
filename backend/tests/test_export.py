import io

import pytest
from PIL import Image

from app.calibration.calibration import CalibrationError
from app.export.export import export_csv, export_json
from app.export.project_io import is_project_payload, load_project_from_text
from app.models.schemas import (
    Calibration,
    CalibrationAxis,
    Curve,
    Point,
    RefPoint,
    Session,
    SessionPublic,
)
from app.pipeline.pipeline import run_cv_improve, run_resample

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


def test_connect_as_defaults_to_line():
    c = Curve(label="A")
    assert c.connect_as == "line"


def test_connect_as_roundtrip_session_public_and_project():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    public = SessionPublic(
        id="s",
        image_meta=session.image_meta,
        image_source=session.image_source,
        calibration=session.calibration,
        manual_calibration=True,
        curves=session.curves,
        workspace=session.workspace,
        history=[],
        image_url="/x",
    )
    assert public.curves[0].connect_as == "scatter"
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.curves[0].connect_as == "scatter"


def test_scatter_export_keeps_placement_order():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    session.curves[0].points = [
        Point(pixel=(80.0, 50.0), origin="user"),
        Point(pixel=(20.0, 50.0), origin="user"),
        Point(pixel=(50.0, 50.0), origin="user"),
    ]
    rows = [ln for ln in export_csv(session).splitlines() if ln and not ln.startswith("#")]
    data = rows[1:]
    xs = [float(r.split(",")[2]) for r in data]
    assert xs[0] > xs[1]
    assert xs[1] < xs[2]


def test_improve_and_resample_reject_scatter():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    session.curves[0].points = [
        Point(pixel=(20.0, 50.0), origin="user"),
        Point(pixel=(80.0, 50.0), origin="user"),
    ]
    with pytest.raises(ValueError, match="scatter"):
        run_cv_improve(session, TINY_PNG_BYTES, session.curves[0].id)
    with pytest.raises(ValueError, match="scatter"):
        run_resample(session, TINY_PNG_BYTES, session.curves[0].id, 12)
