from __future__ import annotations

import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from PIL import Image

from app.calibration.calibration import CalibrationError, validate_calibration
from app.export.export import export_csv, export_json
from app.models.schemas import (
    ApiError,
    ApiErrorDetail,
    CalibrationUpdate,
    CurvesEditRequest,
    RefineRequest,
    ResampleRequest,
    Session,
    SessionPublic,
)
from app.pipeline.pipeline import run_detect, run_refine, run_resample
from app.store.session_store import session_store
from app.vlm.base import VLMError
from app.vlm.factory import get_provider

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _error(exc: Exception, code: str, hint: str = "") -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=ApiError(
            error=ApiErrorDetail(code=code, message=str(exc), hint=hint)
        ).model_dump(),
    )


def _to_public(stored) -> SessionPublic:
    s = stored.session
    return SessionPublic(
        id=s.id,
        image_meta=s.image_meta,
        calibration=s.calibration,
        curves=s.curves,
        history=s.history,
        image_url=f"/sessions/{s.id}/image",
    )


@router.post("", response_model=SessionPublic)
async def create_session(file: UploadFile = File(...)) -> SessionPublic:
    data = await file.read()
    if not data:
        raise _error(ValueError("Empty file"), "empty_image")
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        width, height = img.size
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
    except Exception as exc:
        raise _error(exc, "invalid_image") from exc

    session = Session(image_meta={"width": width, "height": height, "scale_factor": 1.0})
    stored = session_store.create(session, data)
    return _to_public(stored)


@router.get("/{session_id}", response_model=SessionPublic)
def get_session(session_id: str) -> SessionPublic:
    try:
        stored = session_store.require(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return _to_public(stored)


@router.get("/{session_id}/image")
def get_session_image(session_id: str) -> Response:
    try:
        stored = session_store.require(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return Response(content=stored.image_bytes, media_type="image/png")


@router.post("/{session_id}/detect", response_model=SessionPublic)
def detect(session_id: str) -> SessionPublic:
    stored = _require(session_id)
    try:
        provider = get_provider()
        session_store.push_history(stored, "detect")
        stored.session = run_detect(provider, stored.session, stored.image_bytes)
        session_store.update(session_id, stored.session)
    except VLMError as exc:
        raise _error(exc, exc.code, exc.hint) from exc
    return _to_public(stored)


@router.post("/{session_id}/calibration", response_model=SessionPublic)
def set_calibration(session_id: str, body: CalibrationUpdate) -> SessionPublic:
    stored = _require(session_id)
    try:
        validate_calibration(body.calibration)
    except CalibrationError as exc:
        raise _error(exc, "calibration_invalid", "Fix reference points") from exc
    session_store.push_history(stored, "calibration")
    stored.session.calibration = body.calibration
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.post("/{session_id}/refine", response_model=SessionPublic)
def refine(session_id: str, body: RefineRequest) -> SessionPublic:
    stored = _require(session_id)
    if not body.region and not body.instruction:
        raise _error(ValueError("region or instruction required"), "refine_input")
    try:
        provider = get_provider()
        session_store.push_history(stored, "refine")
        stored.session = run_refine(
            provider,
            stored.session,
            stored.image_bytes,
            region=body.region,
            instruction=body.instruction,
            curve_id=body.curve_id,
            redetect_curve=body.redetect_curve,
        )
        session_store.update(session_id, stored.session)
    except VLMError as exc:
        raise _error(exc, exc.code, exc.hint) from exc
    return _to_public(stored)


@router.post("/{session_id}/resample", response_model=SessionPublic)
def resample(session_id: str, body: ResampleRequest) -> SessionPublic:
    stored = _require(session_id)
    session_store.push_history(stored, "resample")
    stored.session = run_resample(
        stored.session,
        stored.image_bytes,
        body.curve_id,
        body.target_count,
    )
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.patch("/{session_id}/curves", response_model=SessionPublic)
def edit_curves(session_id: str, body: CurvesEditRequest) -> SessionPublic:
    stored = _require(session_id)
    session_store.push_history(stored, "edit_curves")

    if body.curves is not None:
        stored.session.curves = body.curves

    if body.add_point and body.add_to_curve_id:
        for curve in stored.session.curves:
            if curve.id == body.add_to_curve_id:
                from app.models.schemas import Point

                curve.points.append(Point(pixel=body.add_point, origin="user"))
                break

    if body.point_patches:
        for patch in body.point_patches:
            for curve in stored.session.curves:
                for i, pt in enumerate(curve.points):
                    if pt.id != patch.point_id:
                        continue
                    if patch.delete:
                        curve.points.pop(i)
                    elif patch.pixel:
                        pt.pixel = patch.pixel
                        pt.origin = patch.origin
                    if patch.curve_id and patch.curve_id != curve.id:
                        curve.points.pop(i)
                        target = next(
                            (c for c in stored.session.curves if c.id == patch.curve_id),
                            None,
                        )
                        if target:
                            target.points.append(pt)
                    break

    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.post("/{session_id}/undo", response_model=SessionPublic)
def undo(session_id: str) -> SessionPublic:
    stored = _require(session_id)
    result = session_store.undo(session_id)
    if result is None:
        raise _error(ValueError("Nothing to undo"), "undo_empty")
    stored.session = result
    return _to_public(stored)


@router.post("/{session_id}/redo", response_model=SessionPublic)
def redo(session_id: str) -> SessionPublic:
    stored = _require(session_id)
    result = session_store.redo(session_id)
    if result is None:
        raise _error(ValueError("Nothing to redo"), "redo_empty")
    stored.session = result
    return _to_public(stored)


@router.get("/{session_id}/export")
def export_session(session_id: str, format: str = "json"):
    stored = _require(session_id)
    try:
        if format == "csv":
            content = export_csv(stored.session)
            media = "text/csv"
            filename = "plot_digitizer.csv"
        else:
            content = export_json(stored.session)
            media = "application/json"
            filename = "plot_digitizer.json"
    except CalibrationError as exc:
        raise _error(exc, "export_blocked", "Set valid calibration first") from exc

    return StreamingResponse(
        iter([content]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _require(session_id: str):
    try:
        return session_store.require(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
