from __future__ import annotations

import base64
import binascii
import csv
import os
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

DEFAULT_REF_DIR = Path("/home/valentin/Projects/t/engauge-digitizer")
_PNG_MAGIC = b"\x89PNG"

# Pre-XML Engauge v5 dumps. The only files allowed to become stubs on ParseError.
# Filename whitelist (not XML-magic): a new binary or truncated XML must fail the run.
BINARY_V5_DIGS = frozenset(
    {
        "version5_1.dig",
        "version5_2.dig",
        "version5_3.dig",
    }
)

# Polar + CmdAddPointAxis (3 each). Values are doc.name (xml stem, not filename).
# Filtering iter_docs for coords_type=="polar" and axis_points also yields four
# incidental .dig files (POLAR_AXIS_INCIDENTAL) that have zero CmdAddPointAxis.
POLAR_WITH_AXIS_POINTS = (
    "guidelines_polar",
    "guidelines_polar_log",
    "polar_linear_linear_3curve",
    "polar_linear_linear_nonzero_center",
)

# Polar with axis points via .dig <Point IsAxisPoint> only — not transform GT.
# Values are doc.name (.dig suffix kept).
POLAR_AXIS_INCIDENTAL = (
    "extract_image_only_2.dig",
    "guidelines_polar_linear_shear.dig",
    "guidelines_polar_log_rotated.dig",
    "version8_2.dig",
)

_FILTER_KEYS = (
    "IntensityLow",
    "IntensityHigh",
    "Mode",
    "HueLow",
    "HueHigh",
    "SaturationLow",
    "SaturationHigh",
    "ValueLow",
    "ValueHigh",
    "ForegroundLow",
    "ForegroundHigh",
)


@dataclass
class ReferenceAxisPoint:
    pixel: tuple[float, float]
    graph_x: float | None
    graph_y: float | None
    is_x_only: bool


@dataclass
class ReferenceDoc:
    name: str
    image: np.ndarray
    coords_type: str
    scale_x: str
    scale_y: str
    axis_points: list[ReferenceAxisPoint]
    curve_points: dict[str, list[tuple[float, float]]]
    expected_csv: list[list[str]] | None
    color_filter: dict[str, float]
    segment_settings: dict[str, float]
    point_match_size: int | None


def resolve_ref_dir() -> Path | None:
    raw = os.environ.get("PLOTDIG_REF_DIR", str(DEFAULT_REF_DIR))
    path = Path(raw)
    return path if path.is_dir() else None


def _empty_image() -> np.ndarray:
    return np.zeros((0, 0, 3), dtype=np.uint8)


