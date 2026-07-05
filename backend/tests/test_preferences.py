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
