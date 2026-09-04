# Precision Toolkit Phase 0 — Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four test-only foundations later phases need: an Engauge reference-corpus parser, a synthetic analytic plot generator with exact ground truth, a metrics/baseline harness, and a Vitest runner plus committed Python↔TS transform-parity fixture.

**Architecture:** No production algorithm changes. All new code lives under `backend/tests/` plus frontend test config. The corpus is read at test time from `PLOTDIG_REF_DIR` (never vendored). `render_plot` owns an analytic pixel↔data mapping so precision claims are numbers. `metrics.assert_not_worse` plus `metrics.json` make those numbers regression-gated. Vitest plus `transform-vectors.json` lock backend/frontend geometry parity for today's orthogonal mapping.

**Tech Stack:** Python 3, pytest 8, NumPy, OpenCV, Pillow (already in `backend/requirements.txt`). Frontend: Vite 8, TypeScript, new `vitest` + `@vitest/coverage-v8` devDependencies only.

**Spec:** `docs/superpowers/specs/2026-09-04-precision-toolkit-design.md`

## Global Constraints

These bind every task in every plan.

1. **Licence hygiene.** Engauge is GPL-2.0+. Do **not** copy or transcribe Engauge source
   code into this repo, and do **not** vendor its images, `.dig`/`.xml` docs, or expected
   CSVs. Algorithms are implemented from the documented behaviour in `help/*.html` plus
   standard OpenCV/NumPy technique. Reference assets are read from an external directory at
   test time only.
2. **Reference corpus is optional at runtime.** Tests that read the corpus resolve
   `PLOTDIG_REF_DIR` (default `/home/valentin/Projects/t/engauge-digitizer`) and
   `pytest.skip` when it is absent. `pytest -q` must pass on a clean checkout without the
   reference project present.
3. **Pixels remain the source of truth.** `Point.pixel` stays canonical; every data value is
   derived through the active calibration. No feature may invert this.
4. **Backward compatibility.** Existing sessions and `.pdproj.json` projects must load
   unchanged, and an existing four-bound linear/log calibration must produce **numerically
   identical** results after the transform rewrite (regression-tested, exact to 1e-12).
5. **TDD.** No production code without a failing test first. Every task ends with an
   independently runnable test command and its observed output recorded in the task report.
6. **Backend/frontend geometry parity.** Any transform implemented in Python and mirrored in
   TypeScript must agree to 1e-9 on a committed vector fixture.
7. **Dependency floor.** Backend: existing `backend/requirements.txt` only
   (`numpy>=2.1`, `opencv-python-headless>=4.10`, `pillow>=11`, `fastapi>=0.115`,
   `pydantic>=2.9`, `pytest>=8.3`, `httpx>=0.27`). No SciPy, no scikit-image, no FFTW.
   Frontend: adding `vitest` + `@vitest/coverage-v8` as devDependencies is permitted; no
   other new runtime dependency.
8. **Docs.** `UPDATES.md` gets one new top entry per completed phase with a version bump.
   Phase 0 is test/build infrastructure with no user-facing change → `subsubver`
   (`2.2.2` → `2.2.3`). Phases 1–4 ship user-facing capability → `subver`.
   `README.md` changes only when architecture changes. No other markdown files may
   be created.
9. **No commits to `master`.** All work happens on a feature branch / worktree. Never
   `git push`, never merge, without the user's explicit request.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/tests/reference/__init__.py` | Create | Empty package marker so `reference.refcorpus` is importable once `tests/` is on `sys.path`. |
| `backend/tests/reference/refcorpus.py` | Create | Parse Engauge `.xml`/`.dig` as data; decode embedded Qt PNG; load sibling expected CSV. |
| `backend/tests/reference/conftest.py` | Create | `PLOTDIG_REF_DIR` resolve + skip; `reference` marker; put `tests/` on `sys.path`. |
| `backend/tests/reference/test_refcorpus.py` | Create | Synthetic parser tests (always) + corpus count tests (`@pytest.mark.reference`). |
| `backend/tests/synth/__init__.py` | Create | Empty package marker. |
| `backend/tests/synth/plotgen.py` | Create | Analytic plot renderer + exact `pixel_of`/`data_of`. |
| `backend/tests/synth/test_plotgen.py` | Create | Inverse, ink-on-curve, log/grid/rotation/perspective/markers/noise tests. |
| `backend/tests/metrics.py` | Create | RMS / max-abs / mask F1 / recall + baseline compare. |
| `backend/tests/reference/baselines/metrics.json` | Create | Committed baseline store, starts as `{}`. |
| `backend/tests/test_metrics.py` | Create | Unit tests for metrics + `assert_not_worse`. |
| `backend/tests/conftest.py` | Modify | `--update-baselines`; `reference` marker; `tests/` on `sys.path`. |
| `backend/tests/synth/gen_transform_vectors.py` | Create | Writes synthetic orthogonal parity vectors (never from the corpus). |
| `frontend/src/lib/__fixtures__/transform-vectors.json` | Create | Committed Python-computed vectors. |
| `frontend/src/lib/__tests__/transform.test.ts` | Create | Vitest unit tests for existing `transform.ts` + fixture parity. |
| `frontend/vite.config.ts` | Modify | Vitest `test` block (`globals: false`). `tsconfig.app.json` is **not** modified: `include: ["src"]` already typechecks `src/**/*.test.ts` under `tsc -b`. |
| `frontend/package.json` | Modify | `vitest` + `@vitest/coverage-v8`; `"test"` script. |
| `frontend/package-lock.json` | Modify | Lockfile from `npm install`. |
| `UPDATES.md` | Modify | Phase 0 entry, bump `2.2.2` → `2.2.3`. |

**Never created / never copied:** any Engauge source file, `.xml`, `.dig`, `.csv_expected_*`, or sample raster. Those stay under `$PLOTDIG_REF_DIR` and are read at test time only.

**Branch:** if HEAD is `master`, `git checkout -b feat/precision-toolkit` before the first commit. Commit only the files listed in the current task.

---

### Task 1: Reference corpus parser

**Files:**
- Create: `backend/tests/reference/__init__.py`
- Create: `backend/tests/reference/refcorpus.py`
- Create: `backend/tests/reference/conftest.py`
- Create: `backend/tests/reference/test_refcorpus.py`
- Test: `backend/tests/reference/test_refcorpus.py`

