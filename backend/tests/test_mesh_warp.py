import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.cv.mesh_warp import (
    _in_plot_rect,
    _plot_top_y,
    _source_in_plot_quad,
    compute_mesh_warp_params,
    eval_coons,
    eval_mesh_uv,
    init_mesh_from_calibration,
    map_dest_to_source,
    map_source_to_dest,
    resolve_mesh_grid,
    validate_mesh,
    warp_image_mesh,
)
from app.main import app
from app.models.schemas import Calibration, CalibrationAxis, MeshVertexPayload, RefPoint

client = TestClient(app)
FIXTURE = Path(__file__).parent / "fixtures" / "unskew_vectors.json"
IMAGE_W = 700
IMAGE_H = 500


def _axis_points():
    return json.loads(FIXTURE.read_text())["axis_points"]


def _calibration() -> Calibration:
    p = _axis_points()
    return Calibration(
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


def test_init_mesh_has_boundary_vertices():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    sections = len(mesh) - 1
    boundary = sum(
        1
        for i in range(len(mesh))
        for j in range(len(mesh))
        if i == 0 or i == sections or j == 0 or j == sections
    )
    assert sections == 3
    assert boundary == 4 * sections
    validate_mesh(mesh)


def test_coons_corners_match_boundary():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    last = len(mesh) - 1
    assert eval_coons(mesh, 0, 0) == mesh[0][0].position
    assert eval_coons(mesh, 1, 0) == mesh[0][last].position
    assert eval_coons(mesh, 0, 1) == mesh[last][0].position
    assert eval_coons(mesh, 1, 1) == mesh[last][last].position


def test_mesh_top_maps_near_ymax():
    cal = _calibration()
    p = _axis_points()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    top_y = _plot_top_y(params) + 10
    dx = params.plot_offset_x + params.plot_width * 0.5
    src = map_dest_to_source((dx, top_y), params, grid)
    ymax_y = p["ymax"][1]
    ymin_y = p["ymin"][1]
    assert abs(src[1] - ymax_y) < abs(src[1] - ymin_y)


def test_mesh_bottom_maps_near_origin():
    cal = _calibration()
    p = _axis_points()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    bottom_y = params.plot_offset_y - 10
    dx = params.plot_offset_x + params.plot_width * 0.5
    src = map_dest_to_source((dx, bottom_y), params, grid)
    origin_y = p["xmin"][1]  # near ymin/xmin corner
    ymax_y = p["ymax"][1]
    assert abs(src[1] - origin_y) < abs(src[1] - ymax_y)


def test_source_outside_plot_quad_uses_homography():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    from app.cv.unskew import apply_homography_to_point

    margin = (10.0, 10.0)
    assert not _source_in_plot_quad(margin, grid)
    dest = map_source_to_dest(margin, params, grid)
    expected = apply_homography_to_point(params.homography, margin)
    assert abs(dest[0] - expected[0]) < 1e-3
    assert abs(dest[1] - expected[1]) < 1e-3


def test_margin_uses_homography_not_mesh():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    from app.cv.unskew import apply_homography_to_point

    margin = (10.0, 10.0)
    assert not _in_plot_rect(margin[0], margin[1], params)
    src = map_dest_to_source(margin, params, grid)
    expected = apply_homography_to_point(params.homography, margin, inverse=True)
    assert abs(src[0] - expected[0]) < 1e-6
    assert abs(src[1] - expected[1]) < 1e-6


def test_mesh_round_trip_uv():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    u, v = 0.5, 0.5
    src = eval_mesh_uv(grid, u, v)
    dest = (
        params.plot_offset_x + u * params.plot_width,
        _plot_top_y(params) + v * params.plot_height,
    )
    back = map_dest_to_source(dest, params, grid)
    assert abs(back[0] - src[0]) < 2
    assert abs(back[1] - src[1]) < 2


def test_warp_image_mesh_output_size():
    cal = _calibration()
    mesh = init_mesh_from_calibration(cal)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    src = np.zeros((IMAGE_H, IMAGE_W, 3), dtype=np.uint8)
    out = warp_image_mesh(src, params, grid)
    assert out.shape[1] == int(round(params.width))
    assert out.shape[0] == int(round(params.height))


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (IMAGE_W, IMAGE_H), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_mesh_axis_bounds_track_warp_with_adjusted_mesh():
    """Axis marks must use the same inverse as the preview warp, not homography alone."""
    cal = _calibration()
    p = _axis_points()
    mesh = init_mesh_from_calibration(cal)
    mesh[3][3].position = (mesh[3][3].position[0] + 40, mesh[3][3].position[1] + 60)
    mesh[0][3].position = (mesh[0][3].position[0] + 30, mesh[0][3].position[1] - 20)
    params, grid = compute_mesh_warp_params(mesh, cal, IMAGE_W, IMAGE_H)
    from app.cv.unskew import apply_homography_to_point

    for key in ("xmin", "xmax", "ymin", "ymax"):
        src = tuple(p[key])
        dest = map_source_to_dest(src, params, grid)
        back = map_dest_to_source(dest, params, grid)
        assert abs(back[0] - src[0]) < 0.5
        assert abs(back[1] - src[1]) < 0.5
        homog = apply_homography_to_point(params.homography, src)
        if key == "xmax":
            assert abs(dest[0] - homog[0]) > 1 or abs(dest[1] - homog[1]) > 1

    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]
    cal = _calibration().model_dump()
    client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": cal, "manual_calibration": True},
    )
    cal_obj = _calibration()
    mesh = init_mesh_from_calibration(cal_obj)
    vertices = [
        MeshVertexPayload(
            row=i,
            col=j,
            position=v.position,
            tangent_h=v.tangent_h,
            tangent_v=v.tangent_v,
        )
        for i in range(4)
        for j in range(4)
        if i == 0 or i == 3 or j == 0 or j == 3
        for v in [mesh[i][j]]
    ]
    apply_res = client.post(
        f"/sessions/{session_id}/unskew/apply",
        json={
            "mode": "mesh",
            "mesh": {"sections": 3, "vertices": [v.model_dump() for v in vertices]},
        },
    )
    assert apply_res.status_code == 200
    body = apply_res.json()
    assert body["image_meta"]["width"] >= 380
    assert body["image_meta"]["revision"] >= 1


