import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.cv.unskew import (
    UnskewError,
    apply_homography_to_point,
    compute_unskew_homography,
    warp_image,
)
from app.main import app
from app.models.schemas import Calibration, CalibrationAxis, RefPoint

client = TestClient(app)

FIXTURE = Path(__file__).parent / "fixtures" / "unskew_vectors.json"
IMAGE_W = 700
IMAGE_H = 500


def _load():
    return json.loads(FIXTURE.read_text())


def _axis_points():
    return _load()["axis_points"]


def test_compute_homography_preserves_full_image():
    p = _axis_points()
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
        image_width=IMAGE_W,
        image_height=IMAGE_H,
    )
    assert result.width >= 380
    assert result.height >= 320
    assert result.width >= IMAGE_W * 0.5
    assert result.height >= IMAGE_H * 0.5


def test_y_axis_not_inverted_after_unskew():
    p = _axis_points()
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
        image_width=IMAGE_W,
        image_height=IMAGE_H,
    )
    ymax_out = apply_homography_to_point(result.matrix, tuple(p["ymax"]))
    ymin_out = apply_homography_to_point(result.matrix, tuple(p["ymin"]))
    assert ymax_out[1] < ymin_out[1]


def test_full_image_corners_stay_in_canvas():
    p = _axis_points()
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
        image_width=IMAGE_W,
        image_height=IMAGE_H,
    )
    corners = [(0, 0), (IMAGE_W, 0), (IMAGE_W, IMAGE_H), (0, IMAGE_H)]
    for corner in corners:
        out = apply_homography_to_point(result.matrix, corner)
        assert out[0] >= -1e-3
        assert out[1] >= -1e-3
        assert out[0] <= result.width + 1e-3
        assert out[1] <= result.height + 1e-3


def test_parallel_axes_raises():
    with pytest.raises(UnskewError, match="parallel"):
        compute_unskew_homography(
            xmin=(0, 0),
            xmax=(10, 0),
            ymin=(0, 5),
            ymax=(10, 5),
            image_width=100,
            image_height=100,
        )


def test_warp_image_output_size():
    p = _axis_points()
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
        image_width=IMAGE_W,
        image_height=IMAGE_H,
    )
    src = np.zeros((IMAGE_H, IMAGE_W, 3), dtype=np.uint8)
    out = warp_image(src, result.matrix, result.width, result.height)
    assert out.shape[1] == int(round(result.width))
    assert out.shape[0] == int(round(result.height))


def _png_bytes(width: int = IMAGE_W, height: int = IMAGE_H) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


def _skewed_calibration() -> dict:
    p = _axis_points()
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=tuple(p["xmin"]), value=0.0),
                RefPoint(pixel=tuple(p["xmax"]), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=tuple(p["ymax"]), value=10.0),
                RefPoint(pixel=tuple(p["ymin"]), value=0.0),
            ],
        ),
        source="manual",
    )
    return cal.model_dump()


def _session_with_calibration() -> dict:
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    assert res.status_code == 200
    body = res.json()
    patch = client.patch(
        f"/sessions/{body['id']}/preferences",
        json={"calibration": _skewed_calibration(), "manual_calibration": True},
    )
    assert patch.status_code == 200
    return patch.json()


def test_unskew_apply_endpoint():
    before = _session_with_calibration()
    session_id = before["id"]
    assert before["image_meta"]["width"] == IMAGE_W
    assert before["image_meta"]["height"] == IMAGE_H
    assert before["image_meta"]["revision"] == 0

    res = client.post(f"/sessions/{session_id}/unskew/apply")
    assert res.status_code == 200
    body = res.json()
    assert body["image_meta"]["width"] >= 380
    assert body["image_meta"]["height"] >= 320
    assert body["image_meta"]["revision"] >= 1


def test_unskew_apply_no_calibration():
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]

    apply_res = client.post(f"/sessions/{session_id}/unskew/apply")
    assert apply_res.status_code == 400
    detail = apply_res.json()["detail"]["error"]
    assert detail["code"] == "unskew_no_calibration"
