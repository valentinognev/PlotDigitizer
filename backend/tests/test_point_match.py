from __future__ import annotations

import io
import math

import cv2
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.cv.point_match import match_points
from app.main import app
from app.models.schemas import WorkspaceState

client = TestClient(app)


def _blank(w: int = 200, h: int = 160) -> np.ndarray:
    return np.zeros((h, w), dtype=np.uint8)


def _draw_circle(mask: np.ndarray, xy: tuple[float, float], radius: int = 5) -> None:
    cv2.circle(mask, (int(round(xy[0])), int(round(xy[1]))), radius, 255, thickness=-1)


def _draw_diamond(mask: np.ndarray, xy: tuple[float, float], radius: int = 6) -> None:
    x, y = int(round(xy[0])), int(round(xy[1]))
    pts = np.array(
        [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(mask, pts, 255)


def _greedy_match(
    candidates: list, truth: list[tuple[float, float]], cutoff: float
) -> tuple[int, int, float]:
    used = [False] * len(truth)
    tp = 0
    distances: list[float] = []
    for cand in candidates:
        cx, cy = cand.pixel
        best_i = -1
        best_d = cutoff + 1.0
        for i, (tx, ty) in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cx - tx, cy - ty)
            if d < best_d:
                best_d = d
                best_i = i
        if best_i >= 0 and best_d <= cutoff:
            used[best_i] = True
            tp += 1
            distances.append(best_d)
    fp = len(candidates) - tp
    mean_d = float(sum(distances) / len(distances)) if distances else 999.0
    return tp, fp, mean_d


def test_empty_mask_returns_empty():
    out = match_points(_blank(), (40.0, 40.0), sample_radius=6)
    assert out == []


def test_ranked_best_first():
    mask = _blank()
    _draw_circle(mask, (40.0, 50.0), 5)
    _draw_circle(mask, (140.0, 50.0), 5)
    out = match_points(mask, (40.0, 50.0), sample_radius=6, max_point_size=24)
    assert len(out) >= 2
    scores = [c.score for c in out]
    assert scores == sorted(scores, reverse=True)
    assert out[0].score >= 0.95
    assert math.hypot(out[0].pixel[0] - 40.0, out[0].pixel[1] - 50.0) <= 1.5


def test_limit_caps_results():
    mask = _blank(w=400, h=80)
    centres = [(20.0 + 30.0 * i, 40.0) for i in range(10)]
    for c in centres:
        _draw_circle(mask, c, 4)
    out = match_points(mask, centres[0], sample_radius=5, max_point_size=20, limit=3)
    assert len(out) == 3


def test_exclude_suppresses_placed_points():
    mask = _blank()
    a, b = (40.0, 50.0), (140.0, 50.0)
    _draw_circle(mask, a, 5)
    _draw_circle(mask, b, 5)
    first = match_points(mask, a, sample_radius=6, max_point_size=24)
    assert len(first) >= 2
    excluded = [c.pixel for c in first]
    again = match_points(
        mask, a, sample_radius=6, max_point_size=24, exclude=excluded
    )
    for cand in again:
        for ex in excluded:
            assert math.hypot(cand.pixel[0] - ex[0], cand.pixel[1] - ex[1]) > 6.0


def test_max_point_size_rejects_gridline():
    mask = _blank(w=300, h=120)
    cv2.line(mask, (10, 60), (290, 60), 255, thickness=2)
    _draw_circle(mask, (60.0, 30.0), 5)
    out = match_points(mask, (60.0, 30.0), sample_radius=6, max_point_size=16)
    assert len(out) >= 1
    for cand in out:
        assert abs(cand.pixel[1] - 60.0) > 8.0
    line_only = _blank(w=300, h=80)
    cv2.line(line_only, (10, 40), (290, 40), 255, thickness=2)
    none = match_points(line_only, (80.0, 40.0), sample_radius=8, max_point_size=12)
    assert none == []


def test_nearby_marker_does_not_pull_centroid():
    """A full-bbox snap on the unmasked image would include the neighbor bar."""
    mask = _blank(w=120, h=80)
    left = (40.0, 40.0)
    right = (50.0, 40.0)
    cv2.rectangle(mask, (39, 30), (41, 50), 255, thickness=-1)
    cv2.rectangle(mask, (49, 30), (51, 50), 255, thickness=-1)
    out = match_points(mask, left, sample_radius=6, max_point_size=24)
    assert len(out) >= 1
    assert math.hypot(out[0].pixel[0] - left[0], out[0].pixel[1] - left[1]) <= 1.5
    for cand in out:
        assert abs(cand.pixel[0] - 45.0) > 2.0


def test_two_shapes_separable_by_sample():
    mask = _blank(w=240, h=160)
    circles = [(40.0, 40.0), (90.0, 40.0), (140.0, 40.0)]
    diamonds = [(40.0, 110.0), (90.0, 110.0), (140.0, 110.0)]
    for c in circles:
        _draw_circle(mask, c, 5)
    for d in diamonds:
        _draw_diamond(mask, d, 7)
    circ = match_points(mask, circles[0], sample_radius=7, max_point_size=24)
    tp, fp, _ = _greedy_match(circ, circles, cutoff=3.0)
    assert tp == 3
    near_diamond = 0
    for cand in circ[:3]:
        if min(math.hypot(cand.pixel[0] - d[0], cand.pixel[1] - d[1]) for d in diamonds) <= 4.0:
            near_diamond += 1
    assert near_diamond == 0
    dia = match_points(mask, diamonds[0], sample_radius=7, max_point_size=24)
    tp_d, _, _ = _greedy_match(dia, diamonds, cutoff=3.0)
    assert tp_d == 3


def test_synthetic_scatter_precision_gates():
    from metrics import assert_not_worse
    from tests.synth.plotgen import render_plot

    centres = [(1.5, 2.0), (3.0, 7.5), (5.0, 4.0), (7.2, 8.0), (8.5, 1.8)]
    plot = render_plot(
        lambda x: 5.0,
        x_range=(0.0, 10.0),
        y_range=(0.0, 10.0),
        size=(400, 400),
        line_width=1,
        line_color=(255, 255, 255),
        markers=[
            {"xy": (x, y), "shape": "circle", "size": 9, "color": (0, 0, 255)}
            for x, y in centres
        ],
    )
    ink = np.any(plot.image != np.array([255, 255, 255], dtype=np.uint8), axis=2)
    mask = np.where(ink, 255, 0).astype(np.uint8)
    truth = [plot.pixel_of(x, y) for x, y in centres]
    sample = truth[0]
    out = match_points(mask, sample, sample_radius=7, max_point_size=24)
    tp, fp, mean_d = _greedy_match(out, truth, cutoff=1.5)
    n = len(truth)
    recall = tp / n
    fp_rate = fp / max(tp + fp, 1)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    assert mean_d <= 1.5
    assert_not_worse("point_match.synthetic_scatter.recall", recall, lower_is_better=False)
    assert_not_worse("point_match.synthetic_scatter.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse("point_match.synthetic_scatter.centroid_px", mean_d, lower_is_better=True)


def _session_with_dots() -> str:
    img = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(img)
    for xy in [(40, 40), (100, 40), (160, 40)]:
        draw.ellipse((xy[0] - 5, xy[1] - 5, xy[0] + 5, xy[1] + 5), fill=(0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("dots.png", buf.getvalue(), "image/png")})
    assert res.status_code == 200
    sid = res.json()["id"]
    patch = client.patch(
        f"/sessions/{sid}/curves",
        json={"curves": [{"label": "Scatter", "color": "#2563eb", "style": "unknown", "visible": True, "points": []}]},
    )
    assert patch.status_code == 200
    return sid, patch.json()["curves"][0]["id"]


def test_point_match_is_non_mutating():
    sid, cid = _session_with_dots()
    before = client.get(f"/sessions/{sid}").json()
    res = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match",
        json={"pixel": [40.0, 40.0], "sample_radius": 6, "max_point_size": 24},
    )
    assert res.status_code == 200
    body = res.json()
    assert "candidates" in body
    assert len(body["candidates"]) >= 2
    assert "pixel" in body["candidates"][0]
    assert "score" in body["candidates"][0]
    scores = [c["score"] for c in body["candidates"]]
    assert scores == sorted(scores, reverse=True)
    after = client.get(f"/sessions/{sid}").json()
    assert after["curves"][0]["points"] == before["curves"][0]["points"]
    assert after["history"] == before["history"]


def test_point_match_accept_appends_and_undoes():
    sid, cid = _session_with_dots()
    found = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match",
        json={"pixel": [40.0, 40.0], "max_point_size": 24},
    )
    pixels = [c["pixel"] for c in found.json()["candidates"][:2]]
    acc = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match/accept",
        json={"pixels": pixels},
    )
    assert acc.status_code == 200
    points = acc.json()["curves"][0]["points"]
    assert len(points) == 2
    assert all(p["origin"] == "ai" for p in points)
    assert acc.json()["history"][-1]["action"] == "point_match_accept"
    undone = client.post(f"/sessions/{sid}/undo")
    assert undone.status_code == 200
    assert undone.json()["curves"][0]["points"] == []


