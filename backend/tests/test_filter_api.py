from __future__ import annotations

import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app

client = TestClient(app)


def _png_bytes() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 40), (110, 40)], fill=(0, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _session_with_curve() -> tuple[str, str]:
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    assert res.status_code == 200
    sid = res.json()["id"]
    curve_id = "curve-1"
    patch = client.patch(
        f"/sessions/{sid}/curves",
        json={
            "curves": [
                {
                    "id": curve_id,
                    "label": "Curve 1",
                    "color": "#111111",
                    "style": "unknown",
                    "visible": True,
                    "points": [],
                }
            ]
        },
    )
    assert patch.status_code == 200
    return sid, curve_id


def test_filter_patch_persists_and_round_trips():
    sid, curve_id = _session_with_curve()
    body = {
        "mode": "hue",
        "low": 0.9,
        "high": 0.1,
        "sample_color": "#ff0000",
        "remove_grid": True,
    }
    res = client.patch(f"/sessions/{sid}/curves/{curve_id}/filter", json=body)
    assert res.status_code == 200
    stored = res.json()["curves"][0]["filter"]
    assert stored["mode"] == "hue"
    assert stored["low"] == 0.9
    assert stored["high"] == 0.1
    assert stored["remove_grid"] is True
    again = client.get(f"/sessions/{sid}")
    assert again.json()["curves"][0]["filter"]["sample_color"] == "#ff0000"


def test_mask_png_is_binary_and_correct_size():
    sid, curve_id = _session_with_curve()
    client.patch(
        f"/sessions/{sid}/curves/{curve_id}/filter",
        json={"mode": "intensity", "low": 0.0, "high": 0.4},
    )
    res = client.get(f"/sessions/{sid}/mask", params={"curve_id": curve_id, "rev": 0})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/png")
    img = Image.open(io.BytesIO(res.content))
    assert img.size == (120, 80)
    arr = np.array(img.convert("L"))
    assert set(np.unique(arr)).issubset({0, 255})


def test_suggest_and_snap_and_detect():
    sid, curve_id = _session_with_curve()
    sug = client.post(
        f"/sessions/{sid}/filter/suggest",
        json={"pixel": [40.0, 40.0], "curve_id": curve_id},
    )
    assert sug.status_code == 200
    assert sug.json()["mode"] in {"intensity", "foreground", "hue", "saturation", "value"}
    client.patch(f"/sessions/{sid}/curves/{curve_id}/filter", json=sug.json())

    snap = client.post(
        f"/sessions/{sid}/snap",
        json={"curve_id": curve_id, "pixels": [[40.0, 36.0]]},
    )
    assert snap.status_code == 200
    snapped = snap.json()["pixels"][0]
    assert abs(snapped[1] - 40.0) < 3.0

    det = client.post(f"/sessions/{sid}/grid/detect", json={"curve_id": curve_id})
    assert det.status_code == 200


def test_filter_routes_error_shapes():
    sid, curve_id = _session_with_curve()
    missing = client.get("/sessions/no-such/mask")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Session not found"

    bad_curve = client.patch(
        f"/sessions/{sid}/curves/nope/filter",
        json={"mode": "intensity", "low": 0.0, "high": 0.4},
    )
    assert bad_curve.status_code == 400
    err = bad_curve.json()["detail"]["error"]
    assert "code" in err and "message" in err and "hint" in err

    invalid = client.patch(
        f"/sessions/{sid}/curves/{curve_id}/filter",
        json={"mode": "not-a-mode", "low": 0.0, "high": 0.4},
    )
    assert invalid.status_code == 422
    assert "detail" in invalid.json()
