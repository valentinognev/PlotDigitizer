from __future__ import annotations

import cv2
import numpy as np

from app.calibration.coords import validate_calibration
from app.cv.averaging_window import averaging_window
from app.cv.color_filter import (
    _bgr_to_hex,
    _clip_pixel,
    build_filter_mask,
    dominant_trace_colors,
)
from app.cv.erase import remove_curve_from_image
from app.cv.grid_removal import GridGeometry, detect_grid, remove_grid
from app.cv.improve import improve_curve_from_hints
from app.cv.order import order_points_along_curve
from app.cv.point_match import MatchCandidate, match_points
from app.cv.region import rasterize_region
from app.cv.resample import resample_curve
from app.cv.segments import build_segments, fill_segment, segment_at
from app.cv.unskew import (
    bounds_pixels_from_calibration,
    compute_unskew_homography,
    remap_session_pixels,
    warp_image,
)
from app.cv.x_step import sample_by_x_step
from app.models.schemas import ColorFilter, Curve, GridGeometrySettings, Point, Session, UnskewApplyRequest
from app.store.temp_images import save_removal_snapshot


def _require_curve(session: Session, curve_id: str) -> Curve:
    curve = next((c for c in session.curves if c.id == curve_id), None)
    if curve is None:
        raise ValueError(f"Curve {curve_id} not found")
    return curve


def _replace_curve_points(
    curves: list[Curve], curve_id: str, points: list[Point]
) -> list[Curve]:
    return [
        curve.model_copy(update={"points": points})
        if curve.id == curve_id
        else curve
        for curve in curves
    ]


def _extracted_points(
    curve: Curve,
    pixels: list[tuple[float, float]],
    replace: bool,
) -> list[Point]:
    combined = list(pixels) if replace else [p.pixel for p in curve.points] + list(pixels)
    ordered = order_points_along_curve(combined)
    return [Point(pixel=pt, origin="user") for pt in ordered]


