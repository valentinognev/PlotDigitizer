from __future__ import annotations

import base64
import csv
import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from app.calibration.session_cal import calibration_for_curve
from app.export.export import export_csv
from app.export.project_io import load_project_from_text
from app.main import app
from app.models.schemas import (
    Calibration,
    CalibrationAxis,
    Curve,
    Point,
    RefPoint,
    Session,
)

client = TestClient(app)

_TINY_PNG = io.BytesIO()
Image.new("RGB", (4, 4), "white").save(_TINY_PNG, format="PNG")
TINY_PNG_BYTES = _TINY_PNG.getvalue()


def _linear_cal(*, y_max: float, cal_id: str | None = None, name: str = "Axes") -> Calibration:
    kwargs: dict = {}
    if cal_id is not None:
        kwargs["id"] = cal_id
    return Calibration(
        name=name,
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
                RefPoint(pixel=(0.0, 0.0), value=y_max),
            ],
        ),
        **kwargs,
    )


def _session(*, calibration=None, calibrations=None, curves=None) -> Session:
    kwargs: dict = {
        "image_meta": {"width": 100, "height": 100, "scale_factor": 1.0},
        "curves": curves or [],
    }
    if calibration is not None:
        kwargs["calibration"] = calibration
    if calibrations is not None:
        kwargs["calibrations"] = calibrations
    return Session(**kwargs)


def _legacy_project_payload(cal_raw: dict) -> str:
    return json.dumps(
        {
            "plot_digitizer": {"kind": "project", "format_version": 1},
            "image_meta": {"width": 4, "height": 4, "scale_factor": 1.0},
            "image": {
                "encoding": "base64",
                "mime_type": "image/png",
                "data": base64.b64encode(TINY_PNG_BYTES).decode("ascii"),
            },
            "calibration": cal_raw,
            "curves": [],
        }
    )


def test_legacy_session_only_calibration_set():
    cal = _linear_cal(y_max=10.0, cal_id="legacy-cal")
    curve = Curve(label="A")
    session = _session(calibration=cal)

    assert session.calibrations == []
    assert curve.calibration_id is None
    assert calibration_for_curve(session, curve) is cal


def test_two_cals_plus_curve_binding():
    left = _linear_cal(y_max=10.0, cal_id="cal-left", name="Left")
    right = _linear_cal(y_max=100.0, cal_id="cal-right", name="Right")
    bound = Curve(label="B", calibration_id="cal-right")
    unbound = Curve(label="A")
    unknown = Curve(label="C", calibration_id="missing")
    session = _session(
        calibration=left,
        calibrations=[left, right],
        curves=[unbound, bound, unknown],
    )

    assert calibration_for_curve(session, bound) is right
    assert calibration_for_curve(session, unbound) is left
    assert calibration_for_curve(session, unknown) is left

    fallback = _session(calibrations=[left, right], curves=[unbound])
    assert fallback.calibration is None
    assert calibration_for_curve(fallback, unbound) is left
    assert calibration_for_curve(_session(), unbound) is None


def test_export_csv_uses_each_curve_cal():
    left = _linear_cal(y_max=10.0, cal_id="cal-left", name="Left")
    right = _linear_cal(y_max=100.0, cal_id="cal-right", name="Right")
    pixel = (50.0, 50.0)
    curve_left = Curve(
        id="c-left",
        label="left",
        calibration_id="cal-left",
        points=[Point(pixel=pixel, origin="user")],
    )
    curve_right = Curve(
        id="c-right",
        label="right",
        calibration_id="cal-right",
        points=[Point(pixel=pixel, origin="user")],
    )
    session = _session(
        calibration=left,
        calibrations=[left, right],
        curves=[curve_left, curve_right],
    )

    rows = list(csv.reader(io.StringIO(export_csv(session))))
    header, *data = rows
    assert header == ["curve_id", "curve_label", "x", "y"]
    by_id = {row[0]: row for row in data}
    assert abs(float(by_id["c-left"][3]) - 5.0) < 1e-9
    assert abs(float(by_id["c-right"][3]) - 50.0) < 1e-9
    assert abs(float(by_id["c-left"][2]) - 5.0) < 1e-9
    assert abs(float(by_id["c-right"][2]) - 5.0) < 1e-9