**Interfaces:**
- Consumes: Python stdlib (`os`, `base64`, `csv`, `xml.etree.ElementTree`), NumPy, OpenCV, Pillow (already installed). External directory `$PLOTDIG_REF_DIR` (default `/home/valentin/Projects/t/engauge-digitizer`) at test time only — never copied into this repo.
- Produces:
  - `DEFAULT_REF_DIR: Path` = `Path("/home/valentin/Projects/t/engauge-digitizer")`
  - `def resolve_ref_dir() -> Path | None`
  - `@dataclass class ReferenceAxisPoint: pixel: tuple[float, float]; graph_x: float | None; graph_y: float | None; is_x_only: bool`
  - `@dataclass class ReferenceDoc: name: str; image: np.ndarray; coords_type: str; scale_x: str; scale_y: str; axis_points: list[ReferenceAxisPoint]; curve_points: dict[str, list[tuple[float, float]]]; expected_csv: list[list[str]] | None; color_filter: dict[str, float]; segment_settings: dict[str, float]; point_match_size: int | None`
  - `def load_doc(path: Path) -> ReferenceDoc`
  - `def iter_docs(ref_dir: Path) -> Iterator[ReferenceDoc]`
  - `def sample_image(ref_dir: Path, name: str) -> np.ndarray`
  - pytest marker `reference`; fixture `plotdig_ref_dir: Path` that `pytest.skip`s when the dir is absent
  - Import from tests under `backend/tests/reference/`: `from refcorpus import load_doc, iter_docs, sample_image, resolve_ref_dir, DEFAULT_REF_DIR, ReferenceDoc, ReferenceAxisPoint`

Verified corpus facts this parser must satisfy (measured 2026-09-04 — do not re-derive):

- `$PLOTDIG_REF_DIR/test/` holds 85 docs (`*.xml` + `*.dig`); 78 have an extractable PNG.
- `<Image>` CDATA is base64 of a Qt `QByteArray`: 4-byte big-endian length prefix then raster bytes. Locate `\x89PNG` in the decoded bytes and slice from there to the end. `cv2.imdecode(..., cv2.IMREAD_COLOR)` → BGR.
- `TypeString` on `<Coords>` is `"Cartesian"` / `"Polar"`; scales from `ScaleXThetaString` / `ScaleYRadiusString` (`"Linear"` / `"Log"`). Store lowercase `"cartesian"` / `"polar"` and `"linear"` / `"log"`. **Take the last `<Coords>` in document order** (including a `<Coords>` nested under `CmdSettingsCoords`). **Consequence for downstream phases: reading the first `TypeString` misclassifies every polar document** — they all open as Cartesian and only become Polar after a later settings command. Exactly **4 documents are polar AND carry axis points** (3 each); only these can ground-truth a transform: `guidelines_polar.xml`, `guidelines_polar_log.xml`, `polar_linear_linear_3curve.xml`, `polar_linear_linear_nonzero_center.xml`. **6 further documents resolve to polar but have zero `CmdAddPointAxis` records** and cannot ground-truth a transform: `settings_axes_checker.xml`, `settings_coordinates.xml`, `extract_image_only_2.dig`, `guidelines_polar_linear_shear.dig`, `guidelines_polar_log_rotated.dig`, `version8_2.dig`. Do not assert a raw polar-document total.
- Axis GT: `.xml` uses `<Cmd Type="CmdAddPointAxis" ScreenX ScreenY GraphX GraphY IsXOnly/>`. `.dig` uses `<Point IsAxisPoint="True">` with `<PositionScreen X Y/>` and `<PositionGraph X Y/>`. Prefer Cmd records when any `CmdAddPointAxis` exists, else the `.dig` points.
- Curve GT: `CmdAddPointGraph` (84 single adds; curve name = `CurveName` attr, else `Identifier` before the first tab) and `CmdAddPointsGraph` (114 bulk adds; child `<Point ScreenX ScreenY/>`). `.dig` uses `<CurvesGraphs>/<Curve CurveName>/CurvePoints/Point/PositionScreen`. Prefer Cmd records when any graph Cmd exists.
- Exactly 9 docs have ≥3 axis points AND graph points AND a sibling expected CSV. All nine are `.xml` (none have a `.dig` twin): `extrapolate_functions_smooth.xml`, `extrapolate_functions_straight.xml`, `extrapolate_relations_smooth.xml`, `extrapolate_relations_straight.xml`, `guidelines_cartesian.xml`, `guidelines_cartesian_log.xml`, `guidelines_polar.xml`, `guidelines_polar_log.xml`, `points_along_axes.xml`.
- Expected CSV: sibling `<stem>.csv_expected_1` (81 files; `_2`…`_5` exist for multi-export cases — Phase 0 loads `_1` only). First line is a header (`x,Curve1`). Literal `XXX` (including cells that start with `XXX`) is preserved as a string; tests skip those cells.
- Per-curve settings: `<ColorFilter IntensityLow IntensityHigh Mode HueLow HueHigh SaturationLow SaturationHigh ValueLow ValueHigh ForegroundLow ForegroundHigh/>` (numeric attrs → `color_filter: dict[str, float]`; first non-`Axes` filter, else first). `<Segments MinLength PointSeparation FillCorners/>` (`FillCorners` True/False → `1.0`/`0.0`). `<PointMatch PointSize/>` → `point_match_size: int | None`.
- `$PLOTDIG_REF_DIR/samples/` holds 50 raster plots including 9 pixel-aligned pairs `X_grid.png` / `X_nogrid.png` (identical 800 rows × 1000 cols, content identical except gridlines). Base names: `gnuplot_theta_r_lines`, `gnuplot_theta_r_linespoints`, `gnuplot_theta_r_points`, `gnuplot_x_log_y_lines`, `gnuplot_x_log_y_linespoints`, `gnuplot_x_log_y_points`, `gnuplot_x_y_lines`, `gnuplot_x_y_linespoints`, `gnuplot_x_y_points`. `samples/README` is plain text with no extension.

- [ ] **Step 1: Create the feature branch if needed**

```bash
git rev-parse --abbrev-ref HEAD
# if the output is master:
git checkout -b feat/precision-toolkit
```

Do not commit unrelated WIP.

- [ ] **Step 2: Write the failing tests**

Create empty `backend/tests/reference/__init__.py` (zero bytes).

Create `backend/tests/reference/test_refcorpus.py`:

```python
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
```

Do not create `refcorpus.py` or `conftest.py` yet.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/reference/test_refcorpus.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'refcorpus'` (or `ImportError` for `refcorpus`). Collection error is the correct red. Do not write implementation before seeing this.

- [ ] **Step 4: Write conftest (skip + marker) and the parser**

Create `backend/tests/reference/conftest.py`:

```python
from __future__ import annotations

import sys
from pathlib import Path

import pytest

from refcorpus import resolve_ref_dir

_TESTS = Path(__file__).resolve().parents[1]
_HERE = Path(__file__).resolve().parent
for _p in (_TESTS, _HERE, _TESTS / "synth"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "reference: tests that read the optional Engauge corpus via PLOTDIG_REF_DIR",
    )


@pytest.fixture(scope="session")
def plotdig_ref_dir() -> Path:
    found = resolve_ref_dir()
    if found is None:
        pytest.skip("PLOTDIG_REF_DIR not present; skipping reference corpus tests")
    return found
