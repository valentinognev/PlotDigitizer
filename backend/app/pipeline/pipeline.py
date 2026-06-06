from __future__ import annotations

import io
import math

from PIL import Image

from app.calibration.calibration import calibration_from_vlm, vlm_ticks_to_axis
from app.cv.erase import remove_curve_from_image
from app.cv.improve import improve_curve_from_hints
from app.store.temp_images import save_removal_snapshot
from app.cv.refine import refine_seed_points
from app.cv.resample import resample_curve, resample_path
from app.models.schemas import (
    Calibration,
    Curve,
    MergeOp,
    Point,
    Session,
    VLMResponse,
)
from app.pipeline.colors import rainbow_colors
from app.vlm.base import VLMProvider
from app.vlm.coords import adjust_vlm_coordinates


MAX_VLM_DIM = 1600


def prepare_vlm_image(image_bytes: bytes) -> tuple[bytes, float, int, int]:
    img = Image.open(io.BytesIO(image_bytes))
    width, height = img.size
    scale = 1.0
    longest = max(width, height)
    if longest > MAX_VLM_DIM:
        scale = MAX_VLM_DIM / longest
        new_size = (int(width * scale), int(height * scale))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), scale, width, height


def apply_rainbow_colors(curves: list[Curve]) -> list[Curve]:
    colors = rainbow_colors(len(curves))
    return [
        curve.model_copy(update={"color": color})
        for curve, color in zip(curves, colors, strict=True)
    ]


def vlm_to_curves(
    image_bytes: bytes,
    vlm: VLMResponse,
    *,
    reserved_colors: set[str] | None = None,
) -> list[Curve]:
    colors = rainbow_colors(len(vlm.curves), reserved=reserved_colors)
    curves: list[Curve] = []
    for vc, color in zip(vlm.curves, colors, strict=True):
        points = refine_seed_points(image_bytes, vc.color_hex, vc.seed_points)
        curves.append(
            Curve(
                label=vc.label,
                color=color,
                trace_color=vc.color_hex,
                style=vc.style,
                points=points,
            )
        )
    return curves


def vlm_to_calibration(vlm: VLMResponse) -> Calibration:
    x_axis = vlm_ticks_to_axis(vlm.axes.x.ticks, vlm.axes.x.scale)
    y_axis = vlm_ticks_to_axis(vlm.axes.y.ticks, vlm.axes.y.scale)
    return calibration_from_vlm(x_axis, y_axis)


def merge(
    session: Session,
    vlm: VLMResponse,
    op: MergeOp,
    *,
    target_curve_id: str | None = None,
    protect_user: bool = True,
) -> Session:
    incoming = _build_incoming_curves(session, vlm)

    if op == "detect":
        session.curves = apply_rainbow_colors(incoming)
        if vlm.axes.x.ticks and vlm.axes.y.ticks:
            session.calibration = vlm_to_calibration(vlm)
        return session

    if op == "redetect_curve" and target_curve_id:
        session.curves = _replace_curve(
            session.curves, target_curve_id, incoming, protect_user=False
        )
        return session

    if op == "refine":
        if target_curve_id and incoming:
            session.curves = _replace_curve(
                session.curves, target_curve_id, incoming, protect_user=protect_user
            )
        else:
            session.curves = _merge_append(session.curves, incoming, protect_user)
        return session

    session.curves = _merge_append(session.curves, incoming, protect_user)
    return session


def _build_incoming_curves(session: Session, vlm: VLMResponse) -> list[Curve]:
    from app.store.session_store import session_store

    stored = session_store.get(session.id)
    image_bytes = stored.image_bytes if stored else b""
    reserved = {c.color for c in session.curves}
    return vlm_to_curves(image_bytes, vlm, reserved_colors=reserved or None)


def _merge_append(
    existing: list[Curve], incoming: list[Curve], protect_user: bool
) -> list[Curve]:
    if not protect_user:
        return existing + incoming
    result = list(existing)
    existing_labels = {c.label.lower() for c in existing}
    for curve in incoming:
        if curve.label.lower() in existing_labels:
            for i, ex in enumerate(result):
                if ex.label.lower() == curve.label.lower():
                    result[i] = _merge_curve_points(ex, curve, protect_user=True)
                    break
        else:
            result.append(curve)
    return result


