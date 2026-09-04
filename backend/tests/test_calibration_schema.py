from __future__ import annotations

import io
import json

from PIL import Image
from pydantic import ValidationError

from app.export.project_io import export_project_json, load_project_from_text
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    Curve,
    ImageMeta,
    Point,
    RefPoint,
    ScaleBar,
    Session,
    SessionPublic,
    WorkspaceState,
)


def _old_payload() -> dict:
    return {
        "x": {
            "scale": "linear",
            "ref_points": [
                {"pixel": [100.0, 400.0], "value": 0.0},
                {"pixel": [500.0, 400.0], "value": 10.0},
            ],
        },
        "y": {
            "scale": "log",
            "ref_points": [
                {"pixel": [100.0, 400.0], "value": 0.1},
                {"pixel": [100.0, 100.0], "value": 10.0},
            ],
        },
        "source": "manual",
    }


def _tiny_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_old_payload_still_validates():
    cal = Calibration.model_validate(_old_payload())
    assert cal.x.scale == "linear"
    assert cal.y.scale == "log"
    assert cal.source == "manual"
    assert len(cal.x.ref_points) == 2
    assert cal.x.ref_points[0].pixel == (100.0, 400.0)


def test_defaults_reproduce_today():
    cal = Calibration.model_validate(_old_payload())
    assert cal.coords_type == "cartesian"
    assert cal.model == "auto"
    assert cal.axis_points == []
    assert cal.theta_units == "degrees"
    assert cal.origin_radius == 0.0
    assert cal.scale_bar is None


def test_new_fields_round_trip_session_public():
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 10.0), value=0.0),
                RefPoint(pixel=(100.0, 10.0), value=1.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 10.0), value=0.0),
                RefPoint(pixel=(0.0, 0.0), value=1.0),
            ],
        ),
        coords_type="polar",
        model="affine",
        axis_points=[
            AxisPoint(id="ap1", pixel=(50.0, 50.0), x_value=0.0, y_value=1.0),
            AxisPoint(id="ap2", pixel=(80.0, 50.0), x_value=90.0, y_value=2.0),
        ],
        theta_units="gradians",
        origin_radius=0.25,
        scale_bar=ScaleBar(
            pixel_a=(1.0, 2.0),
            pixel_b=(11.0, 2.0),
            length=5.0,
            units="km",
        ),
    )
    public = SessionPublic(
        id="sess-1",
        image_meta=ImageMeta(width=100, height=80, scale_factor=1.0),
        calibration=cal,
        curves=[],
        history=[],
        image_url="/sessions/sess-1/image",
    )
    restored = SessionPublic.model_validate(public.model_dump())
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "polar"
    assert restored.calibration.model == "affine"
    assert restored.calibration.theta_units == "gradians"
    assert restored.calibration.origin_radius == 0.25
    assert restored.calibration.axis_points[0].id == "ap1"
    assert restored.calibration.axis_points[0].pixel == (50.0, 50.0)
    assert restored.calibration.axis_points[1].y_value == 2.0
    assert restored.calibration.scale_bar is not None
    assert restored.calibration.scale_bar.units == "km"
    assert restored.calibration.scale_bar.length == 5.0


def test_new_fields_round_trip_project_io():
    cal = Calibration.model_validate(_old_payload())
    cal = cal.model_copy(
        update={
            "coords_type": "map",
            "model": "orthogonal",
            "axis_points": [
                AxisPoint(pixel=(3.0, 4.0), x_value=1.0, y_value=None),
            ],
            "theta_units": "turns",
            "origin_radius": 1.5,
            "scale_bar": ScaleBar(
                pixel_a=(0.0, 0.0),
                pixel_b=(10.0, 0.0),
                length=100.0,
                units="m",
            ),
        }
    )
    session = Session(
        image_meta=ImageMeta(width=4, height=4, scale_factor=1.0),
        calibration=cal,
        curves=[Curve(label="A", points=[Point(pixel=(1.0, 1.0), origin="user")])],
    )
    exported = export_project_json(session, image_bytes=_tiny_png())
    payload = json.loads(exported)
    assert payload["calibration"]["coords_type"] == "map"
    assert payload["calibration"]["model"] == "orthogonal"
    assert payload["calibration"]["theta_units"] == "turns"
    assert payload["calibration"]["origin_radius"] == 1.5
    assert payload["calibration"]["scale_bar"]["length"] == 100.0
    assert payload["calibration"]["axis_points"][0]["x_value"] == 1.0
    assert payload["calibration"]["axis_points"][0]["y_value"] is None
    loaded, _image = load_project_from_text(exported)
    assert loaded.calibration is not None
    assert loaded.calibration.coords_type == "map"
    assert loaded.calibration.model == "orthogonal"
    assert loaded.calibration.theta_units == "turns"
    assert loaded.calibration.origin_radius == 1.5
    assert loaded.calibration.scale_bar is not None
    assert loaded.calibration.scale_bar.units == "m"
    assert loaded.calibration.axis_points[0].x_value == 1.0
    assert loaded.calibration.axis_points[0].y_value is None


def test_axis_point_partial_values_allowed():
    pt = AxisPoint(pixel=(1.0, 2.0), x_value=3.0, y_value=None)
    assert pt.y_value is None
    assert pt.id  # uuid assigned


def test_workspace_axes_checker_defaults():
    ws = WorkspaceState()
    assert ws.show_axes_checker is True
    assert ws.canvas_mode == "select"


def test_old_workspace_payload_still_validates():
    ws = WorkspaceState.model_validate({"active_curve_id": "c1", "resample_count": 9})
    assert ws.show_axes_checker is True
    assert ws.canvas_mode == "select"


def test_invalid_coords_type_rejected():
    payload = _old_payload()
    payload["coords_type"] = "spherical"
    try:
        Calibration.model_validate(payload)
        raised = False
    except ValidationError:
        raised = True
    assert raised
