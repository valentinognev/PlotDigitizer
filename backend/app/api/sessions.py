from __future__ import annotations

import io

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from PIL import Image

from app.calibration.calibration import CalibrationError, validate_calibration
from app.cv.color_filter import build_filter_mask, suggest_filter_from_pixel
from app.cv.grid_removal import GridGeometry, detect_grid
from app.cv.snap import snap_to_ink
from app.cv.unskew import UnskewError
from app.export.export import export_csv, export_json
from app.export.import_curves import ImportError as CurveImportError
from app.export.import_curves import import_curves_replace_session
from app.export.project_io import ProjectError, load_project_from_bytes, project_export_filename
from app.models.schemas import (
    ApiError,
    ApiErrorDetail,
    CalibrationUpdate,
    ColorFilter,
    CurvesEditRequest,
    FilterSuggestRequest,
    GridDetectRequest,
    GridGeometrySettings,
    ImageSource,
    ResampleRequest,
    Session,
    SessionPreferencesPatch,
    SessionPublic,
    SnapRequest,
    SnapResponse,
    UnskewApplyRequest,
    WorkspaceState,
)
from app.pipeline.pipeline import (
    build_curve_mask,
    run_cv_improve,
    run_remove_curve_from_plot,
    run_resample,
    run_unskew_apply,
)
from app.store.session_store import session_store

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
        image_source=s.image_source,
        calibration=s.calibration,
        manual_calibration=s.manual_calibration,
        curves=s.curves,
        workspace=s.workspace,
        history=s.history,
        image_url=f"/sessions/{s.id}/image?v={s.image_meta.revision}",
    )


def _decode_session_bgr(image_bytes: bytes):
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode plot image")
    return img


def _active_curve_id(session: Session, curve_id: str | None) -> str:
    if curve_id:
        return curve_id
    if session.workspace and session.workspace.active_curve_id:
        return session.workspace.active_curve_id
    if session.curves:
        return session.curves[0].id
    raise ValueError("No curve available")


def _settings_from_geom(geom: GridGeometry, close_distance: int = 10) -> GridGeometrySettings:
    return GridGeometrySettings(
        start_x=geom.start_x,
        step_x=geom.step_x,
        count_x=geom.count_x,
        start_y=geom.start_y,
        step_y=geom.step_y,
        count_y=geom.count_y,
        close_distance=close_distance,
    )


@router.get("/last", response_model=SessionPublic)
def get_last_session() -> SessionPublic:
    stored = session_store.get_last()
    if stored is None:
        raise HTTPException(status_code=404, detail="No saved session")
    return _to_public(stored)


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

    session = Session(
        image_meta={"width": width, "height": height, "scale_factor": 1.0},
        image_source=ImageSource(filename=file.filename),
    )
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