def test_mesh_apply_remaps_named_calibrations_and_regions():
    from app.calibration.coords import pixel_to_data
    from app.calibration.session_cal import calibration_for_curve
    from app.cv.mesh_warp import run_mesh_warp_apply
    from app.models.schemas import Curve, Point, RegionBox, RegionMask, Session

    p = _axis_points()
    left = _calibration().model_copy(update={"id": "cal-left", "name": "Left"})
    right = Calibration(
        id="cal-right",
        name="Right",
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=tuple(p["xmin"]), value=0.0),
                RefPoint(pixel=tuple(p["xmax"]), value=20.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=tuple(p["ymax"]), value=100.0),
                RefPoint(pixel=tuple(p["ymin"]), value=0.0),
            ],
        ),
        source="manual",
    )
    seed = (300.0, 250.0)
    orig_right_xmax = tuple(right.x.ref_points[1].pixel)
    orig_right_ymax = tuple(right.y.ref_points[0].pixel)
    mesh = init_mesh_from_calibration(left)
    vertices = [
        MeshVertexPayload(
            row=i,
            col=j,
            position=v.position,
            tangent_h=v.tangent_h,
            tangent_v=v.tangent_v,
        )
        for i in range(4)
        for j in range(4)
        if i == 0 or i == 3 or j == 0 or j == 3
        for v in [mesh[i][j]]
    ]
    params, grid = compute_mesh_warp_params(mesh, left, IMAGE_W, IMAGE_H)
    expect_seed = map_source_to_dest(seed, params, grid)
    expect_xmax = map_source_to_dest(orig_right_xmax, params, grid)
    expect_ymax = map_source_to_dest(orig_right_ymax, params, grid)
    mapped_box = [
        map_source_to_dest(c, params, grid)
        for c in ((10.0, 10.0), (30.0, 10.0), (30.0, 30.0), (10.0, 30.0))
    ]
    session = Session(
        image_meta={"width": IMAGE_W, "height": IMAGE_H, "scale_factor": 1.0},
        calibration=left,
        calibrations=[left, right],
        curves=[
            Curve(
                id="c-right",
                label="B",
                calibration_id="cal-right",
                points=[Point(pixel=seed, origin="user")],
                region=RegionMask(boxes=[RegionBox(x=10.0, y=10.0, w=20.0, h=20.0)]),
            )
        ],
    )
    session, _img = run_mesh_warp_apply(session, _png_bytes(), vertices, 3, calibration=left)
    bound = calibration_for_curve(session, session.curves[0])
    assert bound is not None
    got_pt = session.curves[0].points[0].pixel
    assert got_pt == pytest.approx(expect_seed, abs=0.5)
    assert tuple(bound.x.ref_points[1].pixel) == pytest.approx(expect_xmax, abs=0.5)
    assert tuple(bound.y.ref_points[0].pixel) == pytest.approx(expect_ymax, abs=0.5)
    assert pixel_to_data(bound, got_pt) == pytest.approx(pixel_to_data(bound, expect_seed), abs=1e-6)
    assert session.calibration is next(c for c in session.calibrations if c.id == session.calibration.id)
    box = session.curves[0].region.boxes[0]
    assert box.x == pytest.approx(min(p[0] for p in mapped_box), abs=0.5)
    assert box.y == pytest.approx(min(p[1] for p in mapped_box), abs=0.5)


def test_mesh_apply_requires_payload():
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    session_id = res.json()["id"]
    cal = _calibration().model_dump()
    client.patch(
        f"/sessions/{session_id}/preferences",
        json={"calibration": cal, "manual_calibration": True},
    )
    apply_res = client.post(f"/sessions/{session_id}/unskew/apply", json={"mode": "mesh"})
    assert apply_res.status_code == 400