def test_load_legacy_project_fills_calibrations_and_assigns_id():
    cal_raw = _linear_cal(y_max=10.0).model_dump()
    cal_raw.pop("id", None)
    session, _img = load_project_from_text(_legacy_project_payload(cal_raw))

    assert session.calibration is not None
    assert session.calibration.id
    assert session.calibration.name == "Axes"
    assert len(session.calibrations) == 1
    assert session.calibrations[0].id == session.calibration.id


def test_patch_preferences_upserts_calibration_by_id():
    res = client.post("/sessions", files={"file": ("plot.png", TINY_PNG_BYTES, "image/png")})
    session_id = res.json()["id"]
    first = _linear_cal(y_max=10.0, cal_id="cal-1", name="First").model_dump()
    patch = client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": first, "manual_calibration": True},
    )
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["calibration"]["id"] == "cal-1"
    assert len(body["calibrations"]) == 1
    assert body["calibrations"][0]["id"] == "cal-1"
    assert body["calibrations"][0]["name"] == "First"

    updated = _linear_cal(y_max=20.0, cal_id="cal-1", name="First").model_dump()
    patch = client.patch(f"/sessions/{session_id}/preferences", json={"calibration": updated})
    body = patch.json()
    assert len(body["calibrations"]) == 1
    assert body["calibrations"][0]["y"]["ref_points"][1]["value"] == 20.0
    assert body["calibration"]["id"] == "cal-1"

    second = _linear_cal(y_max=100.0, cal_id="cal-2", name="Second").model_dump()
    patch = client.patch(f"/sessions/{session_id}/preferences", json={"calibration": second})
    body = patch.json()
    assert body["calibration"]["id"] == "cal-2"
    ids = [c["id"] for c in body["calibrations"]]
    assert ids == ["cal-1", "cal-2"]
    assert body["calibrations"][0]["name"] == "First"


def test_patch_preferences_replaces_calibrations_list():
    res = client.post("/sessions", files={"file": ("plot.png", TINY_PNG_BYTES, "image/png")})
    session_id = res.json()["id"]
    first = _linear_cal(y_max=10.0, cal_id="cal-1", name="First").model_dump()
    second = _linear_cal(y_max=100.0, cal_id="cal-2", name="Second").model_dump()
    client.patch(f"/sessions/{session_id}/preferences", json={"calibration": first})
    client.patch(f"/sessions/{session_id}/preferences", json={"calibration": second})

    patch = client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": first, "calibrations": [first]},
    )
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["calibration"]["id"] == "cal-1"
    assert [c["id"] for c in body["calibrations"]] == ["cal-1"]


def test_undo_restores_calibrations_list():
    res = client.post("/sessions", files={"file": ("plot.png", TINY_PNG_BYTES, "image/png")})
    session_id = res.json()["id"]
    first = _linear_cal(y_max=10.0, cal_id="cal-1", name="First").model_dump()
    second = _linear_cal(y_max=100.0, cal_id="cal-2", name="Second").model_dump()
    client.patch(f"/sessions/{session_id}/preferences", json={"calibration": first})
    client.patch(f"/sessions/{session_id}/preferences", json={"calibration": second})
    saved = client.post(
        f"/sessions/{session_id}/calibration",
        json={"calibration": second, "manual_calibration": True},
    )
    assert saved.status_code == 200, saved.text
    assert [c["id"] for c in saved.json()["calibrations"]] == ["cal-1", "cal-2"]

    client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": first, "calibrations": [first]},
    )
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert [c["id"] for c in body["calibrations"]] == ["cal-1", "cal-2"]
    assert body["calibration"]["id"] == "cal-2"
