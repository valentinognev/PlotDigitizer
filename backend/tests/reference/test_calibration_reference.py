from __future__ import annotations

import math
from pathlib import Path

import pytest

from app.calibration.coords import pixel_to_data, validate_calibration
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis
from metrics import assert_not_worse, max_abs_error
from tests.reference.refcorpus import iter_docs

pytestmark = pytest.mark.reference

GROUND_TRUTH = (
    "extrapolate_functions_smooth",
    "extrapolate_functions_straight",
    "extrapolate_relations_smooth",
    "extrapolate_relations_straight",
    "guidelines_cartesian",
    "guidelines_cartesian_log",
    "guidelines_polar",
    "guidelines_polar_log",
    "points_along_axes",
)


def _docs_by_name(ref_dir: Path):
    return {doc.name: doc for doc in iter_docs(ref_dir)}


def _calibration_from_doc(doc) -> Calibration:
    axis_points: list[AxisPoint] = []
    for ap in doc.axis_points:
        if ap.is_x_only:
            axis_points.append(
                AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=None)
            )
        else:
            axis_points.append(
                AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=ap.graph_y)
            )
    scale_x = "log" if doc.scale_x == "log" else "linear"
    scale_y = "log" if doc.scale_y == "log" else "linear"
    coords = "polar" if doc.coords_type == "polar" else "cartesian"
    origin_radius = 0.0
    if coords == "polar":
        radii = [float(ap.graph_y) for ap in doc.axis_points if ap.graph_y is not None]
        if radii:
            origin_radius = min(radii)
    return Calibration(
        x=CalibrationAxis(scale=scale_x, ref_points=[]),
        y=CalibrationAxis(scale=scale_y, ref_points=[]),
        coords_type=coords,
        model="affine",
        axis_points=axis_points,
        theta_units="degrees",
        origin_radius=origin_radius,
    )


def _parse_cell(raw: str) -> float | None:
    text = str(raw).strip()
    if text == "" or text.upper() == "XXX":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _is_header_row(row: list[str]) -> bool:
    if not row:
        return True
    text = str(row[0]).strip()
    if text == "" or text.upper() == "XXX":
        return False
    try:
        float(text)
    except ValueError:
        return True
    return False


def _csv_tables(csv_rows: list[list[str]]) -> list[tuple[list[str], list[list[str]]]]:
    """Split concatenated Engauge expected CSVs (second `x,curve` header mid-file)."""
    if not csv_rows:
        return []
    tables: list[tuple[list[str], list[list[str]]]] = []
    header = csv_rows[0]
    body: list[list[str]] = []
    for row in csv_rows[1:]:
        if _is_header_row(row):
            tables.append((header, body))
            header = row
            body = []
        else:
            body.append(row)
    tables.append((header, body))
    return tables


def _series_from_table(
    header: list[str], rows: list[list[str]]
) -> dict[str, list[tuple[float, float]]]:
    """Shared-X (`x,c1,c2`) and paired-X (`x,c1,x,c2`) expected-CSV layouts."""
    names = [c.strip() for c in header]
    out: dict[str, list[tuple[float, float]]] = {}
    paired = (
        len(names) >= 4
        and names[0].lower() == "x"
        and names[2].lower() == "x"
    )
    if paired:
        i = 0
        while i + 1 < len(names):
            if names[i].lower() != "x":
                i += 1
                continue
            cname = names[i + 1]
            pts: list[tuple[float, float]] = []
            for row in rows:
                if i + 1 >= len(row):
                    continue
                x_exp = _parse_cell(row[i])
                y_exp = _parse_cell(row[i + 1])
                if x_exp is None or y_exp is None:
                    continue
                pts.append((x_exp, y_exp))
            out[cname] = pts
            i += 2
        return out
    for col_index, curve_name in enumerate(names[1:], start=1):
        if curve_name.lower() == "x":
            continue
        pts = []
        for row in rows:
            if col_index >= len(row):
                continue
            x_exp = _parse_cell(row[0])
            y_exp = _parse_cell(row[col_index])
            if x_exp is None or y_exp is None:
                continue
            pts.append((x_exp, y_exp))
        out[curve_name] = pts
    return out


