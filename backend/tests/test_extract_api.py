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


def _png_with_red_stroke() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 40), (110, 40)], fill=(255, 0, 0), width=5)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _png_red_stroke_tiny_blue() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 40), (110, 40)], fill=(255, 0, 0), width=5)
    img.putpixel((2, 2), (0, 0, 255))
    img.putpixel((3, 2), (0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex_near(got: str, want: str, tol: int = 8) -> bool:
    g = _hex_rgb(got)
    w = _hex_rgb(want)
    return all(abs(a - b) <= tol for a, b in zip(g, w, strict=True))


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


def test_extract_color_dominant_and_propose_on_red_stroke():
    session_id, curve_id = _session_with_curve(image=_png_with_red_stroke())
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/extract-color",
        json={"pixel": [60.0, 40.0]},
    )
    assert res.status_code == 200
    curve = next(c for c in res.json()["curves"] if c["id"] == curve_id)
    assert len(curve["points"]) >= 5
    assert curve["filter"]["mode"] == "sample"
    assert curve["filter"]["high"] == pytest.approx(0.12)
    assert _hex_near(curve["filter"]["sample_color"], "#ff0000")
    actions = [h["action"] for h in res.json()["history"]]
    assert actions[-1] == "extract_color"
    assert actions.count("extract_color") == 1
    assert "averaging_window" not in actions
    assert "curve_filter" not in actions

    colors = client.post(f"/sessions/{session_id}/dominant-colors")
    assert colors.status_code == 200
    assert any(_hex_near(c, "#ff0000") for c in colors.json()["colors"])

    proposed = client.post(
        f"/sessions/{session_id}/propose-curves",
        json={"extract": True},
    )
    assert proposed.status_code == 200
    with_points = [c for c in proposed.json()["curves"] if len(c["points"]) >= 1]
    assert len(with_points) >= 1


def test_extract_color_undo_restores_filter_and_points():
    session_id, curve_id = _session_with_curve(image=_png_with_red_stroke())
    before = client.get(f"/sessions/{session_id}").json()["curves"][0]
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/extract-color",
        json={"pixel": [60.0, 40.0], "distance": 0.2},
    )
    assert res.status_code == 200
    extracted = res.json()["curves"][0]
    assert extracted["filter"]["mode"] == "sample"
    assert extracted["filter"]["high"] == pytest.approx(0.2)
    assert len(extracted["points"]) >= 5
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    restored = undone.json()["curves"][0]
    assert restored["filter"]["mode"] == before["filter"]["mode"]
    assert restored["points"] == before["points"]


def test_extract_color_missing_curve_is_404():
    session_id, _curve_id = _session_with_curve(image=_png_with_red_stroke())
    res = client.post(
        f"/sessions/{session_id}/curves/missing/extract-color",
        json={"pixel": [60.0, 40.0]},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Curve not found"


def test_dominant_colors_does_not_mutate():
    session_id, _curve_id = _session_with_curve(image=_png_with_red_stroke())
    before = client.get(f"/sessions/{session_id}").json()
    res = client.post(f"/sessions/{session_id}/dominant-colors")
    assert res.status_code == 200
    assert any(_hex_near(c, "#ff0000") for c in res.json()["colors"])
    after = client.get(f"/sessions/{session_id}").json()
    assert after["history"] == before["history"]
    assert after["curves"] == before["curves"]


def test_propose_curves_labels_extracts_skips_sparse_and_undoes_one_shot():
    session_id, _curve_id = _session_with_curve(image=_png_red_stroke_tiny_blue())
    before_ids = {c["id"] for c in client.get(f"/sessions/{session_id}").json()["curves"]}
    res = client.post(
        f"/sessions/{session_id}/propose-curves",
        json={"extract": True, "limit": 8},
    )
    assert res.status_code == 200
    body = res.json()
    actions = [h["action"] for h in body["history"]]
    assert actions[-1] == "propose_curves"
    assert actions.count("propose_curves") == 1
    new_curves = [c for c in body["curves"] if c["id"] not in before_ids]
    assert new_curves
    assert all(c["label"].startswith("Colour ") for c in new_curves)
    assert {c["label"] for c in new_curves} <= {f"Colour {i}" for i in range(1, 9)}
    extracted = [c for c in new_curves if len(c["points"]) >= 3]
    assert extracted
    assert all(c["filter"]["mode"] == "sample" for c in extracted)
    assert all(c["trace_color"] for c in extracted)
    assert all(len(c["points"]) >= 3 for c in new_curves)
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    restored_ids = {c["id"] for c in undone.json()["curves"]}
    assert restored_ids == before_ids
