from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

from app.cv.unskew import (
    UnskewError,
    apply_homography_to_point,
    bounds_pixels_from_calibration,
    compute_unskew_homography,
    warp_image,
)
from app.models.schemas import Calibration, MeshVertexPayload, Session


GRID_SIZE = 4
Point = tuple[float, float]


@dataclass(frozen=True)
class MeshWarpResult:
    width: float
    height: float
    plot_width: float
    plot_height: float
    plot_offset_x: float
    plot_offset_y: float
    homography: np.ndarray


def _lerp(a: Point, b: Point, t: float) -> Point:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def _scale(v: Point, s: float) -> Point:
    return (v[0] * s, v[1] * s)


def _line_intersection(p1: Point, p2: Point, p3: Point, p4: Point) -> Point:
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        raise UnskewError("Axis lines are parallel")
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return float(px), float(py)


def _project_on_line(point: Point, line_a: Point, line_b: Point) -> Point:
    ax, ay = line_a
    bx, by = line_b
    px, py = point
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom < 1e-9:
        raise UnskewError("Degenerate axis line")
    t = ((px - ax) * dx + (py - ay) * dy) / denom
    return ax + t * dx, ay + t * dy


def _hermite(p0: Point, m0: Point, p1: Point, m1: Point, t: float) -> Point:
    t2 = t * t
    t3 = t2 * t
    h00 = 2 * t3 - 3 * t2 + 1
    h10 = t3 - 2 * t2 + t
    h01 = -2 * t3 + 3 * t2
    h11 = t3 - t2
    return (
        h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
        h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
    )


def _hermite_edge4(pts: tuple[Point, Point, Point, Point], tangents: tuple[Point, Point, Point, Point], t: float) -> Point:
    seg = t * 3
    i = min(2, int(seg))
    local = seg - i
    m0 = _scale(tangents[i], 1 / 3)
    m1 = _scale(tangents[i + 1], 1 / 3)
    return _hermite(pts[i], m0, pts[i + 1], m1, local)


@dataclass
class _MeshVertex:
    position: Point
    tangent_h: Point | None = None
    tangent_v: Point | None = None


def _is_boundary(i: int, j: int) -> bool:
    return i == 0 or i == GRID_SIZE - 1 or j == 0 or j == GRID_SIZE - 1


def init_mesh_from_calibration(cal: Calibration) -> list[list[_MeshVertex]]:
    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(cal)
    origin = _line_intersection(xmin, xmax, ymin, ymax)
    br = _project_on_line(xmax, xmin, xmax)
    tl = _project_on_line(ymax, ymin, ymax)
    tr: Point = (
        origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
        origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]),
    )

    corners: list[list[Point]] = [
        [tl, _lerp(tl, tr, 1 / 3), _lerp(tl, tr, 2 / 3), tr],
        [_lerp(tl, origin, 1 / 3), (0.0, 0.0), (0.0, 0.0), _lerp(tr, br, 1 / 3)],
        [_lerp(tl, origin, 2 / 3), (0.0, 0.0), (0.0, 0.0), _lerp(tr, br, 2 / 3)],
        [origin, _lerp(origin, br, 1 / 3), _lerp(origin, br, 2 / 3), br],
    ]

    vertices: list[list[_MeshVertex]] = []
    for i in range(GRID_SIZE):
        row: list[_MeshVertex] = []
        for j in range(GRID_SIZE):
            if not _is_boundary(i, j):
                row.append(_MeshVertex((0.0, 0.0)))
                continue
            pos = corners[i][j]
            vtx = _MeshVertex(pos)
            if j < GRID_SIZE - 1:
                vtx.tangent_h = _sub(corners[i][j + 1], pos)
            elif j > 0:
                vtx.tangent_h = _sub(pos, corners[i][j - 1])
            if i < GRID_SIZE - 1:
                vtx.tangent_v = _sub(corners[i + 1][j], pos)
            elif i > 0:
                vtx.tangent_v = _sub(pos, corners[i - 1][j])
            row.append(vtx)
        vertices.append(row)
    return vertices


def mesh_from_payload(
    payload_vertices: list[MeshVertexPayload],
    base: list[list[_MeshVertex]],
) -> list[list[_MeshVertex]]:
    import copy

    vertices = copy.deepcopy(base)
    for v in payload_vertices:
        cell = vertices[v.row][v.col]
        cell.position = v.position
        if v.tangent_h is not None:
            cell.tangent_h = v.tangent_h
        if v.tangent_v is not None:
            cell.tangent_v = v.tangent_v
    return vertices