```

Create `backend/tests/reference/refcorpus.py`:

```python
from __future__ import annotations

import base64
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
    except Exception:
        return _empty_image()
    png_at = raw.find(_PNG_MAGIC)
    blob = raw[png_at:] if png_at >= 0 else (raw[4:] if len(raw) > 4 else raw)
    if not blob:
        return _empty_image()
    img = cv2.imdecode(np.frombuffer(blob, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return _empty_image()
    return img


def _lc_type(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _lc_scale(value: str | None) -> str:
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
            coords_type = _lc_type(ts)
        sx = elem.get("ScaleXThetaString")
        if sx is not None:
            scale_x = _lc_scale(sx)
        sy = elem.get("ScaleYRadiusString")
        if sy is not None:
            scale_y = _lc_scale(sy)
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


def _load_expected_csv(doc_path: Path) -> list[list[str]] | None:
    csv_path = doc_path.with_name(f"{doc_path.stem}.csv_expected_1")
    if not csv_path.is_file():
        return None
    rows: list[list[str]] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.reader(fh):
            rows.append([cell.strip() for cell in row])
    return rows


def load_doc(path: Path) -> ReferenceDoc:
    path = Path(path)
    tree = ET.parse(path)
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
        name=path.stem,
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
```

- [ ] **Step 5: Run synthetic tests (no corpus required)**

Run: `cd backend && PLOTDIG_REF_DIR=/no/such/engauge-digitizer .venv/bin/pytest tests/reference/test_refcorpus.py -v`

Expected: the unmarked tests PASS; every `@pytest.mark.reference` test is `SKIPPED` with `PLOTDIG_REF_DIR not present`. Exit code 0.

- [ ] **Step 6: Run corpus tests when the reference tree exists**

Run: `cd backend && .venv/bin/pytest tests/reference/test_refcorpus.py -v`

Expected: all tests PASS (skips only if that machine truly lacks `/home/valentin/Projects/t/engauge-digitizer` and `PLOTDIG_REF_DIR` is unset/invalid).

If `test_polar_docs_with_axis_points` fails, the last-`<Coords>`-wins rule is wrong (the first `TypeString` is Cartesian on every polar document) — do not “fix” the expected names or drop last-wins.

- [ ] **Step 7: Confirm the default suite still passes without the corpus**

Run: `cd backend && PLOTDIG_REF_DIR=/no/such/engauge-digitizer .venv/bin/pytest -q`

Expected: PASS (reference tests skipped; existing tests unchanged).

- [ ] **Step 8: Commit**

```bash
git add \
  backend/tests/reference/__init__.py \
  backend/tests/reference/refcorpus.py \
  backend/tests/reference/conftest.py \
  backend/tests/reference/test_refcorpus.py
git commit -m "$(cat <<'EOF'
test: add Engauge reference corpus parser with optional skip

EOF
)"
```

---

### Task 2: Synthetic plot generator

**Files:**
- Create: `backend/tests/synth/__init__.py`
- Create: `backend/tests/synth/plotgen.py`
- Create: `backend/tests/synth/test_plotgen.py`
- Test: `backend/tests/synth/test_plotgen.py`

**Interfaces:**
- Consumes: NumPy, OpenCV (no SciPy). No corpus. No production calibration modules.
- Produces:
  - `@dataclass(frozen=True) class AxisPoint: pixel: tuple[float, float]; x_value: float | None = None; y_value: float | None = None`
    (test-local stand-in for spec §6 `AxisPoint`; Phase 1 production model adds `id` and lives in `app.models.schemas`. Field names `pixel` / `x_value` / `y_value` are stable.)
  - `@dataclass class SynthPlot: image: np.ndarray; pixel_of: Callable[[float, float], tuple[float, float]]; data_of: Callable[[float, float], tuple[float, float]]; axis_points: list[AxisPoint]; truth: list[tuple[float, float]]`
  - `def render_plot(func: Callable[[float], float], *, x_range: tuple[float, float], y_range: tuple[float, float], size: tuple[int, int] = (800, 600), log_x: bool = False, log_y: bool = False, grid: tuple[int, int] | None = None, rotation_deg: float = 0.0, perspective: float | None = None, line_width: int = 2, line_color: tuple[int, int, int] = (0, 0, 255), markers: int | None = None, noise: float = 0.0, background: tuple[int, int, int] = (255, 255, 255)) -> SynthPlot`
  - `size` is `(width, height)` so `image.shape == (height, width, 3)` BGR `uint8`.
  - `grid=(nx, ny)` draws `nx` vertical and `ny` horizontal interior gridlines in the plot rectangle.
  - `perspective` is a top-edge inset as a fraction of width (e.g. `0.2`); `None` means identity.
  - `markers` is a filled-circle radius in pixels; if set, 12 evenly spaced visible samples get a marker.
  - `noise` is Gaussian σ in intensity counts, RNG seed `0`.
  - `pixel_of(x, y)` / `data_of(px, py)` are analytic inverses through the plot rectangle, then rotation about the image centre, then the perspective homography.
  - Import from tests under `backend/tests/synth/`: `from plotgen import render_plot, SynthPlot, AxisPoint`

- [ ] **Step 1: Write the failing tests**

Create empty `backend/tests/synth/__init__.py`.

Create `backend/tests/synth/test_plotgen.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from plotgen import AxisPoint, SynthPlot, render_plot


def _linear():
    return render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        line_width=2,
        line_color=(0, 0, 255),
        background=(255, 255, 255),
    )


def test_image_shape_is_hw_bgr():
    plot = _linear()
    assert isinstance(plot, SynthPlot)
    assert plot.image.shape == (300, 400, 3)
    assert plot.image.dtype == np.uint8
    assert len(plot.axis_points) == 4
    assert all(isinstance(p, AxisPoint) for p in plot.axis_points)
    assert len(plot.truth) >= 2


def test_pixel_of_and_data_of_are_inverses_to_1e9():
    plot = _linear()
    samples = [(0.5, 0.25), (2.0, 1.0), (5.0, 2.5), (9.5, 4.75)]
    for x, y in samples:
        px, py = plot.pixel_of(x, y)
        back = plot.data_of(px, py)
        assert back[0] == pytest.approx(x, abs=1e-9)
        assert back[1] == pytest.approx(y, abs=1e-9)
        px2, py2 = plot.pixel_of(back[0], back[1])
        assert px2 == pytest.approx(px, abs=1e-9)
        assert py2 == pytest.approx(py, abs=1e-9)


def test_log_axes_inverses_to_1e9():
    plot = render_plot(
        lambda x: x**0.5,
        x_range=(1.0, 100.0),
        y_range=(1.0, 10.0),
        size=(400, 300),
        log_x=True,
        log_y=True,
    )
    x, y = 10.0, 10.0**0.5
    px, py = plot.pixel_of(x, y)
    back = plot.data_of(px, py)
    assert back[0] == pytest.approx(x, abs=1e-9)
    assert back[1] == pytest.approx(y, abs=1e-9)


def test_ink_lies_on_analytic_curve():
    func = lambda x: 0.5 * x
    plot = render_plot(
        func,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
        rotation_deg=0.0,
        perspective=None,
        noise=0.0,
        markers=None,
    )
    ink = np.all(plot.image == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    assert ink.any()
    ys, xs = np.nonzero(ink)
    y_span = 5.0
    hits = 0
    for px, py in zip(xs.tolist(), ys.tolist()):
        x, y = plot.data_of(float(px), float(py))
        if x < 0.0 or x > 10.0:
            continue
        hits += 1
        assert abs(y - func(x)) <= 0.02 * y_span + 1e-9
    assert hits > 50


def test_gridlines_change_pixels_not_mapping():
    kwargs = dict(func=lambda x: 0.5 * x, x_range=(0.0, 10.0), y_range=(0.0, 5.0), size=(400, 300))
    plain = render_plot(**kwargs, grid=None)
    gridded = render_plot(**kwargs, grid=(4, 3))
    assert plain.image.shape == gridded.image.shape
    assert not np.array_equal(plain.image, gridded.image)
    x, y = 4.0, 2.0
    assert plain.pixel_of(x, y) == pytest.approx(gridded.pixel_of(x, y), abs=1e-12)


def test_rotation_and_perspective_keep_inverse():
    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        rotation_deg=12.0,
        perspective=0.15,
    )
    x, y = 4.0, 2.0
    px, py = plot.pixel_of(x, y)
    back = plot.data_of(px, py)
    assert back[0] == pytest.approx(x, abs=1e-9)
    assert back[1] == pytest.approx(y, abs=1e-9)
    upright = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
    )
    assert not np.array_equal(plot.image, upright.image)
    ux, uy = upright.pixel_of(x, y)
    assert abs(px - ux) + abs(py - uy) > 1e-3