def _replace_curve(
    existing: list[Curve],
    curve_id: str,
    incoming: list[Curve],
    *,
    protect_user: bool,
) -> list[Curve]:
    replacement = incoming[0] if incoming else None
    result: list[Curve] = []
    for curve in existing:
        if curve.id != curve_id:
            result.append(curve)
            continue
        if replacement is None:
            continue
        merged = Curve(
            id=curve.id,
            label=replacement.label or curve.label,
            color=curve.color,
            trace_color=replacement.trace_color or replacement.color or curve.trace_color,
            style=replacement.style,
            visible=curve.visible,
            points=replacement.points,
        )
        if protect_user:
            merged = _merge_curve_points(curve, merged, protect_user=True)
        result.append(merged)
    if replacement is None and not any(c.id == curve_id for c in existing):
        result.extend(incoming)
    return result


def _merge_curve_points(existing: Curve, incoming: Curve, *, protect_user: bool) -> Curve:
    if not protect_user:
        return incoming
    user_points = [p for p in existing.points if p.origin == "user"]
    ai_points = [p for p in incoming.points if p.origin == "ai"]
    return existing.model_copy(update={"points": user_points + ai_points})


def _replace_curve_points(
    curves: list[Curve], curve_id: str, points: list[Point]
) -> list[Curve]:
    return [
        curve.model_copy(update={"points": points})
        if curve.id == curve_id
        else curve
        for curve in curves
    ]


def _require_curve(session: Session, curve_id: str) -> Curve:
    curve = next((c for c in session.curves if c.id == curve_id), None)
    if curve is None:
        raise ValueError(f"Curve {curve_id} not found")
    return curve


def run_detect(provider: VLMProvider, session: Session, image_bytes: bytes) -> Session:
    vlm_img, scale, w, h = prepare_vlm_image(image_bytes)
    vlm_w, vlm_h = int(w * scale), int(h * scale)
    vlm_resp = provider.detect(
        vlm_img, scale_factor=scale, image_width=vlm_w, image_height=vlm_h
    )
    vlm_resp = adjust_vlm_coordinates(vlm_resp, w, h, scale)
    session.image_meta.scale_factor = scale
    return merge(session, vlm_resp, "detect", protect_user=False)


def run_refine(
    provider: VLMProvider,
    session: Session,
    image_bytes: bytes,
    *,
    region=None,
    instruction: str | None = None,
    curve_id: str | None = None,
    redetect_curve: bool = False,
) -> Session:
    vlm_img, scale, w, h = prepare_vlm_image(image_bytes)
    vlm_w, vlm_h = int(w * scale), int(h * scale)
    vlm_resp = provider.refine(
        vlm_img,
        region=region,
        instruction=instruction,
        existing=session.curves,
        scale_factor=scale,
        image_width=vlm_w,
        image_height=vlm_h,
    )
    vlm_resp = adjust_vlm_coordinates(vlm_resp, w, h, scale)
    op: MergeOp = "redetect_curve" if redetect_curve else "refine"
    return merge(
        session,
        vlm_resp,
        op,
        target_curve_id=curve_id,
        protect_user=not redetect_curve,
    )


def _max_hint_deviation(
    hints: list[tuple[float, float]],
    path: list[tuple[float, float]],
) -> float | None:
    if not hints or not path:
        return None
    worst = 0.0
    for hx, hy in hints:
        nearest = min(math.hypot(px - hx, py - hy) for px, py in path)
        worst = max(worst, nearest)
    return worst


