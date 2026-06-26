from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.calibration.calibration import CalibrationError, pixel_to_data, validate_calibration
from app.models.schemas import (
    Calibration,
    Curve,
    ImageSource,
    Session,
    WorkspaceState,
)

PROJECT_KIND = "project"
PROJECT_FORMAT_VERSION = 1


class ProjectError(ValueError):
    pass


def is_project_payload(payload: dict[str, Any]) -> bool:
    meta = payload.get("plot_digitizer")
    return isinstance(meta, dict) and meta.get("kind") == PROJECT_KIND


def project_export_filename(session: Session) -> str:
    if session.image_source and session.image_source.filename:
        stem = Path(session.image_source.filename).stem
        return f"{stem}.pdproj.json"
    return "plot_digitizer.pdproj.json"


def _curve_export_entry(session: Session, curve: Curve) -> dict[str, Any]:
    entry = curve.model_dump()
    if session.calibration:
        try:
            validate_calibration(session.calibration)
            entry["points"] = [
                {
                    **p.model_dump(),
                    "data": list(pixel_to_data(session.calibration, p.pixel)),
                }
                for p in curve.points
            ]
        except CalibrationError:
            pass
    return entry


def export_project_json(session: Session, *, image_bytes: bytes) -> str:
    payload: dict[str, Any] = {
        "plot_digitizer": {
            "kind": PROJECT_KIND,
            "format_version": PROJECT_FORMAT_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
        },
        "session_id": session.id,
        "image_meta": session.image_meta.model_dump(),
        "image_source": (session.image_source or ImageSource()).model_dump(),
        "image": {
            "encoding": "base64",
            "mime_type": "image/png",
            "data": base64.b64encode(image_bytes).decode("ascii"),
        },
        "calibration": session.calibration.model_dump() if session.calibration else None,
        "manual_calibration": session.manual_calibration,
        "curves": [_curve_export_entry(session, curve) for curve in session.curves],
        "workspace": (session.workspace or WorkspaceState()).model_dump(),
    }
    return json.dumps(payload, indent=2)


def _decode_project_image(payload: dict[str, Any]) -> bytes:
    image = payload.get("image")
    if not isinstance(image, dict):
        raise ProjectError('Project file is missing an "image" section')
    if image.get("encoding") != "base64":
        raise ProjectError(f'Unsupported image encoding: {image.get("encoding")!r}')
    raw = image.get("data")
    if not isinstance(raw, str) or not raw:
        raise ProjectError("Project image data is empty")
    try:
        return base64.b64decode(raw, validate=True)
    except (ValueError, TypeError) as exc:
        raise ProjectError("Project image data is not valid base64") from exc


def _curves_from_project(payload: dict[str, Any]) -> list[Curve]:
    raw_curves = payload.get("curves")
    if not isinstance(raw_curves, list):
        raise ProjectError('Project file must contain a "curves" array')
    curves: list[Curve] = []
    for item in raw_curves:
        if not isinstance(item, dict):
            continue
        points = item.get("points", [])
        if isinstance(points, list):
            cleaned_points = []
            for pt in points:
                if not isinstance(pt, dict):
                    continue
                if "pixel" in pt:
                    cleaned_points.append({k: v for k, v in pt.items() if k != "data"})
                elif "x" in pt and "y" in pt:
                    cleaned_points.append(pt)
            item = {**item, "points": cleaned_points}
        curves.append(Curve(**item))
    return curves


def load_project_from_text(text: str) -> tuple[Session, bytes]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProjectError("Invalid JSON file") from exc
    if not isinstance(payload, dict):
        raise ProjectError("JSON root must be an object")
    if not is_project_payload(payload):
        raise ProjectError("Not a Plot Digitizer project file")

    version = payload.get("plot_digitizer", {}).get("format_version")
    if version is not None and version != PROJECT_FORMAT_VERSION:
        raise ProjectError(f"Unsupported project format version: {version}")

    image_bytes = _decode_project_image(payload)
    image_meta = payload.get("image_meta")
    if not isinstance(image_meta, dict):
        raise ProjectError('Project file is missing "image_meta"')

    image_source_raw = payload.get("image_source")
    image_source = (
        ImageSource(**image_source_raw) if isinstance(image_source_raw, dict) else ImageSource()
    )

    cal_raw = payload.get("calibration")
    calibration = Calibration(**cal_raw) if isinstance(cal_raw, dict) else None

    workspace_raw = payload.get("workspace")
    workspace = (
        WorkspaceState(**workspace_raw) if isinstance(workspace_raw, dict) else WorkspaceState()
    )

    session = Session(
        image_meta=image_meta,
        image_source=image_source,
        calibration=calibration,
        manual_calibration=bool(payload.get("manual_calibration", False)),
        curves=_curves_from_project(payload),
        workspace=workspace,
        history=[],
    )
    return session, image_bytes


def load_project_from_bytes(data: bytes) -> tuple[Session, bytes]:
    return load_project_from_text(data.decode("utf-8-sig"))
