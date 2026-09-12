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


def test_unskew_apply_uses_request_calibration_not_stale_session():
    """Apply must warp with the calibration sent in the request (preview parity)."""
    p = json.loads(FIXTURE.read_text())["axis_points"]
    stale = _skewed_calibration()
    shifted = _skewed_calibration()
    shifted["x"]["ref_points"][1]["pixel"] = [p["xmax"][0], p["xmax"][1] + 80]

    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]
    client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": stale, "manual_calibration": True},
    )
    with_stale = client.post(f"/sessions/{session_id}/unskew/apply").json()

    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id2 = res.json()["id"]
    client.patch(
        f"/sessions/{session_id2}/preferences",
        json={"calibration": stale, "manual_calibration": True},
    )
    with_shifted = client.post(
        f"/sessions/{session_id2}/unskew/apply",
        json={"mode": "perspective", "calibration": shifted},
    ).json()

    assert with_stale["image_meta"]["width"] != with_shifted["image_meta"]["width"]
    assert with_shifted["image_meta"]["width"] == 777


def _named_cal(cal_id: str, name: str, y_max: float, *, extra: dict | None = None) -> Calibration:
    p = _axis_points()
    return Calibration(
        id=cal_id,
        name=name,
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
                RefPoint(pixel=tuple(p["ymax"]), value=y_max),
                RefPoint(pixel=tuple(p["ymin"]), value=0.0),
            ],
        ),
        source="manual",
        **(extra or {}),
    )


def test_unskew_apply_remaps_named_calibrations_regions_and_upserts():
    from app.calibration.coords import pixel_to_data
    from app.calibration.session_cal import calibration_for_curve
    from app.models.schemas import (
        AxisPoint,
        Curve,
        Point,
        RegionBox,
        RegionMask,
        ScaleBar,
        Session,
    )
    from app.pipeline.pipeline import run_unskew_apply

    p = _axis_points()
    left = _named_cal(
        "cal-left",
        "Left",
        10.0,
        extra={"axis_points": [AxisPoint(pixel=tuple(p["xmin"]), x_value=0.0, y_value=0.0)]},
    )
    right = _named_cal(
        "cal-right",
        "Right",
        100.0,
        extra={
            "scale_bar": ScaleBar(
                pixel_a=tuple(p["xmin"]),
                pixel_b=tuple(p["xmax"]),
                length=10.0,
                units="mm",
            )
        },
    )
    seed = (300.0, 250.0)
    orig_stroke = (15.0, 15.0)
    right_xmax = tuple(right.x.ref_points[1].pixel)
    right_ymax = tuple(right.y.ref_points[0].pixel)
    axis_px = tuple(left.axis_points[0].pixel)
    bar_b = tuple(right.scale_bar.pixel_b)  # type: ignore[union-attr]

    from app.cv.unskew import (
        apply_homography_to_point,
        bounds_pixels_from_calibration,
        compute_unskew_homography,
    )

    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(left)
    warp = compute_unskew_homography(
        xmin, xmax, ymin, ymax, image_width=IMAGE_W, image_height=IMAGE_H
    )
    expect_seed = apply_homography_to_point(warp.matrix, seed)
    expect_xmax = apply_homography_to_point(warp.matrix, right_xmax)
    expect_ymax = apply_homography_to_point(warp.matrix, right_ymax)
    expect_axis = apply_homography_to_point(warp.matrix, axis_px)
    expect_bar_b = apply_homography_to_point(warp.matrix, bar_b)

    # Distinct singleton object so upsert must re-bind list + panel after remap.
    session = Session(
        image_meta={"width": IMAGE_W, "height": IMAGE_H, "scale_factor": 1.0},
        calibration=left.model_copy(deep=True),
        calibrations=[left, right],
        curves=[
            Curve(
                id="c-right",
                label="B",
                calibration_id="cal-right",
                points=[Point(pixel=seed, origin="user")],
                region=RegionMask(
                    boxes=[RegionBox(x=10.0, y=10.0, w=20.0, h=20.0)],
                    strokes=[[(15.0, 15.0), (25.0, 25.0)]],
                    erase_strokes=[[(30.0, 30.0), (40.0, 40.0)]],
                ),
            )
        ],
    )

    session, _img = run_unskew_apply(session, _png_bytes())
    bound = calibration_for_curve(session, session.curves[0])
    assert bound is not None
    assert bound.id == "cal-right"
    got_pt = session.curves[0].points[0].pixel
    assert got_pt == pytest.approx(expect_seed, abs=1e-6)
    assert tuple(bound.x.ref_points[1].pixel) == pytest.approx(expect_xmax, abs=1e-6)
    assert tuple(bound.y.ref_points[0].pixel) == pytest.approx(expect_ymax, abs=1e-6)
    assert pixel_to_data(bound, got_pt) == pytest.approx(pixel_to_data(bound, expect_seed), abs=1e-9)
    left_after = next(c for c in session.calibrations if c.id == "cal-left")
    assert tuple(left_after.axis_points[0].pixel) == pytest.approx(expect_axis, abs=1e-6)
    assert session.calibration is not None
    assert session.calibration is next(c for c in session.calibrations if c.id == session.calibration.id)
    assert tuple(bound.scale_bar.pixel_b) == pytest.approx(expect_bar_b, abs=1e-6)  # type: ignore[union-attr]
    region = session.curves[0].region
    assert region is not None
    box = region.boxes[0]
    mapped_corners = [
        apply_homography_to_point(warp.matrix, c)
        for c in ((10.0, 10.0), (30.0, 10.0), (30.0, 30.0), (10.0, 30.0))
    ]
    assert box.x == pytest.approx(min(p[0] for p in mapped_corners), abs=1e-6)
    assert box.y == pytest.approx(min(p[1] for p in mapped_corners), abs=1e-6)
    assert region.strokes[0][0] == pytest.approx(
        apply_homography_to_point(warp.matrix, orig_stroke), abs=1e-6
    )
    assert region.erase_strokes[0][0] == pytest.approx(
        apply_homography_to_point(warp.matrix, (30.0, 30.0)), abs=1e-6
    )