def _expected_curves(csv_rows: list[list[str]]) -> dict[str, list[tuple[float, float]]]:
    merged: dict[str, list[tuple[float, float]]] = {}
    for header, rows in _csv_tables(csv_rows):
        merged.update(_series_from_table(header, rows))
    return merged


def _interp_y(points: list[tuple[float, float]], x_query: float) -> float | None:
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda p: p[0])
    xs = [p[0] for p in ordered]
    if x_query < xs[0] or x_query > xs[-1]:
        nearest = ordered[0] if abs(x_query - xs[0]) <= abs(x_query - xs[-1]) else ordered[-1]
        if abs(x_query - nearest[0]) > 0.05 * max(abs(xs[-1] - xs[0]), 1e-12):
            return None
        return nearest[1]
    for i in range(1, len(ordered)):
        x0, y0 = ordered[i - 1]
        x1, y1 = ordered[i]
        if x0 <= x_query <= x1 or x1 <= x_query <= x0:
            if abs(x1 - x0) < 1e-15:
                return y0
            t = (x_query - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return None


def _relative_errors(got: list[float], exp: list[float], log_scale: bool) -> list[float]:
    errs: list[float] = []
    for g, e in zip(got, exp):
        if log_scale:
            if g <= 0 or e <= 0:
                continue
            errs.append(abs(math.log10(g) - math.log10(e)) / max(abs(math.log10(e)), 1e-12))
        else:
            errs.append(abs(g - e) / max(abs(e), 1e-12))
    return errs


@pytest.mark.parametrize("name", GROUND_TRUTH)
def test_reference_doc_matches_expected_csv(name: str, plotdig_ref_dir: Path):
    docs = _docs_by_name(plotdig_ref_dir)
    if name not in docs:
        pytest.skip(f"{name} not present in corpus")
    doc = docs[name]
    if not doc.expected_csv or not doc.axis_points or not doc.curve_points:
        pytest.skip(f"{name} missing axis points, curve points, or expected CSV")
    cal = _calibration_from_doc(doc)
    validate_calibration(cal)

    expected = _expected_curves(doc.expected_csv)
    mapped: dict[str, list[tuple[float, float]]] = {}
    for curve_name, pixels in doc.curve_points.items():
        mapped[curve_name] = [pixel_to_data(cal, pix) for pix in pixels]

    rels: list[float] = []
    log_y = doc.scale_y == "log"
    gate = 0.01 if log_y else 0.005
    for curve_name, exp_pts in expected.items():
        series = mapped.get(curve_name) or mapped.get(curve_name.strip())
        if series is None:
            if len(mapped) == 1:
                series = next(iter(mapped.values()))
            else:
                continue
        ymax = max((abs(y) for _x, y in exp_pts), default=0.0)
        floor = gate * max(ymax, 1e-12)
        got_y: list[float] = []
        exp_y: list[float] = []
        # Score digitized vertices: expected CSVs may be Engauge-smoothed
        # denser than curve_points; interpolating the polyline onto every
        # CSV X would test LineSmooth vs linear, not affine calibration.
        for x_got, y_got in series:
            y_exp = _interp_y(exp_pts, x_got)
            if y_exp is None:
                continue
            if max(abs(y_exp), abs(y_got)) < floor:
                continue
            got_y.append(y_got)
            exp_y.append(y_exp)
        assert got_y, f"{name}/{curve_name}: no comparable cells"
        rels.extend(_relative_errors(got_y, exp_y, log_y))
        peak = max(_relative_errors(got_y, exp_y, log_y))
        assert peak <= gate, f"{name}/{curve_name} relative {peak} > {gate}"

    peak_all = max(rels)
    assert_not_worse(
        f"calibration.reference.{name}.rel_max",
        peak_all,
        lower_is_better=True,
    )
    _ = max_abs_error  # imported for metrics module side effects / baseline naming consistency
