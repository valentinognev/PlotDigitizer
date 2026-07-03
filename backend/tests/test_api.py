import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app

client = TestClient(app)


def _png_bytes() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 60), (110, 20)], fill=(255, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_health():
    res = client.get("/health")
    assert res.status_code == 200


def test_create_and_get_session():
    data = _png_bytes()
    res = client.post("/sessions", files={"file": ("plot.png", data, "image/png")})
    assert res.status_code == 200
    body = res.json()
    assert "id" in body
    get_res = client.get(f"/sessions/{body['id']}")
    assert get_res.status_code == 200


def test_last_session_persisted():
    data = _png_bytes()
    res = client.post("/sessions", files={"file": ("plot.png", data, "image/png")})
    assert res.status_code == 200
    session_id = res.json()["id"]

    last_res = client.get("/sessions/last")
    assert last_res.status_code == 200
    assert last_res.json()["id"] == session_id

    img_res = client.get(f"/sessions/{session_id}/image")
    assert img_res.status_code == 200
    assert img_res.content[:8] == b"\x89PNG\r\n\x1a\n"
