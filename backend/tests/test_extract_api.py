from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.calibration.coords import pixel_to_data
from app.main import app
from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, RegionBox, RegionMask

client = TestClient(app)


def _png_with_black_line() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 40), (110, 40)], fill=(0, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _linear_four_bound() -> dict:
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
    return cal.model_dump()


def _session_with_curve(*, points: list[tuple[float, float]] | None = None, image: bytes | None = None) -> tuple[str, str]:
    res = client.post(
        "/sessions",
        files={"file": ("plot.png", image or _png_with_black_line(), "image/png")},
    )
    assert res.status_code == 200
    session_id = res.json()["id"]
    curve = Curve(
        id="c1",
        label="A",
        color="#000000",
        filter={"mode": "intensity", "low": 0.0, "high": 0.3, "remove_grid": False},
        points=[Point(pixel=p) for p in (points or [])],
    )
    patched = client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    assert patched.status_code == 200
    return session_id, "c1"


def test_averaging_window_returns_points_with_user_origin():
    session_id, curve_id = _session_with_curve()
    res = client.post(f"/sessions/{session_id}/curves/{curve_id}/averaging-window", json={})
    assert res.status_code == 200
    pts = res.json()["curves"][0]["points"]
    assert len(pts) >= 1
    assert all(p["origin"] == "user" for p in pts)


def test_x_step_on_two_point_line_matches_data_samples():
    session_id, curve_id = _session_with_curve(points=[(0.0, 50.0), (100.0, 50.0)])
    cal_res = client.post(
        f"/sessions/{session_id}/calibration",
        json={"calibration": _linear_four_bound()},
    )
    assert cal_res.status_code == 200
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/x-step",
        json={"xmin": 0.0, "xmax": 10.0, "delx": 2.5},
    )
    assert res.status_code == 200
    pts = [tuple(p["pixel"]) for p in res.json()["curves"][0]["points"]]
    assert len(pts) == 5
    cal = Calibration(**_linear_four_bound())
    data = [pixel_to_data(cal, p) for p in pts]
    assert [x for x, _ in data] == pytest.approx([0.0, 2.5, 5.0, 7.5, 10.0])
    assert [y for _, y in data] == pytest.approx([5.0, 5.0, 5.0, 5.0, 5.0])
    assert [px for px, _ in pts] == pytest.approx([0.0, 25.0, 50.0, 75.0, 100.0])
    assert [py for _, py in pts] == pytest.approx([50.0, 50.0, 50.0, 50.0, 50.0])


def test_missing_curve_is_404():
    session_id, _curve_id = _session_with_curve()
    res = client.post(
        f"/sessions/{session_id}/curves/missing/averaging-window",
        json={},
    )
    assert res.status_code == 404


def test_x_step_without_calibration_is_400():
    session_id, curve_id = _session_with_curve(points=[(0.0, 50.0), (100.0, 50.0)])
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/x-step",
        json={"xmin": 0.0, "xmax": 10.0, "delx": 2.5},
    )
    assert res.status_code == 400


def test_x_step_empty_curve_is_400_no_points():
    session_id, curve_id = _session_with_curve()
    cal_res = client.post(
        f"/sessions/{session_id}/calibration",
        json={"calibration": _linear_four_bound()},
    )
    assert cal_res.status_code == 200
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/x-step",
        json={"xmin": 0.0, "xmax": 10.0, "delx": 2.5},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"]["code"] == "no_points"


def test_patch_region_persists_and_undo_restores():
    session_id, curve_id = _session_with_curve()
    region = RegionMask(boxes=[RegionBox(x=8.0, y=8.0, w=20.0, h=20.0)]).model_dump()
    res = client.patch(f"/sessions/{session_id}/curves/{curve_id}/region", json=region)
    assert res.status_code == 200
    stored = res.json()["curves"][0]["region"]
    assert stored["boxes"][0]["x"] == 8.0
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    assert undone.json()["curves"][0]["region"] is None
