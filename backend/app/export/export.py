from __future__ import annotations

import csv
import io

from app.calibration.calibration import CalibrationError, pixel_to_data, validate_calibration
from app.export.project_io import export_project_json
from app.models.schemas import Session

__all__ = ["export_csv", "export_json", "export_project_json"]


def export_json(session: Session, *, image_bytes: bytes) -> str:
    return export_project_json(session, image_bytes=image_bytes)


def export_csv(session: Session) -> str:
    if not session.calibration:
        raise CalibrationError("Calibration required for export")
    validate_calibration(session.calibration)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["curve_id", "curve_label", "x", "y"])
    for curve in session.curves:
        if not curve.visible:
            continue
        for p in curve.points:
            x, y = pixel_to_data(session.calibration, p.pixel)
            writer.writerow([curve.id, curve.label, x, y])
    return buf.getvalue()