def _distance_to_polyline(
    px: float,
    py: float,
    polyline: list[tuple[float, float]],
) -> float:
    if not polyline:
        return float("inf")
    if len(polyline) == 1:
        hx, hy = polyline[0]
        return math.hypot(px - hx, py - hy)
    best = float("inf")
    for i in range(len(polyline) - 1):
        x0, y0 = polyline[i]
        x1, y1 = polyline[i + 1]
        dx, dy = x1 - x0, y1 - y0
        len2 = dx * dx + dy * dy
        if len2 < 1e-9:
            best = min(best, math.hypot(px - x0, py - y0))
            continue
        t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / len2))
        proj_x = x0 + t * dx
        proj_y = y0 + t * dy
        best = min(best, math.hypot(px - proj_x, py - proj_y))
    return best


def _build_ai_erase_points(
    hint_points: list[tuple[float, float]],
    vlm_path: list[tuple[float, float]],
    *,
    dense_count: int,
    max_deviation_px: float = 20.0,
    merge_dist_px: float = 25.0,
) -> tuple[list[tuple[float, float]], str]:
    """Prefer user hints; only merge VLM points that lie near the hint polyline."""
    user_dense = [p.pixel for p in resample_path(hint_points, dense_count)]
    deviation = _max_hint_deviation(hint_points, vlm_path)
    if deviation is None or deviation > max_deviation_px:
        return user_dense, "user_hints_fallback"

    near_vlm = [
        (px, py)
        for px, py in vlm_path
        if _distance_to_polyline(px, py, hint_points) <= merge_dist_px
    ]
    if not near_vlm:
        return user_dense, "user_hints_only"

    merged = list(hint_points)
    for pt in near_vlm:
        if all(math.hypot(pt[0] - m[0], pt[1] - m[1]) > 2.0 for m in merged):
            merged.append(pt)
    if len(merged) == len(hint_points):
        return user_dense, "user_hints_only"

    return [p.pixel for p in resample_path(merged, dense_count)], "user_vlm_merged"


def _path_pixels_from_vlm_hints(
    provider: VLMProvider,
    image_bytes: bytes,
    curve: Curve,
    hint_points: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    vlm_img, scale, w, h = prepare_vlm_image(image_bytes)
    vlm_w, vlm_h = int(w * scale), int(h * scale)
    scaled_hints = [(x * scale, y * scale) for x, y in hint_points]

    vlm_resp = provider.refine(
        vlm_img,
        hint_curve=curve,
        hint_points=scaled_hints,
        scale_factor=scale,
        image_width=vlm_w,
        image_height=vlm_h,
    )
    vlm_resp = adjust_vlm_coordinates(vlm_resp, w, h, scale)
    if vlm_resp.curves:
        vlm_resp.curves[0].label = curve.label
        vlm_resp.curves[0].color_hex = curve.trace_color or curve.color
        vlm_resp.curves[0].style = curve.style

    incoming = vlm_to_curves(image_bytes, vlm_resp, reserved_colors={curve.color})
    if not incoming:
        raise ValueError("Model returned no curve path")

    path_pixels = [p.pixel for p in incoming[0].points]
    if len(path_pixels) < 2:
        return hint_points
    return path_pixels


def run_improve_from_hints(
    provider: VLMProvider,
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> Session:
    curve = _require_curve(session, curve_id)
    if len(curve.points) < 2:
        raise ValueError("At least 2 tuned points are required to improve a curve")

    hint_points = [p.pixel for p in curve.points]
    path_pixels = _path_pixels_from_vlm_hints(provider, image_bytes, curve, hint_points)
    new_points = resample_path(path_pixels, curve.target_point_count)
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
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


def run_ai_remove_curve_from_plot(
    provider: VLMProvider,
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> tuple[Session, bytes]:
    curve = _require_curve(session, curve_id)
    if len(curve.points) < 2:
        raise ValueError("At least 2 points are required to remove a curve from the plot")

    hint_points = [p.pixel for p in curve.points]
    path_pixels = _path_pixels_from_vlm_hints(provider, image_bytes, curve, hint_points)
    dense_count = max(len(hint_points) * 2, len(path_pixels) * 2, 24)
    erase_points, _ = _build_ai_erase_points(
        hint_points,
        path_pixels,
        dense_count=dense_count,
    )
    new_image = remove_curve_from_image(image_bytes, erase_points, curve.cv_color)
    save_removal_snapshot(session.id, curve_id, new_image)
    return session, new_image


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