def _boundary_row(mesh: list[list[_MeshVertex]], i: int) -> tuple[Point, Point, Point, Point]:
    return tuple(mesh[i][j].position for j in range(4))  # type: ignore[return-value]


def _boundary_col(mesh: list[list[_MeshVertex]], j: int) -> tuple[Point, Point, Point, Point]:
    return tuple(mesh[i][j].position for i in range(4))  # type: ignore[return-value]


def _row_tangents_h(mesh: list[list[_MeshVertex]], i: int) -> tuple[Point, Point, Point, Point]:
    return tuple(mesh[i][j].tangent_h or (0.0, 0.0) for j in range(4))  # type: ignore[return-value]


def _col_tangents_v(mesh: list[list[_MeshVertex]], j: int) -> tuple[Point, Point, Point, Point]:
    return tuple(mesh[i][j].tangent_v or (0.0, 0.0) for i in range(4))  # type: ignore[return-value]


def eval_coons(mesh: list[list[_MeshVertex]], u: float, v: float) -> Point:
    top = _hermite_edge4(_boundary_row(mesh, 0), _row_tangents_h(mesh, 0), u)
    bottom = _hermite_edge4(_boundary_row(mesh, 3), _row_tangents_h(mesh, 3), u)
    left = _hermite_edge4(_boundary_col(mesh, 0), _col_tangents_v(mesh, 0), v)
    right = _hermite_edge4(_boundary_col(mesh, 3), _col_tangents_v(mesh, 3), v)

    p00 = mesh[0][0].position
    p03 = mesh[0][3].position
    p30 = mesh[3][0].position
    p33 = mesh[3][3].position

    bilinear = (
        (1 - u) * (1 - v) * p00[0]
        + u * (1 - v) * p03[0]
        + (1 - u) * v * p30[0]
        + u * v * p33[0]
    )
    bilinear_y = (
        (1 - u) * (1 - v) * p00[1]
        + u * (1 - v) * p03[1]
        + (1 - u) * v * p30[1]
        + u * v * p33[1]
    )
    return (
        (1 - v) * top[0] + v * bottom[0] + (1 - u) * left[0] + u * right[0] - bilinear,
        (1 - v) * top[1] + v * bottom[1] + (1 - u) * left[1] + u * right[1] - bilinear_y,
    )


def resolve_mesh_grid(mesh: list[list[_MeshVertex]]) -> list[list[Point]]:
    grid: list[list[Point]] = []
    for i in range(GRID_SIZE):
        row: list[Point] = []
        for j in range(GRID_SIZE):
            row.append(eval_coons(mesh, j / 3, i / 3))
        grid.append(row)
    return grid


def _eval_cell(grid: list[list[Point]], ci: int, cj: int, s: float, t: float) -> Point:
    p00, p01 = grid[ci][cj], grid[ci][cj + 1]
    p10, p11 = grid[ci + 1][cj], grid[ci + 1][cj + 1]
    return (
        (1 - s) * (1 - t) * p00[0] + s * (1 - t) * p01[0] + (1 - s) * t * p10[0] + s * t * p11[0],
        (1 - s) * (1 - t) * p00[1] + s * (1 - t) * p01[1] + (1 - s) * t * p10[1] + s * t * p11[1],
    )


def eval_mesh_uv(grid: list[list[Point]], u: float, v: float) -> Point:
    uu = max(0.0, min(1.0, u))
    vv = max(0.0, min(1.0, v))
    uf = uu * 3
    vf = vv * 3
    ci = min(2, int(vf))
    cj = min(2, int(uf))
    s = uf - cj
    t = vf - ci
    return _eval_cell(grid, ci, cj, s, t)


def _quad_area(a: Point, b: Point, c: Point, d: Point) -> float:
    pts = [a, b, c, d]
    area = 0.0
    for i in range(4):
        j = (i + 1) % 4
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    return abs(area) * 0.5


def validate_mesh(mesh: list[list[_MeshVertex]]) -> list[list[Point]]:
    grid = resolve_mesh_grid(mesh)
    for i in range(3):
        for j in range(3):
            if _quad_area(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]) < 1:
                raise UnskewError("Degenerate mesh cell")
    return grid