def _decode_embedded_image(text: str | None) -> np.ndarray:
    if not text:
        return _empty_image()
    compact = "".join(text.split())
    try:
        raw = base64.b64decode(compact, validate=False)
    except binascii.Error:
        return _empty_image()
    png_at = raw.find(_PNG_MAGIC)
    blob = raw[png_at:] if png_at >= 0 else (raw[4:] if len(raw) > 4 else raw)
    if not blob:
        return _empty_image()
    img = cv2.imdecode(np.frombuffer(blob, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return _empty_image()
    return img


def _lc(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _float_or_none(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"true", "1", "yes"}


def _numeric_attrs(elem: ET.Element, keys: tuple[str, ...]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key in keys:
        raw = elem.get(key)
        if raw is None or raw == "":
            continue
        try:
            out[key] = float(raw)
        except ValueError:
            continue
    return out


def _parse_coords(root: ET.Element) -> tuple[str, str, str]:
    coords_type = ""
    scale_x = ""
    scale_y = ""
    # Last Coords wins. First TypeString is Cartesian on every polar document.
    for elem in root.iter("Coords"):
        ts = elem.get("TypeString")
        if ts is not None:
            coords_type = _lc(ts)
        sx = elem.get("ScaleXThetaString")
        if sx is not None:
            scale_x = _lc(sx)
        sy = elem.get("ScaleYRadiusString")
        if sy is not None:
            scale_y = _lc(sy)
    return coords_type, scale_x, scale_y


def _curve_name_from_identifier(identifier: str | None, fallback: str | None) -> str:
    if fallback:
        return fallback
    if not identifier:
        return ""
    return identifier.split("\t", 1)[0]


def _cmd_axis_points(root: ET.Element) -> list[ReferenceAxisPoint]:
    points: list[ReferenceAxisPoint] = []
    for cmd in root.iter("Cmd"):
        if cmd.get("Type") != "CmdAddPointAxis":
            continue
        sx = cmd.get("ScreenX")
        sy = cmd.get("ScreenY")
        if sx is None or sy is None:
            continue
        points.append(
            ReferenceAxisPoint(
                pixel=(float(sx), float(sy)),
                graph_x=_float_or_none(cmd.get("GraphX")),
                graph_y=_float_or_none(cmd.get("GraphY")),
                is_x_only=_truthy(cmd.get("IsXOnly")),
            )
        )
    return points


def _cmd_curve_points(root: ET.Element) -> dict[str, list[tuple[float, float]]]:
    curves: dict[str, list[tuple[float, float]]] = {}
    for cmd in root.iter("Cmd"):
        ctype = cmd.get("Type")
        if ctype == "CmdAddPointGraph":
            sx, sy = cmd.get("ScreenX"), cmd.get("ScreenY")
            if sx is None or sy is None:
                continue
            name = _curve_name_from_identifier(cmd.get("Identifier"), cmd.get("CurveName"))
            curves.setdefault(name, []).append((float(sx), float(sy)))
        elif ctype == "CmdAddPointsGraph":
            name = cmd.get("CurveName") or ""
            for pt in cmd.findall("Point"):
                sx, sy = pt.get("ScreenX"), pt.get("ScreenY")
                if sx is None or sy is None:
                    continue
                ident_name = _curve_name_from_identifier(pt.get("Identifier"), name)
                curves.setdefault(ident_name, []).append((float(sx), float(sy)))
    return curves


def _dig_axis_and_curves(
    root: ET.Element,
) -> tuple[list[ReferenceAxisPoint], dict[str, list[tuple[float, float]]]]:
    axis: list[ReferenceAxisPoint] = []
    curves: dict[str, list[tuple[float, float]]] = {}
    for curve in root.iter("Curve"):
        cname = curve.get("CurveName") or ""
        for pt in curve.iter("Point"):
            screen = pt.find("PositionScreen")
            if screen is None:
                continue
            sx, sy = screen.get("X"), screen.get("Y")
            if sx is None or sy is None:
                continue
            pixel = (float(sx), float(sy))
            is_axis = pt.get("IsAxisPoint") == "True" or cname == "Axes"
            if is_axis:
                graph = pt.find("PositionGraph")
                gx = gy = None
                if graph is not None:
                    gx = _float_or_none(graph.get("X"))
                    gy = _float_or_none(graph.get("Y"))
                axis.append(
                    ReferenceAxisPoint(
                        pixel=pixel,
                        graph_x=gx,
                        graph_y=gy,
                        is_x_only=_truthy(pt.get("IsXOnly")),
                    )
                )
            else:
                curves.setdefault(cname, []).append(pixel)
    return axis, curves


def _first_non_axes_filter(root: ET.Element) -> dict[str, float]:
    first: dict[str, float] = {}
    chosen: dict[str, float] = {}
    for elem in root.iter("ColorFilter"):
        parsed = _numeric_attrs(elem, _FILTER_KEYS)
        if not parsed:
            continue
        if not first:
            first = parsed
        if elem.get("CurveName") != "Axes" and not chosen:
            chosen = parsed
    return chosen or first


def _segment_settings(root: ET.Element) -> dict[str, float]:
    elem = next(root.iter("Segments"), None)
    if elem is None:
        return {}
    out: dict[str, float] = {}
    for key in ("MinLength", "PointSeparation"):
        raw = elem.get(key)
        if raw is not None and raw != "":
            out[key] = float(raw)
    fc = elem.get("FillCorners")
    if fc is not None:
        out["FillCorners"] = 1.0 if _truthy(fc) else 0.0
    return out


def _point_match_size(root: ET.Element) -> int | None:
    elem = next(root.iter("PointMatch"), None)
    if elem is None:
        return None
    raw = elem.get("PointSize")
    if raw is None or raw == "":
        return None
    return int(float(raw))


def _doc_name(path: Path) -> str:
    # .xml → stem so tests see "tiny"; .dig keeps the suffix so xml/dig twins stay distinct.
    return path.name.removesuffix(".xml")


def _load_expected_csv(doc_path: Path) -> list[list[str]] | None:
    csv_path = doc_path.with_name(f"{doc_path.stem}.csv_expected_1")
    if not csv_path.is_file():
        return None
    rows: list[list[str]] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.reader(fh):
            rows.append([cell.strip() for cell in row])
    return rows


def _stub_doc(path: Path) -> ReferenceDoc:
    """Pre-XML Engauge .dig (version5_*) is a binary dump, not well-formed XML."""
    return ReferenceDoc(
        name=_doc_name(path),
        image=_empty_image(),
        coords_type="",
        scale_x="",
        scale_y="",
        axis_points=[],
        curve_points={},
        expected_csv=None,
        color_filter={},
        segment_settings={},
        point_match_size=None,
    )


def load_doc(path: Path) -> ReferenceDoc:
    path = Path(path)
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        if path.name not in BINARY_V5_DIGS:
            raise
        return _stub_doc(path)
    root = tree.getroot()
    image_elem = root.find(".//Image")
    image = _decode_embedded_image(image_elem.text if image_elem is not None else None)
    coords_type, scale_x, scale_y = _parse_coords(root)
    cmd_axis = _cmd_axis_points(root)
    cmd_curves = _cmd_curve_points(root)
    dig_axis, dig_curves = _dig_axis_and_curves(root)
    axis_points = cmd_axis if cmd_axis else dig_axis
    curve_points = cmd_curves if cmd_curves else dig_curves
    return ReferenceDoc(
        name=_doc_name(path),
        image=image,
        coords_type=coords_type,
        scale_x=scale_x,
        scale_y=scale_y,
        axis_points=axis_points,
        curve_points=curve_points,
        expected_csv=_load_expected_csv(path),
        color_filter=_first_non_axes_filter(root),
        segment_settings=_segment_settings(root),
        point_match_size=_point_match_size(root),
    )


def iter_docs(ref_dir: Path) -> Iterator[ReferenceDoc]:
    test_dir = Path(ref_dir) / "test"
    paths = sorted(list(test_dir.glob("*.xml")) + list(test_dir.glob("*.dig")))
    for path in paths:
        yield load_doc(path)


def sample_image(ref_dir: Path, name: str) -> np.ndarray:
    path = Path(ref_dir) / "samples" / name
    if not path.is_file():
        raise FileNotFoundError(path)
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is not None:
        return img
    from PIL import Image

    pil = Image.open(path).convert("RGB")
    return cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
