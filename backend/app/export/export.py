from __future__ import annotations

import csv
import io

from app.calibration.calibration import CalibrationError, validate_calibration
from app.calibration.coords import pixel_to_data
from app.export.project_io import export_project_json
from app.models.schemas import Calibration, Session

__all__ = ["export_csv", "export_json", "export_project_json", "csv_coordinate_columns", "csv_units_line"]


def csv_coordinate_columns(cal: Calibration) -> tuple[str, str]:
    if cal.coords_type == "polar":
        return ("theta", "R")
    return ("x", "y")


def csv_units_line(cal: Calibration) -> str | None:
    if cal.coords_type != "map":
        return None
    bar = cal.scale_bar
    if bar is None:
        return None
    units = (bar.units or "").strip()
    if not units:
        return None
    return f"# units: {units}"


def export_json(session: Session, *, image_bytes: bytes) -> str:
    return export_project_json(session, image_bytes=image_bytes)


def export_csv(session: Session) -> str:
    if not session.calibration:
        raise CalibrationError("Calibration required for export")
    validate_calibration(session.calibration)
    buf = io.StringIO()
    units = csv_units_line(session.calibration)
    if units:
        buf.write(units + "\n")
    writer = csv.writer(buf)
    xname, yname = csv_coordinate_columns(session.calibration)
    writer.writerow(["curve_id", "curve_label", xname, yname])
    for curve in session.curves:
        if not curve.visible:
            continue
        for p in curve.points:
            x, y = pixel_to_data(session.calibration, p.pixel)
            writer.writerow([curve.id, curve.label, x, y])
    return buf.getvalue()