def compute_mesh_warp_params(
    mesh: list[list[_MeshVertex]],
    cal: Calibration,
    image_width: int,
    image_height: int,
) -> tuple[MeshWarpResult, list[list[Point]]]:
    grid = validate_mesh(mesh)
    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(cal)
    perspective = compute_unskew_homography(
        xmin, xmax, ymin, ymax, image_width=image_width, image_height=image_height
    )
    origin = _line_intersection(xmin, xmax, ymin, ymax)
    br = _project_on_line(xmax, xmin, xmax)
    tl = _project_on_line(ymax, ymin, ymax)
    plot_width = math.hypot(br[0] - origin[0], br[1] - origin[1])
    plot_height = math.hypot(tl[0] - origin[0], tl[1] - origin[1])
    bl_out = apply_homography_to_point(perspective.matrix, origin)

    result = MeshWarpResult(
        width=perspective.width,
        height=perspective.height,
        plot_width=plot_width,
        plot_height=plot_height,
        plot_offset_x=bl_out[0],
        plot_offset_y=bl_out[1],
        homography=perspective.matrix,
    )
    return result, grid


def _plot_top_y(params: MeshWarpResult) -> float:
    return params.plot_offset_y - params.plot_height


def _in_plot_rect(x: float, y: float, params: MeshWarpResult) -> bool:
    top = _plot_top_y(params)
    return (
        params.plot_offset_x - 1 <= x <= params.plot_offset_x + params.plot_width + 1
        and top - 1 <= y <= params.plot_offset_y + 1
    )


