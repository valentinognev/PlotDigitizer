import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.models.schemas import Calibration, CalibrationAxis, RefPoint

client = TestClient(app)


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (120, 80), "white").save(buf, format="PNG")
    return buf.getvalue()


def _sample_calibration() -> dict:
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(10.0, 70.0), value=0.0),
                RefPoint(pixel=(110.0, 70.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(10.0, 70.0), value=0.0),
                RefPoint(pixel=(10.0, 10.0), value=1.0),
            ],
        ),
        source="manual",
    )
    return cal.model_dump()


def test_patch_preferences_persists_manual_mode_and_calibration():
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]

    updated = _sample_calibration()
    updated["x"]["ref_points"][0]["pixel"] = [15.0, 70.0]
    patch = client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": updated, "manual_calibration": True},
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["manual_calibration"] is True
    assert body["calibration"]["x"]["ref_points"][0]["pixel"] == [15.0, 70.0]

    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.json()["manual_calibration"] is True


def test_patch_preferences_persists_mesh_workspace():
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]
    cal = _sample_calibration()
    client.patch(f"/sessions/{session_id}/preferences", json={"calibration": cal})

    mesh = {
        "vertices": [
            {"row": 0, "col": 0, "position": [12.0, 12.0]},
            {"row": 3, "col": 3, "position": [100.0, 70.0]},
        ]
    }
    patch = client.patch(
        f"/sessions/{session_id}/preferences",
        json={
            "workspace": {
                "unskew_mode": "mesh",
                "mesh": mesh,
            }
        },
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["workspace"]["unskew_mode"] == "mesh"
    assert body["workspace"]["mesh"]["vertices"][0]["position"] == [12.0, 12.0]

    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.json()["workspace"]["mesh"]["vertices"][0]["position"] == [12.0, 12.0]


def _session_id() -> str:
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    return res.json()["id"]


def _precise_draft_one_empty_axis_point() -> dict:
    cal = _sample_calibration()
    cal["axis_points"] = [
        {
            "id": "ap-1",
            "pixel": [40.0, 30.0],
            "x_value": None,
            "y_value": None,
        }
    ]
    return cal


def _polar_draft_one_point() -> dict:
    cal = _sample_calibration()
    cal["coords_type"] = "polar"
    cal["axis_points"] = [
        {
            "id": "pol-1",
            "pixel": [20.0, 20.0],
            "x_value": None,
            "y_value": None,
        }
    ]
    return cal


def _map_draft_without_bar() -> dict:
    cal = _sample_calibration()
    cal["coords_type"] = "map"
    cal["scale_bar"] = None
    return cal


def _assert_calibration_rejected(res) -> None:
    assert res.status_code in (400, 422)
    detail = res.json().get("detail") or res.json()
    if isinstance(detail, dict) and "error" in detail:
        assert detail["error"]["code"] == "calibration_invalid"
    elif isinstance(detail, dict) and "code" in detail:
        assert detail["code"] == "calibration_invalid"


def test_patch_preferences_round_trips_incomplete_precise_axis_point():
    session_id = _session_id()
    draft = _precise_draft_one_empty_axis_point()
    patch = client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": draft, "manual_calibration": True},
    )
    assert patch.status_code == 200, patch.text
    body = patch.json()["calibration"]
    assert body["axis_points"][0]["pixel"] == [40.0, 30.0]
    assert body["axis_points"][0]["x_value"] is None
    assert body["axis_points"][0]["y_value"] is None

    got = client.get(f"/sessions/{session_id}").json()["calibration"]
    assert got["axis_points"][0]["id"] == "ap-1"
    assert got["axis_points"][0]["x_value"] is None

    post = client.post(
        f"/sessions/{session_id}/calibration",
        json={"calibration": draft},
    )
    _assert_calibration_rejected(post)
    assert client.get(f"/sessions/{session_id}").json()["calibration"]["axis_points"][0]["id"] == "ap-1"


def test_patch_preferences_round_trips_incomplete_polar_and_map_drafts():
    session_id = _session_id()

    polar = _polar_draft_one_point()
    patch = client.patch(f"/sessions/{session_id}/preferences", json={"calibration": polar})
    assert patch.status_code == 200, patch.text
    assert patch.json()["calibration"]["coords_type"] == "polar"
    assert len(patch.json()["calibration"]["axis_points"]) == 1
    _assert_calibration_rejected(
        client.post(f"/sessions/{session_id}/calibration", json={"calibration": polar})
    )

    mapped = _map_draft_without_bar()
    patch = client.patch(f"/sessions/{session_id}/preferences", json={"calibration": mapped})
    assert patch.status_code == 200, patch.text
    assert patch.json()["calibration"]["coords_type"] == "map"
    assert patch.json()["calibration"]["scale_bar"] is None
    got = client.get(f"/sessions/{session_id}").json()["calibration"]
    assert got["coords_type"] == "map"
    assert got["scale_bar"] is None
    _assert_calibration_rejected(
        client.post(f"/sessions/{session_id}/calibration", json={"calibration": mapped})
    )
