from __future__ import annotations

import cv2
import numpy as np

from app.cv.erase import remove_curve_from_image
from app.cv.improve import improve_curve_from_hints
from app.cv.resample import resample_curve
from app.cv.unskew import (
    bounds_pixels_from_calibration,
    compute_unskew_homography,
    remap_session_pixels,
    warp_image,
)
from app.models.schemas import Curve, Point, Session
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


def run_cv_improve(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> Session:
    curve = _require_curve(session, curve_id)
    if len(curve.points) < 2:
        raise ValueError("At least 2 tuned points are required to improve a curve")

    hint_points = [p.pixel for p in curve.points]
    new_points = improve_curve_from_hints(
        image_bytes,
        curve.cv_color,
        hint_points,
        curve.target_point_count,
    )
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session


def run_resample(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    target_count: int,
) -> Session:
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


def run_unskew_apply(session: Session, image_bytes: bytes) -> tuple[Session, bytes]:
    if session.calibration is None:
        raise ValueError("Calibration required for unskew")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")

    img_h, img_w = img.shape[:2]
    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(session.calibration)
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
