from __future__ import annotations

import csv
import io
import json

from app.calibration.calibration import CalibrationError, pixel_to_data, validate_calibration
from app.models.schemas import Calibration, Curve, Session


def export_json(session: Session) -> str:
    if not session.calibration:
        raise CalibrationError("Calibration required for export")
    validate_calibration(session.calibration)
    payload = {
        "session_id": session.id,
        "calibration": session.calibration.model_dump(),
        "curves": [],
    }
    for curve in session.curves:
        if not curve.visible:
            continue
        data_points = [
            {"x": pixel_to_data(session.calibration, p.pixel)[0],
             "y": pixel_to_data(session.calibration, p.pixel)[1],
             "origin": p.origin}
            for p in curve.points
        ]
        payload["curves"].append(
            {
                "id": curve.id,
                "label": curve.label,
                "color": curve.color,
                "style": curve.style,
                "points": data_points,
            }
        )
    return json.dumps(payload, indent=2)


def export_csv(session: Session) -> str:
    if not session.calibration:
        raise CalibrationError("Calibration required for export")
    validate_calibration(session.calibration)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["curve_id", "curve_label", "x", "y", "origin"])
    for curve in session.curves:
        if not curve.visible:
            continue
        for p in curve.points:
            x, y = pixel_to_data(session.calibration, p.pixel)
            writer.writerow([curve.id, curve.label, x, y, p.origin])
    return buf.getvalue()
