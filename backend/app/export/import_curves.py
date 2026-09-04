from __future__ import annotations

import csv
import io
import json
import math
from typing import Any

from app.calibration.calibration import CalibrationError, data_to_pixel, validate_calibration
from app.export.project_io import is_project_payload
from app.cv.order import order_points_along_curve
from app.models.schemas import DEFAULT_POINT_COUNT, Calibration, Curve, CurveStyle, Origin, Point, Session
from app.pipeline.colors import rainbow_colors


class ImportError(ValueError):
    pass


def _parse_origin(raw: str | None) -> Origin:
    if raw in ("ai", "user"):
        return raw
    return "user"


def _parse_style(raw: str | None) -> CurveStyle:
    if raw in ("solid", "dashed", "dotted", "unknown"):
        return raw
    return "unknown"


def _data_rows_from_json(text: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ImportError("Invalid JSON file") from exc
    if not isinstance(payload, dict):
        raise ImportError("JSON root must be an object")
    if is_project_payload(payload):
        raise ImportError(
            "This is a Plot Digitizer project file — use Open project instead of Import curves"
        )
    curves = payload.get("curves")
    if not isinstance(curves, list):
        raise ImportError('JSON must contain a "curves" array')
    rows: list[dict[str, Any]] = []
    for curve in curves:
        if not isinstance(curve, dict):
            continue
        curve_id = str(curve.get("id", curve.get("label", "Curve")))
        label = str(curve.get("label", "Curve"))
        color = str(curve.get("color", "#3b82f6"))
        style = _parse_style(curve.get("style"))
        points = curve.get("points", [])
        if not isinstance(points, list):
            continue
        for pt in points:
            if not isinstance(pt, dict):
                continue
            if "x" not in pt or "y" not in pt:
                continue
            rows.append(
                {
                    "curve_id": curve_id,
                    "curve_label": label,
                    "color": color,
                    "style": style,
                    "x": float(pt["x"]),
                    "y": float(pt["y"]),
                    "origin": _parse_origin(pt.get("origin")),
                }
            )
    return rows


def _data_rows_from_csv(text: str) -> list[dict[str, Any]]:
    stripped = "\n".join(
        line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")
    )
    reader = csv.DictReader(io.StringIO(stripped))
    if not reader.fieldnames:
        raise ImportError("CSV file is empty")
    fields = {f.lower().strip() for f in reader.fieldnames}
    has_xy = {"x", "y"}.issubset(fields)
    has_polar = {"theta", "r"}.issubset(fields)
    if not {"curve_label"}.issubset(fields) or not (has_xy or has_polar):
        raise ImportError(
            "CSV must have columns: curve_label, x, y (curve_id optional) "
            "or curve_label, theta, R for polar"
        )
    rows: list[dict[str, Any]] = []
    for row in reader:
        id_key = next((k for k in row if k.lower().strip() == "curve_id"), None)
        label_key = next((k for k in row if k.lower().strip() == "curve_label"), "curve_label")
        origin_key = next((k for k in row if k.lower().strip() == "origin"), None)
        if has_polar:
            x_key = next(k for k in row if k.lower().strip() == "theta")
            y_key = next(k for k in row if k.lower().strip() == "r")
        else:
            x_key = next(k for k in row if k.lower().strip() == "x")
            y_key = next(k for k in row if k.lower().strip() == "y")
        try:
            x = float(row[x_key])
            y = float(row[y_key])
        except (KeyError, TypeError, ValueError):
            continue
        curve_id = str(row.get(id_key, "")) if id_key else ""
        label = str(row.get(label_key, "Curve"))
        rows.append(
            {
                "curve_id": curve_id or label,
                "curve_label": label,
                "color": "#3b82f6",
                "style": "unknown",
                "x": x,
                "y": y,
                "origin": _parse_origin(row.get(origin_key) if origin_key else None),
            }
        )
    return rows


def _group_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for row in rows:
        key = str(row.get("curve_id") or row["curve_label"])
        label = row["curve_label"]
        if key not in grouped:
            grouped[key] = {
                "label": label,
                "color": row.get("color", "#3b82f6"),
                "style": row.get("style", "unknown"),
                "points": [],
            }
            order.append(key)
        bucket = grouped[key]
        if row.get("color"):
            bucket["color"] = row["color"]
        if row.get("style") and row["style"] != "unknown":
            bucket["style"] = row["style"]
        bucket["points"].append(
            {
                "x": row["x"],
                "y": row["y"],
                "origin": row.get("origin", "user"),
            }
        )
    return [grouped[key] for key in order]


def _points_from_data(
    data_points: list[dict[str, Any]],
    calibration: Calibration,
) -> list[Point]:
    entries: list[tuple[float, float, Origin]] = []
    for pt in data_points:
        px, py = data_to_pixel(calibration, (pt["x"], pt["y"]))
        entries.append((px, py, pt["origin"]))
    if not entries:
        return []
    ordered_pixels = order_points_along_curve([(x, y) for x, y, _ in entries])
    points: list[Point] = []
    for ox, oy in ordered_pixels:
        best_i = min(
            range(len(entries)),
            key=lambda i: (math.hypot(entries[i][0] - ox, entries[i][1] - oy), i),
        )
        _, _, origin = entries[best_i]
        points.append(Point(pixel=(ox, oy), origin=origin))
    return points


def _curves_from_groups(
    groups: list[dict[str, Any]],
    calibration: Calibration,
) -> list[Curve]:
    curves: list[Curve] = []
    for group in groups:
        points = _points_from_data(group["points"], calibration)
        if not points:
            continue
        count = len(points)
        curves.append(
            Curve(
                label=group["label"],
                color=group["color"],
                trace_color=group["color"],
                style=_parse_style(group.get("style")),
                target_point_count=max(DEFAULT_POINT_COUNT, min(200, count)),
                points=points,
            )
        )
    return curves


def import_curves_from_text(
    text: str,
    *,
    calibration: Calibration,
    filename: str | None = None,
) -> list[Curve]:
    validate_calibration(calibration)
    name = (filename or "").lower()
    if name.endswith(".csv"):
        rows = _data_rows_from_csv(text)
    elif name.endswith(".json"):
        rows = _data_rows_from_json(text)
    else:
        stripped = text.lstrip()
        if stripped.startswith("{"):
            rows = _data_rows_from_json(text)
        else:
            rows = _data_rows_from_csv(text)
    if not rows:
        raise ImportError("No curve points found in file")
    groups = _group_rows(rows)
    curves = _curves_from_groups(groups, calibration)
    if not curves:
        raise ImportError("No valid curves could be mapped with the current calibration")
    is_json = name.endswith(".json") or text.lstrip().startswith("{")
    if is_json:
        return curves
    colors = rainbow_colors(len(curves))
    return [
        curve.model_copy(update={"color": color, "trace_color": color})
        for curve, color in zip(curves, colors, strict=True)
    ]


def import_curves_replace_session(
    session: Session,
    file_bytes: bytes,
    *,
    filename: str | None = None,
) -> Session:
    if not session.calibration:
        raise CalibrationError("Calibration required to import curves")
    text = file_bytes.decode("utf-8-sig")
    session.curves = import_curves_from_text(
        text,
        calibration=session.calibration,
        filename=filename,
    )
    return session
