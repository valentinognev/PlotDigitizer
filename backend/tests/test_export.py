import io

import pytest
from PIL import Image

from app.calibration.calibration import CalibrationError
from app.export.export import export_csv, export_json
from app.export.project_io import is_project_payload, load_project_from_text
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    Curve,
    Point,
    RefPoint,
    ScaleBar,
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


def _polar_cal() -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(180.0, 100.0), x_value=0.0, y_value=10.0),
            AxisPoint(pixel=(100.0, 20.0), x_value=90.0, y_value=10.0),
        ],
    )


def _map_cal() -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=ScaleBar(pixel_a=(0.0, 100.0), pixel_b=(100.0, 100.0), length=50.0, units="km"),
    )


def test_csv_headers_cartesian_unchanged():
    out = export_csv(_session_ready())
    header = [ln for ln in out.splitlines() if ln and not ln.startswith("#")][0]
    assert header == "curve_id,curve_label,x,y"


def test_csv_headers_and_values_polar():
    from app.calibration.coords import pixel_to_data

    session = _session_ready()
    session.calibration = _polar_cal()
    session.curves[0].points = [Point(pixel=(180.0, 100.0), origin="user")]
    out = export_csv(session)
    lines = [ln for ln in out.splitlines() if ln]
    assert lines[0] == "curve_id,curve_label,theta,R"
    theta, radius = pixel_to_data(session.calibration, (180.0, 100.0))
    parts = lines[1].split(",")
    assert abs(float(parts[2]) - theta) < 1e-9
    assert abs(float(parts[3]) - radius) < 1e-9


def test_csv_headers_and_values_map_includes_units():
    from app.calibration.coords import pixel_to_data

    session = _session_ready()
    session.calibration = _map_cal()
    session.curves[0].points = [Point(pixel=(50.0, 50.0), origin="user")]
    out = export_csv(session)
    lines = out.splitlines()
    assert lines[0] == "# units: km"
    assert lines[1] == "curve_id,curve_label,x,y"
    x, y = pixel_to_data(session.calibration, (50.0, 50.0))
    parts = lines[2].split(",")
    assert abs(float(parts[2]) - x) < 1e-9
    assert abs(float(parts[3]) - y) < 1e-9