def run_cv_improve(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> Session:
    curve = _require_curve(session, curve_id)
    if curve.connect_as == "scatter":
        raise ValueError("Improve is not applicable to scatter curves")
    if len(curve.points) < 2:
        raise ValueError("At least 2 tuned points are required to improve a curve")

    hint_points = [p.pixel for p in curve.points]
    shared_mask = build_curve_mask(session, image_bytes, curve_id)
    new_points = improve_curve_from_hints(
        image_bytes,
        curve.cv_color,
        hint_points,
        curve.target_point_count,
        mask=shared_mask,
    )
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session


def run_resample(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    target_count: int,
) -> Session:
    curve = _require_curve(session, curve_id)
    if curve.connect_as == "scatter":
        raise ValueError("Densify is not applicable to scatter curves")
    curves: list[Curve] = []
    for curve in session.curves:
        if curve.id != curve_id:
            curves.append(curve)
            continue
        existing_pixels = [p.pixel for p in curve.points]
        new_points = resample_curve(
            image_bytes, curve.cv_color, target_count, existing_pixels
        )
        user_pts = [p for p in curve.points if p.origin == "user"]
        merged_pts = user_pts + [p for p in new_points if p.origin == "ai"]
        curves.append(curve.model_copy(update={"points": merged_pts}))
    session.curves = curves
    return session


def run_remove_curve_from_plot(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> tuple[Session, bytes]:
    curve = _require_curve(session, curve_id)
    if len(curve.points) < 2:
        raise ValueError("At least 2 points are required to remove a curve from the plot")

    hint_points = [p.pixel for p in curve.points]
    new_image = remove_curve_from_image(image_bytes, hint_points, curve.cv_color)
    save_removal_snapshot(session.id, curve_id, new_image)
    return session, new_image


def run_unskew_apply(
    session: Session,
    image_bytes: bytes,
    request: UnskewApplyRequest | None = None,
) -> tuple[Session, bytes]:
    req = request or UnskewApplyRequest()
    cal = req.calibration or session.calibration
    if cal is None:
        raise ValueError("Calibration required for unskew")
    session.calibration = cal

    if req.mode == "mesh":
        if req.mesh is None:
            raise ValueError("Mesh payload required for mesh mode")
        from app.cv.mesh_warp import run_mesh_warp_apply

        return run_mesh_warp_apply(
            session,
            image_bytes,
            req.mesh.vertices,
            req.mesh.sections,
            calibration=cal,
        )

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")

    img_h, img_w = img.shape[:2]
    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(cal)
    result = compute_unskew_homography(
        xmin,
        xmax,
        ymin,
        ymax,
        image_width=img_w,
        image_height=img_h,
    )

    warped = warp_image(img, result.matrix, result.width, result.height)
    ok, buf = cv2.imencode(".png", warped)
    if not ok:
        raise ValueError("Failed to encode warped image")

    remap_session_pixels(session, result.matrix)
    session.image_meta.width = int(round(result.width))
    session.image_meta.height = int(round(result.height))
    return session, buf.tobytes()


def _decode_bgr(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode plot image")
    return img


def _geometry_from_settings(settings: GridGeometrySettings) -> GridGeometry:
    return GridGeometry(
        start_x=settings.start_x,
        step_x=settings.step_x,
        count_x=settings.count_x,
        start_y=settings.start_y,
        step_y=settings.step_y,
        count_y=settings.count_y,
    )


def build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray:
    curve = _require_curve(session, curve_id)
    img = _decode_bgr(image_bytes)
    flt = curve.filter or ColorFilter()
    mask = build_filter_mask(img, flt)
    if curve.region is not None:
        height, width = mask.shape[:2]
        mask = cv2.bitwise_and(mask, rasterize_region(width, height, curve.region))
    if not flt.remove_grid:
        return mask
    geom = None
    close_distance = 10
    if session.workspace is not None and session.workspace.grid is not None:
        settings = session.workspace.grid
        close_distance = settings.close_distance
        if settings.count_x > 0 or settings.count_y > 0:
            geom = _geometry_from_settings(settings)
    if geom is None:
        geom = detect_grid(mask)
    if geom is None:
        return mask
    return remove_grid(mask, geom, close_distance=close_distance)


def list_curve_segments(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> list[dict]:
    _require_curve(session, curve_id)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []
    mask = build_curve_mask(session, image_bytes, curve_id)
    min_length = 2.0
    if session.workspace is not None:
        min_length = float(session.workspace.min_segment_length)
    segs = build_segments(mask, min_length=min_length)
    return [
        {"index": i, "length": seg.length, "points": seg.points}
        for i, seg in enumerate(segs)
    ]


def run_segment_fill(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    pixel: tuple[float, float],
    separation: float,
    fill_corners: bool,
) -> Session:
    curve = _require_curve(session, curve_id)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    mask = build_curve_mask(session, image_bytes, curve_id)
    min_length = 2.0
    if session.workspace is not None:
        min_length = float(session.workspace.min_segment_length)
    segs = build_segments(mask, min_length=min_length)
    hit = segment_at(segs, pixel, max_distance=12.0)
    if hit is None:
        raise ValueError("No segment within 12 px of the click")
    filled = fill_segment(
        hit, separation=separation, fill_corners=fill_corners, mask=mask
    )
    combined = [p.pixel for p in curve.points] + filled
    ordered = order_points_along_curve(combined)
    new_points = [Point(pixel=pt, origin="ai") for pt in ordered]
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session


def run_point_match(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    sample_center: tuple[float, float],
    sample_radius: int,
    max_point_size: int = 48,
    exclude: list[tuple[float, float]] | None = None,
    limit: int = 200,
) -> list[MatchCandidate]:
    curve = _require_curve(session, curve_id)
    mask = build_curve_mask(session, image_bytes, curve_id)
    blocked = list(exclude) if exclude is not None else [tuple(p.pixel) for p in curve.points]
    return match_points(
        mask,
        sample_center,
        sample_radius,
        max_point_size=max_point_size,
        exclude=blocked,
        limit=limit,
    )


def run_point_match_accept(
    session: Session,
    curve_id: str,
    pixels: list[tuple[float, float]],
) -> Session:
    curve = _require_curve(session, curve_id)
    new_points = list(curve.points)
    seen = {(round(p.pixel[0], 3), round(p.pixel[1], 3)) for p in curve.points}
    for xy in pixels:
        key = (round(float(xy[0]), 3), round(float(xy[1]), 3))
        if key in seen:
            continue
        new_points.append(Point(pixel=(float(xy[0]), float(xy[1])), origin="ai"))
        seen.add(key)
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session


def run_averaging_window(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    dx: float = 10.0,
    dy: float = 10.0,
    replace: bool = True,
) -> Session:
    curve = _require_curve(session, curve_id)
    mask = build_curve_mask(session, image_bytes, curve_id)
    pts = averaging_window(mask, dx, dy)
    session.curves = _replace_curve_points(
        session.curves, curve_id, _extracted_points(curve, pts, replace)
    )
    return session


def run_extract_by_color(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    pixel: tuple[float, float],
    distance: float | None = None,
    dx: float = 10.0,
    dy: float = 10.0,
    replace: bool = True,
) -> Session:
    _require_curve(session, curve_id)
    img = _decode_bgr(image_bytes)
    x, y = _clip_pixel(img, pixel)
    hex_color = _bgr_to_hex(img[y, x])
    flt = ColorFilter(mode="sample", high=distance or 0.12, sample_color=hex_color)
    session.curves = [
        c.model_copy(update={"filter": flt}) if c.id == curve_id else c
        for c in session.curves
    ]
    return run_averaging_window(
        session, image_bytes, curve_id, dx=dx, dy=dy, replace=replace
    )


def run_propose_curves(
    session: Session,
    image_bytes: bytes,
    limit: int = 8,
    extract: bool = False,
) -> Session:
    img = _decode_bgr(image_bytes)
    colors = dominant_trace_colors(img, limit=limit)
    kept = 0
    for hex_color in colors:
        flt = ColorFilter(mode="sample", high=0.12, sample_color=hex_color)
        curve = Curve(
            label=f"Colour {kept + 1}",
            color=hex_color,
            trace_color=hex_color,
            filter=flt,
        )
        session.curves = list(session.curves) + [curve]
        if extract:
            session = run_averaging_window(
                session, image_bytes, curve.id, dx=10.0, dy=10.0, replace=True
            )
            updated = _require_curve(session, curve.id)
            if len(updated.points) < 3:
                session.curves = [c for c in session.curves if c.id != curve.id]
                continue
        kept += 1
    return session


def run_x_step(
    session: Session,
    curve_id: str,
    xmin: float,
    xmax: float,
    delx: float,
    replace: bool = True,
) -> Session:
    curve = _require_curve(session, curve_id)
    if not curve.points:
        raise ValueError("no_points")
    if session.calibration is None:
        raise ValueError("no_calibration")
    validate_calibration(session.calibration)
    sampled = sample_by_x_step(
        [p.pixel for p in curve.points],
        session.calibration,
        xmin,
        xmax,
        delx,
    )
    session.curves = _replace_curve_points(
        session.curves, curve_id, _extracted_points(curve, sampled, replace)
    )
    return session