def test_workspace_max_point_size_default():
    ws = WorkspaceState()
    assert ws.max_point_size == 48


def test_point_match_unknown_curve_is_400():
    sid, _cid = _session_with_dots()
    res = client.post(
        f"/sessions/{sid}/curves/not-a-curve/point-match",
        json={"pixel": [40.0, 40.0]},
    )
    assert res.status_code == 400


def test_synthetic_pipeline_scatter_and_line_export():
    from app.calibration.coords import pixel_to_data
    from app.export.export import export_csv
    from app.models.schemas import (
        AxisPoint,
        Calibration,
        CalibrationAxis,
        Curve,
        Point,
        Session,
    )
    from tests.synth.plotgen import render_plot

    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 10.0),
        size=(200, 200),
        line_width=2,
        line_color=(0, 0, 255),
    )
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="cartesian",
        model="auto",
        axis_points=[
            AxisPoint(pixel=ap.pixel, x_value=ap.x_value, y_value=ap.y_value)
            for ap in plot.axis_points
        ],
    )
    session = Session(
        image_meta={"width": 200, "height": 200, "scale_factor": 1.0},
        calibration=cal,
        curves=[
            Curve(
                label="line",
                connect_as="line",
                points=[Point(pixel=plot.pixel_of(2.0, 1.0), origin="user")],
            )
        ],
    )

    text = export_csv(session)
    assert text.splitlines()[0] == "curve_id,curve_label,x,y"
    x, y = pixel_to_data(cal, plot.pixel_of(2.0, 1.0))
    row = text.splitlines()[1].split(",")
    assert abs(float(row[2]) - x) < 1e-9
    assert abs(float(row[3]) - y) < 1e-9
