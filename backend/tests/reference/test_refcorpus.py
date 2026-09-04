from __future__ import annotations

import base64
import io
import struct
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from refcorpus import (
    DEFAULT_REF_DIR,
    ReferenceAxisPoint,
    ReferenceDoc,
    iter_docs,
    load_doc,
    resolve_ref_dir,
    sample_image,
)

GROUND_TRUTH_DOCS = [
    "extrapolate_functions_smooth.xml",
    "extrapolate_functions_straight.xml",
    "extrapolate_relations_smooth.xml",
    "extrapolate_relations_straight.xml",
    "guidelines_cartesian.xml",
    "guidelines_cartesian_log.xml",
    "guidelines_polar.xml",
    "guidelines_polar_log.xml",
    "points_along_axes.xml",
]

# Polar + axis points only. Reading the first TypeString misclassifies all of these.
POLAR_WITH_AXIS_POINTS = [
    "guidelines_polar.xml",
    "guidelines_polar_log.xml",
    "polar_linear_linear_3curve.xml",
    "polar_linear_linear_nonzero_center.xml",
]

GRID_PAIR_BASES = [
    "gnuplot_theta_r_lines",
    "gnuplot_theta_r_linespoints",
    "gnuplot_theta_r_points",
    "gnuplot_x_log_y_lines",
    "gnuplot_x_log_y_linespoints",
    "gnuplot_x_log_y_points",
    "gnuplot_x_y_lines",
    "gnuplot_x_y_linespoints",
    "gnuplot_x_y_points",
]


def _qbytearray_png_b64(rgb: tuple[int, int, int] = (255, 0, 0), size: tuple[int, int] = (2, 2)) -> str:
    buf = io.BytesIO()
    Image.new("RGB", size, rgb).save(buf, format="PNG")
    png = buf.getvalue()
    qba = struct.pack(">I", len(png)) + png
    return base64.b64encode(qba).decode("ascii")


def _write_xml(path: Path, body: str) -> Path:
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<Document>\n{body}\n</Document>\n",
        encoding="utf-8",
    )
    return path