@router.get("/{session_id}/image/original")
def get_session_original_image(session_id: str) -> Response:
    try:
        stored = session_store.require(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return Response(content=stored.original_image_bytes, media_type="image/png")


@router.post("/{session_id}/calibration", response_model=SessionPublic)
def set_calibration(session_id: str, body: CalibrationUpdate) -> SessionPublic:
    stored = _require(session_id)
    try:
        validate_calibration(body.calibration)
    except CalibrationError as exc:
        raise _error(exc, "calibration_invalid", exc.hint or "Fix reference points") from exc
    session_store.push_history(stored, "calibration")
    stored.session.calibration = body.calibration
    stored.session.manual_calibration = True
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.patch("/{session_id}/preferences", response_model=SessionPublic)
def patch_preferences(session_id: str, body: SessionPreferencesPatch) -> SessionPublic:
    stored = _require(session_id)
    if body.calibration is not None:
        stored.session.calibration = body.calibration
        stored.session.manual_calibration = True
    if body.manual_calibration is not None:
        stored.session.manual_calibration = body.manual_calibration
    if body.workspace is not None:
        current = stored.session.workspace
        merged = body.workspace.model_dump(exclude_unset=True)
        if current is not None:
            stored.session.workspace = current.model_copy(update=merged)
        else:
            stored.session.workspace = body.workspace
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.post("/load-project", response_model=SessionPublic)
async def load_project(file: UploadFile = File(...)) -> SessionPublic:
    data = await file.read()
    if not data:
        raise _error(ValueError("Empty file"), "empty_file")
    try:
        session, image_bytes = load_project_from_bytes(data)
    except ProjectError as exc:
        raise _error(exc, "project_invalid", str(exc)) from exc
    stored = session_store.create(session, image_bytes)
    return _to_public(stored)


@router.post("/{session_id}/curves/{curve_id}/cv-improve", response_model=SessionPublic)
def cv_improve_curve(session_id: str, curve_id: str) -> SessionPublic:
    stored = _require(session_id)
    try:
        session_store.push_history(stored, "cv_improve")
        stored.session = run_cv_improve(stored.session, stored.image_bytes, curve_id)
        session_store.update(session_id, stored.session)
    except ValueError as exc:
        raise _error(exc, "improve_input", str(exc)) from exc
    return _to_public(stored)


@router.post("/{session_id}/curves/{curve_id}/remove-from-plot", response_model=SessionPublic)
def remove_curve_from_plot(session_id: str, curve_id: str) -> SessionPublic:
    stored = _require(session_id)
    try:
        session_store.push_history(stored, "remove_from_plot")
        _, new_image = run_remove_curve_from_plot(
            stored.session,
            stored.image_bytes,
            curve_id,
        )
        session_store.update_working_image(session_id, new_image)
    except ValueError as exc:
        raise _error(exc, "remove_from_plot", str(exc)) from exc
    stored = session_store.require(session_id)
    return _to_public(stored)


@router.post("/{session_id}/unskew/apply", response_model=SessionPublic)
def apply_unskew(session_id: str, body: UnskewApplyRequest | None = None) -> SessionPublic:
    stored = _require(session_id)
    if stored.session.calibration is None:
        raise _error(ValueError("Set calibration bounds first"), "unskew_no_calibration")
    req = body or UnskewApplyRequest()
    if req.mode == "mesh" and req.mesh is None:
        raise _error(ValueError("Mesh data required"), "unskew_input", "Provide mesh vertices")
    try:
        session_store.push_history(stored, "unskew_apply")
        new_session, new_image = run_unskew_apply(stored.session, stored.image_bytes, req)
        stored.session = new_session
        session_store.update_working_image(session_id, new_image)
        session_store.update(session_id, stored.session)
    except UnskewError as exc:
        raise _error(exc, "unskew_invalid", "Adjust axis bounds") from exc
    except ValueError as exc:
        raise _error(exc, "unskew_input", str(exc)) from exc
    stored = session_store.require(session_id)
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


@router.post("/{session_id}/filter/suggest", response_model=ColorFilter)
def suggest_filter(session_id: str, body: FilterSuggestRequest) -> ColorFilter:
    stored = _require(session_id)
    try:
        img = _decode_session_bgr(stored.image_bytes)
    except ValueError as exc:
        raise _error(exc, "invalid_image") from exc
    return suggest_filter_from_pixel(img, body.pixel)


@router.patch("/{session_id}/curves/{curve_id}/filter", response_model=SessionPublic)
def patch_curve_filter(session_id: str, curve_id: str, body: ColorFilter) -> SessionPublic:
    stored = _require(session_id)
    curve = next((c for c in stored.session.curves if c.id == curve_id), None)
    if curve is None:
        raise _error(ValueError(f"Curve {curve_id} not found"), "curve_not_found")
    session_store.push_history(stored, "curve_filter")
    curve.filter = body
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.get("/{session_id}/mask")
def get_curve_mask(
    session_id: str,
    curve_id: str | None = Query(default=None),
    rev: int | None = Query(default=None),
) -> Response:
    stored = _require(session_id)
    try:
        cid = _active_curve_id(stored.session, curve_id)
        mask = build_curve_mask(stored.session, stored.image_bytes, cid)
    except ValueError as exc:
        raise _error(exc, "mask_input", str(exc)) from exc
    ok, buf = cv2.imencode(".png", mask)
    if not ok:
        raise _error(ValueError("Failed to encode mask"), "mask_encode")
    headers = {"Cache-Control": "no-store"}
    if rev is not None:
        headers["X-Mask-Rev"] = str(rev)
    return Response(content=buf.tobytes(), media_type="image/png", headers=headers)


@router.post("/{session_id}/grid/detect", response_model=GridGeometrySettings | None)
def detect_session_grid(
    session_id: str, body: GridDetectRequest | None = None
) -> GridGeometrySettings | None:
    stored = _require(session_id)
    req = body or GridDetectRequest()
    try:
        cid = _active_curve_id(stored.session, req.curve_id)
        curve = next((c for c in stored.session.curves if c.id == cid), None)
        if curve is None:
            raise ValueError(f"Curve {cid} not found")
        img = _decode_session_bgr(stored.image_bytes)
        mask = build_filter_mask(img, curve.filter or ColorFilter())
    except ValueError as exc:
        raise _error(exc, "grid_detect_input", str(exc)) from exc
    geom = detect_grid(mask)
    session_store.push_history(stored, "grid_detect")
    current = stored.session.workspace or WorkspaceState()
    stored.session.workspace = current.model_copy(
        update={"grid": None if geom is None else _settings_from_geom(geom)}
    )
    session_store.update(session_id, stored.session)
    if geom is None:
        return None
    return stored.session.workspace.grid


@router.post("/{session_id}/snap", response_model=SnapResponse)
def snap_session_pixels(session_id: str, body: SnapRequest) -> SnapResponse:
    stored = _require(session_id)
    try:
        mask = build_curve_mask(stored.session, stored.image_bytes, body.curve_id)
    except ValueError as exc:
        raise _error(exc, "snap_input", str(exc)) from exc
    snapped = [
        snap_to_ink(mask, tuple(p), window=body.window, direction=body.direction)
        for p in body.pixels
    ]
    return SnapResponse(pixels=snapped)


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


@router.post("/{session_id}/import-curves", response_model=SessionPublic)
async def import_curves(session_id: str, file: UploadFile = File(...)) -> SessionPublic:
    stored = _require(session_id)
    data = await file.read()
    if not data:
        raise _error(ValueError("Empty file"), "empty_file")
    try:
        session_store.push_history(stored, "import_curves")
        stored.session = import_curves_replace_session(
            stored.session,
            data,
            filename=file.filename,
        )
        session_store.update(session_id, stored.session)
    except CalibrationError as exc:
        raise _error(exc, "import_blocked", "Set valid calibration first") from exc
    except CurveImportError as exc:
        raise _error(exc, "import_invalid", str(exc)) from exc
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
            content = export_json(stored.session, image_bytes=stored.image_bytes)
            media = "application/json"
            filename = project_export_filename(stored.session)
    except CalibrationError as exc:
        raise _error(exc, "export_blocked", "Set valid calibration first") from exc

    return StreamingResponse(
        iter([content]),
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _require(session_id: str):
    try:
        return session_store.require(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