def _cross2(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _source_in_plot_quad(source: Point, grid: list[list[Point]]) -> bool:
    bl, br, tr, tl = grid[3][0], grid[3][3], grid[0][3], grid[0][0]
    edges = ((bl, br), (br, tr), (tr, tl), (tl, bl))
    sign = 0
    for a, b in edges:
        c = _cross2(a, b, source)
        if abs(c) < 1e-6:
            continue
        s = 1 if c > 0 else -1
        if sign == 0:
            sign = s
        elif s != sign:
            return False
    return sign != 0


# How far beyond the plot's [0,1] UV range the mesh's local deformation still
# has influence before fully fading into plain homography, as a fraction of
# the plot's own width/height. Must match the frontend's MESH_BLEND_MARGIN_UV
# so the live preview and the final applied image agree pixel-for-pixel.
_MESH_BLEND_MARGIN_UV = 0.3


def _uv_overshoot(t: float) -> float:
    if t < 0:
        return -t
    if t > 1:
        return t - 1
    return 0.0


def _mesh_blend_factor(u: float, v: float) -> float:
    overshoot = max(_uv_overshoot(u), _uv_overshoot(v))
    if overshoot <= 0:
        return 0.0
    if overshoot >= _MESH_BLEND_MARGIN_UV:
        return 1.0
    t = overshoot / _MESH_BLEND_MARGIN_UV
    return t * t * (3 - 2 * t)


def _eval_mesh_uv_extrapolated(grid: list[list[Point]], u: float, v: float) -> Point:
    uf = u * 3
    vf = v * 3
    ci = max(0, min(2, int(math.floor(vf))))
    cj = max(0, min(2, int(math.floor(uf))))
    s = uf - cj
    t = vf - ci
    return _eval_cell(grid, ci, cj, s, t)


def map_dest_to_source(dest: Point, params: MeshWarpResult, grid: list[list[Point]]) -> Point:
    dx, dy = dest
    u = (dx - params.plot_offset_x) / params.plot_width
    v = (dy - _plot_top_y(params)) / params.plot_height
    t = _mesh_blend_factor(u, v)
    if t >= 1:
        return apply_homography_to_point(params.homography, dest, inverse=True)
    mesh_source = _eval_mesh_uv_extrapolated(grid, u, v)
    if t <= 0:
        return mesh_source
    homog_source = apply_homography_to_point(params.homography, dest, inverse=True)
    return (
        mesh_source[0] + (homog_source[0] - mesh_source[0]) * t,
        mesh_source[1] + (homog_source[1] - mesh_source[1]) * t,
    )


def _source_to_dest_roundtrip_error(
    source: Point, dest: Point, params: MeshWarpResult, grid: list[list[Point]]
) -> float:
    back = map_dest_to_source(dest, params, grid)
    return math.hypot(source[0] - back[0], source[1] - back[1])


def _newton_invert_dest_to_source(
    source: Point, params: MeshWarpResult, grid: list[list[Point]], guess: Point
) -> Point:
    dx, dy = guess
    eps = 0.5
    for _ in range(25):
        back = map_dest_to_source((dx, dy), params, grid)
        err = (source[0] - back[0], source[1] - back[1])
        if math.hypot(err[0], err[1]) < 0.5:
            return dx, dy
        bx = map_dest_to_source((dx + eps, dy), params, grid)
        by = map_dest_to_source((dx, dy + eps), params, grid)
        j00 = (bx[0] - back[0]) / eps
        j01 = (by[0] - back[0]) / eps
        j10 = (bx[1] - back[1]) / eps
        j11 = (by[1] - back[1]) / eps
        det = j00 * j11 - j01 * j10
        if abs(det) < 1e-12:
            break
        dx += (err[0] * j11 - err[1] * j01) / det
        dy += (-err[0] * j10 + err[1] * j00) / det
    return dx, dy


def _invert_dest_to_source_numerically(
    source: Point, params: MeshWarpResult, grid: list[list[Point]]
) -> Point:
    homog_guess = apply_homography_to_point(params.homography, source)
    top = _plot_top_y(params)
    seeds: tuple[Point, ...] = (
        homog_guess,
        (params.plot_offset_x, params.plot_offset_y),
        (params.plot_offset_x + params.plot_width, params.plot_offset_y),
        (params.plot_offset_x, top),
        (params.plot_offset_x + params.plot_width, top),
    )
    best = homog_guess
    best_err = _source_to_dest_roundtrip_error(source, homog_guess, params, grid)
    for seed in seeds:
        candidate = _newton_invert_dest_to_source(source, params, grid, seed)
        err = _source_to_dest_roundtrip_error(source, candidate, params, grid)
        if err < best_err:
            best_err = err
            best = candidate
    return best


def map_source_to_dest(source: Point, params: MeshWarpResult, grid: list[list[Point]]) -> Point:
    return _invert_dest_to_source_numerically(source, params, grid)


def warp_image_mesh(image: np.ndarray, params: MeshWarpResult, grid: list[list[Point]]) -> np.ndarray:
    out = warp_image(image, params.homography, params.width, params.height)
    top = _plot_top_y(params)
    left = params.plot_offset_x
    right = left + params.plot_width
    bottom = params.plot_offset_y

    # Expand the patched region beyond the plot rect to cover the blend
    # margin — that's the zone where mesh deformation still partially
    # influences pixels before fully fading into the homography, which
    # `warp_image` already rendered as the base layer above.
    margin_x = params.plot_width * _MESH_BLEND_MARGIN_UV
    margin_y = params.plot_height * _MESH_BLEND_MARGIN_UV

    out_h, out_w = out.shape[:2]
    x0 = max(0, int(math.floor(left - margin_x)))
    y0 = max(0, int(math.floor(top - margin_y)))
    x1 = min(out_w, int(math.ceil(right + margin_x)))
    y1 = min(out_h, int(math.ceil(bottom + margin_y)))
    if x1 <= x0 or y1 <= y0:
        return out

    roi_w = x1 - x0
    roi_h = y1 - y0
    map_x = np.zeros((roi_h, roi_w), dtype=np.float32)
    map_y = np.zeros((roi_h, roi_w), dtype=np.float32)

    for dy in range(y0, y1):
        for dx in range(x0, x1):
            sx, sy = map_dest_to_source((dx, dy), params, grid)
            map_x[dy - y0, dx - x0] = sx
            map_y[dy - y0, dx - x0] = sy

    patch = cv2.remap(
        image,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
    )
    out[y0:y1, x0:x1] = patch
    return out


def remap_session_pixels_mesh(session: Session, params: MeshWarpResult, grid: list[list[Point]]) -> None:
    if session.calibration:
        for axis in (session.calibration.x, session.calibration.y):
            for ref in axis.ref_points:
                ref.pixel = map_source_to_dest(ref.pixel, params, grid)
    for curve in session.curves:
        for pt in curve.points:
            pt.pixel = map_source_to_dest(pt.pixel, params, grid)


def run_mesh_warp_apply(
    session: Session,
    image_bytes: bytes,
    mesh_vertices: list[MeshVertexPayload],
) -> tuple[Session, bytes]:
    if session.calibration is None:
        raise ValueError("Calibration required for mesh warp")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")

    img_h, img_w = img.shape[:2]
    base = init_mesh_from_calibration(session.calibration)
    mesh = mesh_from_payload(mesh_vertices, base)
    params, grid = compute_mesh_warp_params(mesh, session.calibration, img_w, img_h)

    warped = warp_image_mesh(img, params, grid)
    ok, buf = cv2.imencode(".png", warped)
    if not ok:
        raise ValueError("Failed to encode warped image")

    remap_session_pixels_mesh(session, params, grid)
    session.image_meta.width = int(round(params.width))
    session.image_meta.height = int(round(params.height))
    return session, buf.tobytes()
