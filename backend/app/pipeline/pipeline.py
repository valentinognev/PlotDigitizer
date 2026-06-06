from __future__ import annotations

import io

from PIL import Image

from app.calibration.calibration import calibration_from_vlm, vlm_ticks_to_axis
from app.cv.refine import refine_seed_points
from app.cv.resample import resample_curve
from app.models.schemas import (
    Calibration,
    Curve,
    MergeOp,
    Point,
    Session,
    VLMResponse,
)
from app.vlm.base import VLMProvider


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


def vlm_to_curves(image_bytes: bytes, vlm: VLMResponse) -> list[Curve]:
    curves: list[Curve] = []
    for vc in vlm.curves:
        points = refine_seed_points(image_bytes, vc.color_hex, vc.seed_points)
        curves.append(
            Curve(
                label=vc.label,
                color=vc.color_hex,
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
        session.curves = incoming
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
    return vlm_to_curves(image_bytes, vlm)


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
            color=replacement.color or curve.color,
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


def run_detect(provider: VLMProvider, session: Session, image_bytes: bytes) -> Session:
    vlm_img, scale, w, h = prepare_vlm_image(image_bytes)
    vlm_resp = provider.detect(vlm_img, scale_factor=scale)
    session.image_meta.scale_factor = scale
    session = merge(session, vlm_resp, "detect", protect_user=False)
    return session


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
    vlm_img, scale, _, _ = prepare_vlm_image(image_bytes)
    vlm_resp = provider.refine(
        vlm_img,
        region=region,
        instruction=instruction,
        existing=session.curves,
        scale_factor=scale,
    )
    op: MergeOp = "redetect_curve" if redetect_curve else "refine"
    return merge(
        session,
        vlm_resp,
        op,
        target_curve_id=curve_id,
        protect_user=not redetect_curve,
    )


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
            image_bytes, curve.color, target_count, existing_pixels
        )
        user_pts = [p for p in curve.points if p.origin == "user"]
        merged_pts = user_pts + [p for p in new_points if p.origin == "ai"]
        curves.append(curve.model_copy(update={"points": merged_pts}))
    session.curves = curves
    return session