def test_resolve_ref_dir_none_when_missing(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("PLOTDIG_REF_DIR", str(tmp_path / "absent"))
    assert resolve_ref_dir() is None


def test_default_ref_dir_constant():
    assert DEFAULT_REF_DIR == Path("/home/valentin/Projects/t/engauge-digitizer")


def test_load_doc_decodes_qbytearray_png(tmp_path: Path):
    b64 = _qbytearray_png_b64((0, 255, 0), (3, 4))
    xml = _write_xml(
        tmp_path / "tiny.xml",
        f'  <Image Width="3" Height="4"><![CDATA[{b64}]]></Image>\n'
        '  <Coords TypeString="Cartesian" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Log"/>\n',
    )
    doc = load_doc(xml)
    assert isinstance(doc, ReferenceDoc)
    assert doc.name == "tiny"
    assert doc.image.shape == (4, 3, 3)
    assert doc.image.dtype == np.uint8
    b, g, r = (int(v) for v in doc.image[0, 0])
    assert (b, g, r) == (0, 255, 0)
    assert doc.coords_type == "cartesian"
    assert doc.scale_x == "linear"
    assert doc.scale_y == "log"


def test_load_doc_parses_cmd_axis_graph_filter_and_xxx_csv(tmp_path: Path):
    b64 = _qbytearray_png_b64()
    csv_path = tmp_path / "demo.csv_expected_1"
    csv_path.write_text("x,Curve1\n1.0,2.0\n3.0,XXX\nXXX,-1.5\n", encoding="utf-8")
    xml = _write_xml(
        tmp_path / "demo.xml",
        f'  <Image Width="2" Height="2"><![CDATA[{b64}]]></Image>\n'
        '  <Coords TypeString="Cartesian" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Linear"/>\n'
        '  <ColorFilter CurveName="Axes" IntensityLow="0" IntensityHigh="50"'
        ' Mode="2" ModeString="Intensity" HueLow="180" HueHigh="360"'
        ' SaturationLow="50" SaturationHigh="100" ValueLow="0" ValueHigh="50"'
        ' ForegroundLow="0" ForegroundHigh="10"/>\n'
        '  <ColorFilter CurveName="Curve1" IntensityLow="10" IntensityHigh="40"'
        ' Mode="2" ModeString="Intensity" HueLow="180" HueHigh="360"'
        ' SaturationLow="50" SaturationHigh="100" ValueLow="0" ValueHigh="50"'
        ' ForegroundLow="0" ForegroundHigh="10"/>\n'
        '  <Segments MinLength="2" PointSeparation="25" FillCorners="False"/>\n'
        '  <PointMatch PointSize="48"/>\n'
        '  <Cmd Type="CmdAddPointAxis" ScreenX="10" ScreenY="20" GraphX="0"'
        ' GraphY="1" IsXOnly="False"/>\n'
        '  <Cmd Type="CmdAddPointAxis" ScreenX="30" ScreenY="20" GraphX="5"'
        ' GraphY="1" IsXOnly="True"/>\n'
        '  <Cmd Type="CmdAddPointGraph" ScreenX="11" ScreenY="12"'
        ' Identifier="Curve1&#x9;point&#x9;6" CurveName="Curve1"/>\n'
        '  <Cmd Type="CmdAddPointsGraph" CurveName="Curve1">\n'
        '    <Point ScreenX="13" ScreenY="14"/>\n'
        '    <Point ScreenX="15" ScreenY="16"/>\n'
        "  </Cmd>\n",
    )
    doc = load_doc(xml)
    assert doc.axis_points == [
        ReferenceAxisPoint(pixel=(10.0, 20.0), graph_x=0.0, graph_y=1.0, is_x_only=False),
        ReferenceAxisPoint(pixel=(30.0, 20.0), graph_x=5.0, graph_y=1.0, is_x_only=True),
    ]
    assert doc.curve_points["Curve1"] == [(11.0, 12.0), (13.0, 14.0), (15.0, 16.0)]
    assert doc.expected_csv[0] == ["x", "Curve1"]
    assert doc.expected_csv[2][1] == "XXX"
    assert doc.expected_csv[3][0] == "XXX"
    assert doc.color_filter["IntensityLow"] == 10.0
    assert doc.color_filter["IntensityHigh"] == 40.0
    assert doc.segment_settings == {"MinLength": 2.0, "PointSeparation": 25.0, "FillCorners": 0.0}
    assert doc.point_match_size == 48


def test_load_doc_last_coords_wins_polar(tmp_path: Path):
    b64 = _qbytearray_png_b64()
    xml = _write_xml(
        tmp_path / "polar.xml",
        f'  <Image Width="2" Height="2"><![CDATA[{b64}]]></Image>\n'
        '  <Coords TypeString="Cartesian" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Linear"/>\n'
        '  <Cmd Type="CmdSettingsCoords">\n'
        '    <Coords TypeString="Polar" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Log"/>\n'
        "  </Cmd>\n",
    )
    doc = load_doc(xml)
    assert doc.coords_type == "polar"
    assert doc.scale_x == "linear"
    assert doc.scale_y == "log"


def test_load_doc_parses_dig_curve_points(tmp_path: Path):
    b64 = _qbytearray_png_b64()
    xml = _write_xml(
        tmp_path / "saved.dig",
        f'  <Image Width="2" Height="2"><![CDATA[{b64}]]></Image>\n'
        '  <Coords TypeString="Cartesian" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Linear"/>\n'
        '  <PointMatch PointSize="32"/>\n'
        '  <Segments MinLength="3" PointSeparation="10" FillCorners="True"/>\n'
        '  <Curve CurveName="Axes">\n'
        "    <CurvePoints>\n"
        '      <Point IsAxisPoint="True" IsXOnly="False">\n'
        '        <PositionScreen X="38" Y="385"/>\n'
        '        <PositionGraph X="0" Y="0"/>\n'
        "      </Point>\n"
        "    </CurvePoints>\n"
        "  </Curve>\n"
        "  <CurvesGraphs>\n"
        '    <Curve CurveName="CurveTop">\n'
        '      <ColorFilter CurveName="CurveTop" IntensityLow="1" IntensityHigh="2"'
        ' Mode="2" HueLow="0" HueHigh="1" SaturationLow="0" SaturationHigh="1"'
        ' ValueLow="0" ValueHigh="1" ForegroundLow="0" ForegroundHigh="1"/>\n'
        "      <CurvePoints>\n"
        '        <Point IsAxisPoint="False">\n'
        '          <PositionScreen X="38" Y="27"/>\n'
        "        </Point>\n"
        "      </CurvePoints>\n"
        "    </Curve>\n"
        "  </CurvesGraphs>\n",
    )
    doc = load_doc(xml)
    assert doc.axis_points == [
        ReferenceAxisPoint(pixel=(38.0, 385.0), graph_x=0.0, graph_y=0.0, is_x_only=False),
    ]
    assert doc.curve_points == {"CurveTop": [(38.0, 27.0)]}
    assert doc.color_filter["IntensityLow"] == 1.0
    assert doc.segment_settings["FillCorners"] == 1.0
    assert doc.point_match_size == 32


def test_load_doc_missing_png_yields_empty_image(tmp_path: Path):
    xml = _write_xml(
        tmp_path / "nopng.xml",
        '  <Coords TypeString="Cartesian" ScaleXThetaString="Linear"'
        ' ScaleYRadiusString="Linear"/>\n',
    )
    doc = load_doc(xml)
    assert doc.image.shape == (0, 0, 3)
    assert doc.coords_type == "cartesian"
    assert doc.expected_csv is None


@pytest.mark.reference
def test_corpus_has_85_docs(plotdig_ref_dir: Path):
    docs = list(iter_docs(plotdig_ref_dir))
    assert len(docs) == 85
    names = {d.name for d in docs}
    assert len(names) == 85


@pytest.mark.reference
def test_corpus_png_count(plotdig_ref_dir: Path):
    docs = list(iter_docs(plotdig_ref_dir))
    with_png = [d for d in docs if d.image.size > 0]
    assert len(with_png) == 78
    for d in with_png:
        assert d.image.ndim == 3 and d.image.shape[2] == 3
        assert d.image.dtype == np.uint8


@pytest.mark.reference
def test_polar_docs_with_axis_points(plotdig_ref_dir: Path):
    """Last <Coords> wins. First TypeString is Cartesian on every polar doc."""
    test_dir = plotdig_ref_dir / "test"
    for filename in POLAR_WITH_AXIS_POINTS:
        doc = load_doc(test_dir / filename)
        assert doc.coords_type == "polar", doc.name
        assert len(doc.axis_points) == 3, doc.name


@pytest.mark.reference
def test_nine_ground_truth_docs_are_xml(plotdig_ref_dir: Path):
    test_dir = plotdig_ref_dir / "test"
    for filename in GROUND_TRUTH_DOCS:
        path = test_dir / filename
        assert path.is_file(), filename
        assert not (test_dir / f"{Path(filename).stem}.dig").exists()
        doc = load_doc(path)
        n_graph = sum(len(v) for v in doc.curve_points.values())
        assert len(doc.axis_points) >= 3, doc.name
        assert n_graph >= 1, doc.name
        assert doc.expected_csv is not None, doc.name
        assert doc.expected_csv[0], doc.name
        for row in doc.expected_csv:
            for cell in row:
                assert isinstance(cell, str)
        if doc.name == "extrapolate_functions_smooth":
            assert any(cell == "XXX" for row in doc.expected_csv for cell in row)
        if doc.name == "points_along_axes":
            assert any(cell == "XXX" for row in doc.expected_csv for cell in row)


@pytest.mark.reference
def test_grid_nogrid_pairs_and_readme(plotdig_ref_dir: Path):
    assert (plotdig_ref_dir / "samples" / "README").is_file()
    for base in GRID_PAIR_BASES:
        grid = sample_image(plotdig_ref_dir, f"{base}_grid.png")
        nogrid = sample_image(plotdig_ref_dir, f"{base}_nogrid.png")
        assert grid.shape == (800, 1000, 3)
        assert nogrid.shape == (800, 1000, 3)
        assert grid.shape == nogrid.shape
        assert not np.array_equal(grid, nogrid)