def test_markers_and_noise_draw_extra_ink():
    base = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=None,
        noise=0.0,
    )
    marked = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=4,
        noise=0.0,
    )
    noisy = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=None,
        noise=8.0,
    )
    assert not np.array_equal(base.image, marked.image)
    assert not np.array_equal(base.image, noisy.image)
    ink = np.all(marked.image == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    assert int(ink.sum()) > int(np.all(base.image == np.array([0, 0, 255], dtype=np.uint8), axis=2).sum())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/synth/test_plotgen.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'plotgen'`.

- [ ] **Step 3: Write the generator**

Create `backend/tests/synth/plotgen.py`:

```python
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class AxisPoint:
    pixel: tuple[float, float]
    x_value: float | None = None
    y_value: float | None = None


@dataclass
class SynthPlot:
    image: np.ndarray
    pixel_of: Callable[[float, float], tuple[float, float]]
    data_of: Callable[[float, float], tuple[float, float]]
    axis_points: list[AxisPoint]
    truth: list[tuple[float, float]]


def _homography(
    width: float, height: float, rotation_deg: float, perspective: float | None
) -> np.ndarray:
    rotation = np.eye(3, dtype=np.float64)
    if rotation_deg:
        affine = cv2.getRotationMatrix2D((width / 2.0, height / 2.0), float(rotation_deg), 1.0)
        rotation[:2, :] = affine
    persp = np.eye(3, dtype=np.float64)
    if perspective:
        inset = float(perspective) * width
        src = np.array(
            [[0.0, 0.0], [width, 0.0], [width, height], [0.0, height]],
            dtype=np.float32,
        )
        dst = np.array(
            [[inset, 0.0], [width - inset, 0.0], [width, height], [0.0, height]],
            dtype=np.float32,
        )
        persp = cv2.getPerspectiveTransform(src, dst).astype(np.float64)
    return persp @ rotation


def _apply(matrix: np.ndarray, x: float, y: float) -> tuple[float, float]:
    vec = matrix @ np.array([x, y, 1.0], dtype=np.float64)
    if abs(vec[2]) < 1e-18:
        raise ValueError("degenerate transform")
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def _to_unit(val: float, lo: float, hi: float, log: bool) -> float:
    if log:
        return (math.log10(val) - math.log10(lo)) / (math.log10(hi) - math.log10(lo))
    return (val - lo) / (hi - lo)


def _from_unit(u: float, lo: float, hi: float, log: bool) -> float:
    if log:
        return float(10 ** (math.log10(lo) + u * (math.log10(hi) - math.log10(lo))))
    return float(lo + u * (hi - lo))


def _draw_polyline(
    img: np.ndarray,
    pts: list[tuple[float, float]],
    color: tuple[int, int, int],
    width: int,
) -> None:
    if len(pts) < 2:
        return
    arr = np.array([[int(round(x)), int(round(y))] for x, y in pts], dtype=np.int32)
    cv2.polylines(img, [arr], False, color, thickness=int(width), lineType=cv2.LINE_8)


def render_plot(
    func: Callable[[float], float],
    *,
    x_range: tuple[float, float],
    y_range: tuple[float, float],
    size: tuple[int, int] = (800, 600),
    log_x: bool = False,
    log_y: bool = False,
    grid: tuple[int, int] | None = None,
    rotation_deg: float = 0.0,
    perspective: float | None = None,
    line_width: int = 2,
    line_color: tuple[int, int, int] = (0, 0, 255),
    markers: int | None = None,
    noise: float = 0.0,
    background: tuple[int, int, int] = (255, 255, 255),
) -> SynthPlot:
    width, height = int(size[0]), int(size[1])
    xmin, xmax = float(x_range[0]), float(x_range[1])
    ymin, ymax = float(y_range[0]), float(y_range[1])
    if log_x and (xmin <= 0 or xmax <= 0):
        raise ValueError("log_x requires x_range > 0")
    if log_y and (ymin <= 0 or ymax <= 0):
        raise ValueError("log_y requires y_range > 0")

    x0 = 0.12 * width
    x1 = width - x0
    y_top = 0.12 * height
    y_bot = height - y_top

    def plot_xy(x: float, y: float) -> tuple[float, float]:
        u = _to_unit(x, xmin, xmax, log_x)
        v = _to_unit(y, ymin, ymax, log_y)
        return x0 + u * (x1 - x0), y_bot - v * (y_bot - y_top)

    def data_xy(px: float, py: float) -> tuple[float, float]:
        u = (px - x0) / (x1 - x0)
        v = (y_bot - py) / (y_bot - y_top)
        return _from_unit(u, xmin, xmax, log_x), _from_unit(v, ymin, ymax, log_y)

    transform = _homography(float(width), float(height), rotation_deg, perspective)
    inverse = np.linalg.inv(transform)

    def pixel_of(x: float, y: float) -> tuple[float, float]:
        px, py = plot_xy(x, y)
        return _apply(transform, px, py)

    def data_of(px: float, py: float) -> tuple[float, float]:
        qx, qy = _apply(inverse, px, py)
        return data_xy(qx, qy)

    img = np.full((height, width, 3), background, dtype=np.uint8)
    grid_color = (200, 200, 200)
    if grid is not None:
        nx, ny = int(grid[0]), int(grid[1])
        for i in range(1, nx + 1):
            t = i / (nx + 1)
            x = x0 + t * (x1 - x0)
            p1 = (int(round(x)), int(round(y_top)))
            p2 = (int(round(x)), int(round(y_bot)))
            cv2.line(img, p1, p2, grid_color, 1, lineType=cv2.LINE_8)
        for j in range(1, ny + 1):
            t = j / (ny + 1)
            y = y_top + t * (y_bot - y_top)
            p1 = (int(round(x0)), int(round(y)))
            p2 = (int(round(x1)), int(round(y)))
            cv2.line(img, p1, p2, grid_color, 1, lineType=cv2.LINE_8)

    n = 400
    xs = (
        np.logspace(math.log10(xmin), math.log10(xmax), n)
        if log_x
        else np.linspace(xmin, xmax, n)
    )
    truth: list[tuple[float, float]] = []
    pts: list[tuple[float, float]] = []
    for raw_x in xs:
        x = float(raw_x)
        y = float(func(x))
        truth.append((x, y))
        if y < ymin or y > ymax:
            if pts:
                _draw_polyline(img, pts, line_color, line_width)
                pts = []
            continue
        pts.append(plot_xy(x, y))
    if pts:
        _draw_polyline(img, pts, line_color, line_width)

    if markers is not None:
        visible = [(x, y) for x, y in truth if ymin <= y <= ymax]
        if visible:
            radius = int(markers)
            idxs = np.linspace(0, len(visible) - 1, 12).astype(int)
            for i in idxs:
                px, py = plot_xy(*visible[int(i)])
                cv2.circle(
                    img,
                    (int(round(px)), int(round(py))),
                    radius,
                    line_color,
                    -1,
                    lineType=cv2.LINE_8,
                )

    if rotation_deg or perspective:
        img = cv2.warpPerspective(
            img,
            transform.astype(np.float32),
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=background,
        )

    if noise > 0:
        rng = np.random.default_rng(0)
        gauss = rng.normal(0.0, float(noise), img.shape)
        img = np.clip(img.astype(np.float64) + gauss, 0, 255).astype(np.uint8)

    axis_points = [
        AxisPoint(pixel=pixel_of(xmin, ymin), x_value=xmin, y_value=ymin),
        AxisPoint(pixel=pixel_of(xmax, ymin), x_value=xmax, y_value=ymin),
        AxisPoint(pixel=pixel_of(xmin, ymax), x_value=xmin, y_value=ymax),
        AxisPoint(pixel=pixel_of(xmax, ymax), x_value=xmax, y_value=ymax),
    ]
    return SynthPlot(
        image=img,
        pixel_of=pixel_of,
        data_of=data_of,
        axis_points=axis_points,
        truth=truth,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/synth/test_plotgen.py -v`

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add \
  backend/tests/synth/__init__.py \
  backend/tests/synth/plotgen.py \
  backend/tests/synth/test_plotgen.py
git commit -m "$(cat <<'EOF'
test: add analytic synthetic plot generator with exact ground truth

EOF
)"
```

---

### Task 3: Metrics harness and baselines

**Files:**
- Create: `backend/tests/metrics.py`
- Create: `backend/tests/reference/baselines/metrics.json`
- Create: `backend/tests/test_metrics.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: NumPy, pytest. Reads/writes `backend/tests/reference/baselines/metrics.json`.
- Produces:
  - `def rms_error(predicted: np.ndarray, truth: np.ndarray) -> float`
  - `def max_abs_error(predicted: np.ndarray, truth: np.ndarray) -> float`
  - `def mask_f1(pred: np.ndarray, truth: np.ndarray) -> float`
  - `def mask_recall(pred: np.ndarray, truth: np.ndarray) -> float`
  - `def assert_not_worse(name: str, value: float, *, lower_is_better: bool) -> None`
  - `def configure_baselines(*, update: bool, path: Path | None = None) -> None`
  - `def flush_baselines() -> None`
  - pytest option `--update-baselines` (store_true). On session finish, if the flag is set, rewrite `metrics.json` (sorted keys, 2-space indent, trailing newline).
  - Missing baseline name: **not a failure**; `assert_not_worse` records `value` in memory. With `--update-baselines` it is persisted. Existing name: fail if worse (`>` when `lower_is_better`, `<` otherwise).
  - Mask helpers treat any nonzero pixel as positive. Empty truth → recall `1.0`; empty pred and empty truth → F1 `1.0`.
  - Import: `from metrics import rms_error, max_abs_error, mask_f1, mask_recall, assert_not_worse, configure_baselines, flush_baselines`

- [ ] **Step 1: Write the failing tests and empty baseline file**

Create `backend/tests/reference/baselines/metrics.json`:

```json
{}
```

Create `backend/tests/test_metrics.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

import metrics


def test_rms_and_max_abs():
    predicted = np.array([1.0, 2.0, 3.0])
    truth = np.array([1.0, 2.0, 4.0])
    assert metrics.rms_error(predicted, truth) == pytest.approx((1.0 / 3.0) ** 0.5)
    assert metrics.max_abs_error(predicted, truth) == pytest.approx(1.0)


def test_mask_f1_and_recall():
    truth = np.array([[0, 255], [255, 0]], dtype=np.uint8)
    pred = np.array([[0, 255], [0, 0]], dtype=np.uint8)
    assert metrics.mask_recall(pred, truth) == pytest.approx(0.5)
    # tp=1, fp=0, fn=1 → precision 1, recall 0.5 → F1 = 2*1*0.5 / 1.5 = 2/3
    assert metrics.mask_f1(pred, truth) == pytest.approx(2.0 / 3.0)


def test_mask_empty_is_perfect():
    z = np.zeros((4, 4), dtype=np.uint8)
    assert metrics.mask_recall(z, z) == 1.0
    assert metrics.mask_f1(z, z) == 1.0


def test_missing_baseline_passes(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text("{}", encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        metrics.assert_not_worse("synth_rms", 0.12, lower_is_better=True)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_regression_fails_when_worse(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text('{"synth_rms": 0.10}\n', encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        with pytest.raises(AssertionError, match="synth_rms"):
            metrics.assert_not_worse("synth_rms", 0.25, lower_is_better=True)
        metrics.assert_not_worse("synth_rms", 0.05, lower_is_better=True)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_higher_is_better_regression(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text('{"mask_f1": 0.90}\n', encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        with pytest.raises(AssertionError, match="mask_f1"):
            metrics.assert_not_worse("mask_f1", 0.80, lower_is_better=False)
        metrics.assert_not_worse("mask_f1", 0.95, lower_is_better=False)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_update_baselines_persists(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text("{}", encoding="utf-8")
    metrics.configure_baselines(update=True, path=path)
    try:
        metrics.assert_not_worse("synth_rms", 0.05, lower_is_better=True)
        metrics.flush_baselines()
        stored = json.loads(path.read_text(encoding="utf-8"))
        assert stored["synth_rms"] == pytest.approx(0.05)
    finally:
        metrics.configure_baselines(update=False, path=None)
```

Do not create `metrics.py` yet. Do not modify `conftest.py` yet.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_metrics.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'metrics'`.

- [ ] **Step 3: Write `metrics.py`**

Create `backend/tests/metrics.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

_COMMITTED_PATH = Path(__file__).resolve().parent / "reference" / "baselines" / "metrics.json"
_PATH = _COMMITTED_PATH
_UPDATE = False
_BASELINES: dict[str, float] = {}


def configure_baselines(*, update: bool, path: Path | None = None) -> None:
    global _UPDATE, _BASELINES, _PATH
    _UPDATE = bool(update)
    _PATH = Path(path) if path is not None else _COMMITTED_PATH
    if _PATH.is_file():
        raw = json.loads(_PATH.read_text(encoding="utf-8"))
        _BASELINES = {str(k): float(v) for k, v in raw.items()}
    else:
        _BASELINES = {}


def flush_baselines() -> None:
    if not _UPDATE:
        return
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {k: _BASELINES[k] for k in sorted(_BASELINES)}
    _PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def rms_error(predicted: np.ndarray, truth: np.ndarray) -> float:
    predicted = np.asarray(predicted, dtype=np.float64)
    truth = np.asarray(truth, dtype=np.float64)
    diff = predicted - truth
    return float(np.sqrt(np.mean(diff * diff)))


def max_abs_error(predicted: np.ndarray, truth: np.ndarray) -> float:
    predicted = np.asarray(predicted, dtype=np.float64)
    truth = np.asarray(truth, dtype=np.float64)
    return float(np.max(np.abs(predicted - truth)))


def _binary(mask: np.ndarray) -> np.ndarray:
    return np.asarray(mask) != 0


def mask_recall(pred: np.ndarray, truth: np.ndarray) -> float:
    t = _binary(truth)
    p = _binary(pred)
    tp = np.logical_and(t, p).sum()
    fn = np.logical_and(t, np.logical_not(p)).sum()
    denom = int(tp + fn)
    return float(tp / denom) if denom else 1.0


def mask_f1(pred: np.ndarray, truth: np.ndarray) -> float:
    t = _binary(truth)
    p = _binary(pred)
    tp = float(np.logical_and(t, p).sum())
    fp = float(np.logical_and(np.logical_not(t), p).sum())
    fn = float(np.logical_and(t, np.logical_not(p)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    if precision + recall == 0:
        return 1.0
    return float(2.0 * precision * recall / (precision + recall))


def assert_not_worse(name: str, value: float, *, lower_is_better: bool) -> None:
    current = float(value)
    if name not in _BASELINES:
        _BASELINES[name] = current
        return
    baseline = float(_BASELINES[name])
    if lower_is_better:
        assert current <= baseline, f"{name}: {current} worse than baseline {baseline} (lower is better)"
    else:
        assert current >= baseline, f"{name}: {current} worse than baseline {baseline} (higher is better)"
    if _UPDATE:
        _BASELINES[name] = current
```

- [ ] **Step 4: Register `--update-baselines` in the root conftest**

Replace `backend/tests/conftest.py` with:

```python
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--update-baselines",
        action="store_true",
        default=False,
        help="Rewrite tests/reference/baselines/metrics.json from assert_not_worse values",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "reference: tests that read the optional Engauge corpus via PLOTDIG_REF_DIR",
    )
    from metrics import configure_baselines

    configure_baselines(update=config.getoption("--update-baselines"), path=None)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from metrics import flush_baselines

    flush_baselines()


@pytest.fixture(autouse=True)
def isolate_runtime_config(tmp_path, monkeypatch):
    """Keep pytest from overwriting last_session/."""
    from app.store.session_store import SessionStore

    last_session_dir = tmp_path / "last_session"
    sessions = SessionStore()

    for module in (
        "app.store.session_store",
        "app.api.sessions",
        "app.main",
    ):
        monkeypatch.setattr(f"{module}.session_store", sessions)

    import app.store.session_persistence as persistence

    monkeypatch.setattr(persistence, "LAST_SESSION_DIR", last_session_dir)
    monkeypatch.setattr(persistence, "SESSION_JSON", last_session_dir / "session.json")
    monkeypatch.setattr(persistence, "IMAGE_PATH", last_session_dir / "image.png")
```

Keep the existing `isolate_runtime_config` behaviour byte-for-byte aside from the new imports/hooks.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_metrics.py -v`

Expected: PASS.

Run: `cd backend && .venv/bin/pytest tests/test_metrics.py --update-baselines -v`

Expected: PASS. Because every `assert_not_worse` test restores `configure_baselines(update=False, path=None)` in `finally`, the committed `backend/tests/reference/baselines/metrics.json` must remain `{}`.

Run: `cd backend && PLOTDIG_REF_DIR=/no/such/engauge-digitizer .venv/bin/pytest -q`

Expected: PASS (reference tests skipped).

- [ ] **Step 6: Commit**

```bash
git add \
  backend/tests/metrics.py \
  backend/tests/reference/baselines/metrics.json \
  backend/tests/test_metrics.py \
  backend/tests/conftest.py
git commit -m "$(cat <<'EOF'
test: add precision metrics harness and --update-baselines

EOF
)"
```

---

### Task 4: Frontend test runner and parity harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/lib/__tests__/transform.test.ts`
- Create: `backend/tests/synth/gen_transform_vectors.py`
- Create: `frontend/src/lib/__fixtures__/transform-vectors.json`
- Modify: `UPDATES.md`
- Test: `frontend/src/lib/__tests__/transform.test.ts`; `cd frontend && npm test`; `cd frontend && npm run build`

**Interfaces:**
- Consumes: existing `frontend/src/lib/transform.ts` (`pixelToData`, `formatAxisValue`, `getAxisBounds`) and existing `backend/app/calibration/calibration.py` (`pixel_to_data`). No corpus. No new runtime dependency.
- Produces:
  - npm script `"test": "vitest run"`
  - Vitest config inside `frontend/vite.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, **`globals: false`**. No jsdom (not permitted).
  - **Typing approach (explicit imports, not ambient globals).** Every test file imports `{ describe, it, expect } from 'vitest'`. Do **not** add `"vitest/globals"` to `tsconfig.app.json` `compilerOptions.types` (that would leak Vitest names into the whole app). Do **not** exclude `*.test.ts` from `tsconfig.app.json`. Today's `frontend/tsconfig.json` is a solution-style project (`tsc -b`) referencing `tsconfig.app.json` (`include: ["src"]`, `types: ["vite/client"]`) and `tsconfig.node.json` (`include: ["vite.config.ts"]`, `types: ["node"]`). Tests under `src/lib/__tests__/` stay inside the app program, so `npm run build` (`tsc -b && vite build`) typechecks them. `verbatimModuleSyntax` already requires those explicit imports.
  - `def build_vectors() -> dict` and `def write_vectors(path: Path | None = None) -> Path` in `backend/tests/synth/gen_transform_vectors.py`
  - committed fixture `frontend/src/lib/__fixtures__/transform-vectors.json` with shape:
    `{ "generated_by": "backend/tests/synth/gen_transform_vectors.py", "tolerance": 1e-9, "cases": [ { "name": str, "calibration": CalibrationJSON, "samples": [ { "pixel": [x, y], "data": [x, y] } ] } ] }`
    where `CalibrationJSON` matches today's TypeScript `Calibration` (`x`/`y` `{scale, ref_points: [{pixel, value}]}`, `source: "manual"`).
  - Vitest asserts `pixelToData(cal, pixel)` agrees with each fixture `data` to `1e-9`.
  - **Phase 1 extends this fixture** with affine / projective / polar vectors once those solvers exist. Phase 0 only establishes the mechanism with today's orthogonal (independent 1D) mapping.

- [ ] **Step 1: Write the failing unit + parity tests (Vitest not installed yet)**

Create `frontend/src/lib/__tests__/transform.test.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import { formatAxisValue, getAxisBounds, pixelToData } from '../transform'

const linearCal: Calibration = {
  x: {
    scale: 'linear',
    ref_points: [
      { pixel: [100, 400], value: 0 },
      { pixel: [500, 400], value: 10 },
    ],
  },
  y: {
    scale: 'linear',
    ref_points: [
      { pixel: [100, 400], value: 0 },
      { pixel: [100, 100], value: 5 },
    ],
  },
  source: 'manual',
}

describe('pixelToData (orthogonal, existing mapping)', () => {
  it('maps the midpoint of the linear fixture', () => {
    const data = pixelToData(linearCal, [300, 250])
    expect(data[0]).toBeCloseTo(5, 12)
    expect(data[1]).toBeCloseTo(2.5, 12)
  })

  it('maps log X the same way as 10 ** (slope * px + intercept)', () => {
    const cal: Calibration = {
      x: {
        scale: 'log',
        ref_points: [
          { pixel: [100, 400], value: 1 },
          { pixel: [500, 400], value: 100 },
        ],
      },
      y: linearCal.y,
      source: 'manual',
    }
    const data = pixelToData(cal, [300, 250])
    expect(data[0]).toBeCloseTo(10, 12)
    expect(data[1]).toBeCloseTo(2.5, 12)
  })
})

describe('getAxisBounds / formatAxisValue', () => {
  it('returns extreme-pixel bounds', () => {
    const bounds = getAxisBounds(linearCal)
    expect(bounds).not.toBeNull()
    expect(bounds!.xmin.value).toBe(0)
    expect(bounds!.xmax.value).toBe(10)
    expect(bounds!.ymin.value).toBe(0)
    expect(bounds!.ymax.value).toBe(5)
  })

  it('formats numbers without throwing', () => {
    expect(formatAxisValue(12.5)).toBe('12.5')
    expect(formatAxisValue(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('Python ↔ TS orthogonal parity fixture', () => {
  it('agrees with committed vectors to 1e-9', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const fixturePath = join(here, '..', '__fixtures__', 'transform-vectors.json')
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      tolerance: number
      cases: Array<{
        name: string
        calibration: Calibration
        samples: Array<{ pixel: [number, number]; data: [number, number] }>
      }>
    }
    expect(payload.cases.length).toBeGreaterThan(0)
    for (const cse of payload.cases) {
      for (const sample of cse.samples) {
        const got = pixelToData(cse.calibration, sample.pixel)
        expect(got[0], cse.name).toBeCloseTo(sample.data[0], 9)
        expect(got[1], cse.name).toBeCloseTo(sample.data[1], 9)
      }
    }
  })
})
```

Do not install vitest yet. Do not write the fixture yet.

- [ ] **Step 2: Run the test command to verify it fails**

Run: `cd frontend && npm test`

Expected: FAIL because `package.json` has no `"test"` script (`Missing script: "test"`).

- [ ] **Step 3: Install Vitest, add the script, and configure Vite**

Run:

```bash
cd frontend && npm install -D vitest @vitest/coverage-v8
```

In `frontend/package.json`, add `"test": "vitest run"` next to the existing scripts. After install, `devDependencies` must contain `vitest` and `@vitest/coverage-v8` and no other new packages.

Replace the import and config in `frontend/vite.config.ts` so the file is:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Missing hashed bundles must 404 — SPA fallback serving HTML breaks the app silently. */
function asset404Plugin(): Plugin {
  return {
    name: 'asset-404',
    configurePreviewServer(server) {
      const dist = path.resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/assets/')) {
          next()
          return
        }
        const file = path.join(dist, url)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), asset404Plugin()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
  optimizeDeps: {
    include: ['react-plotly.js', 'plotly.js/dist/plotly'],
  },
  server: {
    port: 5173,
    proxy: {
      '/sessions': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    proxy: {
      '/sessions': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
```

Do **not** edit `frontend/tsconfig.app.json`. It already `include`s `src` (so `src/lib/__tests__/transform.test.ts` is in the `tsc -b` program) and sets `types: ["vite/client"]` only. Leave that as-is. `tsconfig.node.json` already typechecks `vite.config.ts` (the new `vitest/config` import resolves from the installed `vitest` package).

- [ ] **Step 4: Run unit tests; expect the parity case to fail on a missing fixture**

Run: `cd frontend && npm test`

Expected: the `pixelToData` / `getAxisBounds` / `formatAxisValue` tests PASS; `agrees with committed vectors to 1e-9` FAIL with `ENOENT` for `transform-vectors.json` (or a JSON parse error if you accidentally created an empty file). Do not hand-write the JSON.

- [ ] **Step 5: Write the generator and emit the fixture**

Create `backend/tests/synth/gen_transform_vectors.py`:

```python
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Literal

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.calibration.calibration import pixel_to_data  # noqa: E402
from app.models.schemas import Calibration, CalibrationAxis, RefPoint  # noqa: E402

Scale = Literal["linear", "log"]

DEFAULT_OUT = REPO / "frontend" / "src" / "lib" / "__fixtures__" / "transform-vectors.json"


def _cal(
    x_scale: Scale,
    y_scale: Scale,
    x_vals: tuple[float, float],
    y_vals: tuple[float, float],
) -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale=x_scale,
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=x_vals[0]),
                RefPoint(pixel=(500.0, 400.0), value=x_vals[1]),
            ],
        ),
        y=CalibrationAxis(
            scale=y_scale,
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=y_vals[0]),
                RefPoint(pixel=(100.0, 100.0), value=y_vals[1]),
            ],
        ),
        source="manual",
    )


def _dump_cal(cal: Calibration) -> dict:
    return {
        "x": {
            "scale": cal.x.scale,
            "ref_points": [{"pixel": list(p.pixel), "value": p.value} for p in cal.x.ref_points],
        },
        "y": {
            "scale": cal.y.scale,
            "ref_points": [{"pixel": list(p.pixel), "value": p.value} for p in cal.y.ref_points],
        },
        "source": cal.source,
    }


def build_vectors() -> dict:
    pixels = [(100.0, 400.0), (300.0, 250.0), (500.0, 100.0), (220.0, 310.0), (480.0, 180.0)]
    specs = [
        ("linear_orthogonal", "linear", "linear", (0.0, 10.0), (0.0, 5.0)),
        ("log_x_linear_y", "log", "linear", (1.0, 100.0), (0.0, 5.0)),
        ("linear_x_log_y", "linear", "log", (0.0, 10.0), (1.0, 100.0)),
        ("log_log", "log", "log", (1.0, 1000.0), (0.1, 10.0)),
    ]
    cases = []
    for name, x_scale, y_scale, x_vals, y_vals in specs:
        cal = _cal(x_scale, y_scale, x_vals, y_vals)
        samples = []
        for pixel in pixels:
            data = pixel_to_data(cal, pixel)
            samples.append({"pixel": [pixel[0], pixel[1]], "data": [data[0], data[1]]})
        cases.append({"name": name, "calibration": _dump_cal(cal), "samples": samples})
    return {
        "generated_by": "backend/tests/synth/gen_transform_vectors.py",
        "tolerance": 1e-9,
        "note": (
            "Synthetic orthogonal (independent 1D) mapping only. "
            "Phase 1 extends this fixture with affine/projective/polar vectors. "
            "Never derived from PLOTDIG_REF_DIR."
        ),
        "cases": cases,
    }


def write_vectors(path: Path | None = None) -> Path:
    out = Path(path) if path is not None else DEFAULT_OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = build_vectors()
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    written = write_vectors()
    print(f"wrote {written}")
```

Run: `cd backend && .venv/bin/python tests/synth/gen_transform_vectors.py`

Expected: prints `wrote .../frontend/src/lib/__fixtures__/transform-vectors.json`. The file must contain four cases and must not mention any Engauge path or corpus stem.

- [ ] **Step 6: Re-run Vitest; expect pass**

Run: `cd frontend && npm test`

Expected: PASS, including the parity describe.

- [ ] **Step 7: Prove the parity tests typecheck under the production build**

Run: `cd frontend && npm run build`

Expected: `tsc -b` exits 0 (no type errors in `src/lib/__tests__/transform.test.ts` or `vite.config.ts`), then `vite build` writes `frontend/dist/`. A type error in a parity test must fail this command — that is the point of keeping tests inside `tsconfig.app.json`'s `include: ["src"]`.

- [ ] **Step 8: Confirm backend suite still passes**

Run: `cd backend && PLOTDIG_REF_DIR=/no/such/engauge-digitizer .venv/bin/pytest -q`

Expected: PASS.

- [ ] **Step 9: UPDATES.md for the completed phase**

Insert this entry at the top of the Changelog in `UPDATES.md` (immediately under `## Changelog`), bumping `2.2.2` → `2.2.3`:

```markdown
## [2.2.3] — 2026-09-04
### Added
- **Precision-toolkit test foundation (Phase 0):** Engauge reference-corpus parser
  (`backend/tests/reference/`, optional `PLOTDIG_REF_DIR`, never vendored), analytic
  synthetic plot generator (`backend/tests/synth/plotgen.py`), metrics/baseline harness
  with `--update-baselines`, and frontend Vitest plus a committed orthogonal
  Python↔TS transform-parity fixture.
```

Do not change `README.md`.

- [ ] **Step 10: Commit**

```bash
git add \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/vite.config.ts \
  frontend/src/lib/__tests__/transform.test.ts \
  frontend/src/lib/__fixtures__/transform-vectors.json \
  backend/tests/synth/gen_transform_vectors.py \
  UPDATES.md
git commit -m "$(cat <<'EOF'
test: add vitest runner and orthogonal transform parity fixture

EOF
)"
```

---

## Self-Review

**1. Spec coverage.** Phase 0 in spec §11 is this plan. §10.1 `SynthPlot` / `render_plot` → Task 2. §10.2 `ReferenceDoc` / `ReferenceAxisPoint` / `load_doc` / `iter_docs` / `sample_image` plus the measured corpus facts → Task 1. §10.3 metrics + `metrics.json` + `--update-baselines` → Task 3. §10.4 frontend parity mechanism and constraint 6/7 vitest allowance → Task 4. Constraint 2 skip behaviour is tested in Task 1 with `PLOTDIG_REF_DIR=/no/such/...`. Production modules in spec §5.4 / §6 / §7 / §8 / §9 are Phase 1–4 by design and are not in this plan. Acceptance numeric gates in §10.4 (affine 0.2 %, grid F1, …) are recorded by later phases into the empty `metrics.json` this phase creates.

**2. Placeholder scan.** No TBD/TODO, no “add error handling”, no “similar to Task N”, no prose-only code steps. `grid`, `perspective`, and `markers` are given concrete types (the spec left them as `=None`).

**3. Type consistency.** `ReferenceDoc` / `ReferenceAxisPoint` field lists match spec §10.2. `SynthPlot` / `render_plot` match spec §10.1. Metrics names match spec §10.3. `pixel_of(x, y)` / `data_of(px, py)` are two-float callables as spec’d. Test-local `AxisPoint` uses `pixel` / `x_value` / `y_value` so Phase 1 can swap the import to `app.models.schemas.AxisPoint` without renaming fields (`id` is the only later addition). Parity fixture `calibration` matches today’s TS `Calibration`, not the Phase 1 extended model. Task 4 keeps `src/**/*.test.ts` inside `tsconfig.app.json` (`include: ["src"]`) and typechecks them via `npm run build` (`tsc -b`); tests import `describe`/`it`/`expect` from `vitest` with Vitest `globals: false`. Polar inventory asserts the four named polar-with-axis-points docs, not a raw polar total.
