from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.models.schemas import Curve, Point

client = TestClient(app)


def _session_with_red_line():
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 70), (110, 10)], fill=(255, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    original = buf.getvalue()
    res = client.post("/sessions", files={"file": ("plot.png", original, "image/png")})
    assert res.status_code == 200
    session_id = res.json()["id"]
    curve = Curve(
        id="c1",
        label="A",
        color="#ff0000",
        points=[Point(pixel=(20.0, 60.0)), Point(pixel=(100.0, 20.0))],
    )
    patched = client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    assert patched.status_code == 200
    return session_id, original


def test_remove_from_plot_changes_image_and_undo_restores_bytes():
    session_id, original = _session_with_red_line()
    before = client.get(f"/sessions/{session_id}/image")
    assert before.status_code == 200
    assert before.content == original

    erased = client.post(f"/sessions/{session_id}/curves/c1/remove-from-plot")
    assert erased.status_code == 200
    assert erased.json()["image_meta"]["revision"] >= 1

    after = client.get(f"/sessions/{session_id}/image")
    assert after.status_code == 200
    assert after.content != original

    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    restored = client.get(f"/sessions/{session_id}/image")
    assert restored.content == original
    assert undone.json()["image_meta"]["revision"] == 0


def test_remove_from_plot_requires_two_points():
    img = Image.new("RGB", (80, 60), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("plot.png", buf.getvalue(), "image/png")})
    session_id = res.json()["id"]
    curve = Curve(id="c1", label="A", color="#ff0000", points=[Point(pixel=(10.0, 10.0))])
    client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    bad = client.post(f"/sessions/{session_id}/curves/c1/remove-from-plot")
    assert bad.status_code == 400
