from __future__ import annotations

import csv
import io

from app.calibration.calibration import CalibrationError, validate_calibration
from app.calibration.coords import pixel_to_data
from app.calibration.dates import format_unix_days
from app.calibration.session_cal import calibration_for_curve
from app.export.project_io import export_project_json
from app.models.schemas import Calibration, Curve, Session

__all__ = ["export_csv", "export_json", "export_project_json", "csv_coordinate_columns", "csv_units_line"]


def csv_coordinate_columns(cal: Calibration) -> tuple[str, str]:
    if cal.coords_type == "polar":
        return ("theta", "R")
    if cal.coords_type == "bar":
        return ("label", "value")
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


def _csv_cell(value: float, scale: str) -> float | str:
    if scale != "date":
        return value
    if abs(value - round(value)) > 1e-6:
        return format_unix_days(value, "YYYY/MM/DD hh:mm:ss")
    return format_unix_days(value, "YYYY/MM/DD")


def export_json(session: Session, *, image_bytes: bytes) -> str:
    return export_project_json(session, image_bytes=image_bytes)


def _csv_figure_comment_lines(session: Session) -> list[str]:
    lines: list[str] = []
    title = session.figure.title.strip()
    if title:
        lines.append(f"# title: {title}")
    xlabel = session.figure.xlabel.strip()
    if xlabel:
        lines.append(f"# xlabel: {xlabel}")
    ylabel = session.figure.ylabel.strip()
    if ylabel:
        lines.append(f"# ylabel: {ylabel}")
    return lines


def export_csv(session: Session) -> str:
    if not session.calibration:
        raise CalibrationError("Calibration required for export")
    validate_calibration(session.calibration)
    used: list[tuple[Curve, Calibration]] = []
    for curve in session.curves:
        if not curve.visible:
            continue
        cal = calibration_for_curve(session, curve)
        if cal is None:
            continue
        validate_calibration(cal)
        used.append((curve, cal))
    col_set = {csv_coordinate_columns(cal) for _, cal in used}
    if len(col_set) > 1:
        raise CalibrationError(
            "Mixed coordinate types cannot share one CSV header",
            hint="Hide or export curves that share the same coordinate system",
        )
    header_cal = used[0][1] if used else session.calibration
    buf = io.StringIO()
    for line in _csv_figure_comment_lines(session):
        buf.write(line + "\n")
    units = None
    for _, cal in used:
        units = csv_units_line(cal)
        if units:
            break
    if not units:
        units = csv_units_line(session.calibration)
    if units:
        buf.write(units + "\n")
    writer = csv.writer(buf)
    xname, yname = csv_coordinate_columns(header_cal)
    writer.writerow(["curve_id", "curve_label", xname, yname])
    for curve, cal in used:
        for p in curve.points:
            x, y = pixel_to_data(cal, p.pixel)
            if cal.coords_type == "bar":
                writer.writerow(
                    [
                        curve.id,
                        curve.label,
                        p.label or "",
                        _csv_cell(x, cal.y.scale),
                    ]
                )
            else:
                writer.writerow(
                    [
                        curve.id,
                        curve.label,
                        _csv_cell(x, cal.x.scale),
                        _csv_cell(y, cal.y.scale),
                    ]
                )
    return buf.getvalue()
