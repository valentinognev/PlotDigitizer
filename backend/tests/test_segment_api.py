from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.models.schemas import Curve, Point

client = TestClient(app)


def _session_with_stroke():
    img = Image.new("RGB", (240, 120), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 60), (220, 60)], fill=(0, 0, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("plot.png", buf.getvalue(), "image/png")})
    assert res.status_code == 200
    session_id = res.json()["id"]
    curve = Curve(
        id="c1",
        label="A",
        color="#0000ff",
        points=[Point(pixel=(30.0, 60.0)), Point(pixel=(200.0, 60.0))],
    )
    patched = client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    assert patched.status_code == 200
    return session_id, "c1"


def test_list_segments_returns_one_stroke():
    session_id, curve_id = _session_with_stroke()
    res = client.post(f"/sessions/{session_id}/curves/{curve_id}/segments")
    assert res.status_code == 200
    body = res.json()
    assert "segments" in body
    assert len(body["segments"]) >= 1
    seg = body["segments"][0]
    assert "index" in seg and "length" in seg and "points" in seg
    assert seg["length"] > 50
    assert len(seg["points"]) >= 2


def test_segment_fill_appends_points_and_undo_restores():
    session_id, curve_id = _session_with_stroke()
    before = client.get(f"/sessions/{session_id}").json()
    n_before = len(before["curves"][0]["points"])
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/segment-fill",
        json={"pixel": [120.0, 60.0], "separation": 25.0, "fill_corners": False},
    )
    assert res.status_code == 200
    n_after = len(res.json()["curves"][0]["points"])
    assert n_after > n_before
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    assert len(undone.json()["curves"][0]["points"]) == n_before


def test_segment_fill_miss_returns_400():
    session_id, curve_id = _session_with_stroke()
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/segment-fill",
        json={"pixel": [120.0, 10.0]},
    )
    assert res.status_code == 400


def test_workspace_persists_segment_settings():
    session_id, _curve_id = _session_with_stroke()
    res = client.patch(
        f"/sessions/{session_id}/preferences",
        json={
            "workspace": {
                "point_separation": 18.0,
                "min_segment_length": 5.0,
                "fill_corners": True,
            }
        },
    )
    assert res.status_code == 200
    ws = res.json()["workspace"]
    assert ws["point_separation"] == 18.0
    assert ws["min_segment_length"] == 5.0
    assert ws["fill_corners"] is True
