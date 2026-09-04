# Precision Toolkit Phase 1: Calibration Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PlotDigitizer's per-axis 1D fit with a 2D transform solver (orthogonal / affine / projective, plus `auto`) and cartesian / polar / map adapters, keeping four-bound sessions numerically identical to 1e-12.

**Architecture:** One solver (`calibration/transform.py`) maps pixel → linear graph space `(u, v)` from `Constraint`s. Thin adapters in `calibration/coords.py` convert `(u, v)` into the user's coordinate system. `calibration.py` becomes a facade so every existing import keeps working. TypeScript `lib/transform2d.ts` mirrors the Python maths; the UI grows a coordinate-system selector, precise axis-point placement, an axes-checker overlay, a resolution readout, and a single `CanvasMode` union that replaces `addPointMode`.

**Tech Stack:** Python 3 + NumPy `lstsq` + Pydantic v2 + pytest (backend); React + TypeScript + Konva + vitest (frontend). No SciPy, no new runtime dependencies.

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
8. **Docs.** `UPDATES.md` gets one new top entry per completed phase with a version bump
   (feature → `subver`). `README.md` changes only when architecture changes. No other
   markdown files may be created.
9. **No commits to `master`.** All work happens on a feature branch / worktree. Never
   `git push`, never merge, without the user's explicit request.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/schemas.py` | Modify | `CoordsType`, `ThetaUnits`, `TransformModel`, `AxisPoint`, `ScaleBar`, new `Calibration` fields; later `WorkspaceState.canvas_mode` / `show_axes_checker` |
| `backend/app/calibration/transform.py` | Create | `CalibrationError`, `Constraint`, `Transform2D`, `build_constraints`, `solve_transform` |
| `backend/app/calibration/coords.py` | Create | cartesian / polar / map adapters, `pixel_to_data`, `data_to_pixel`, `validate_calibration`, `resolution_at`, `axes_checker_polyline` |
| `backend/app/calibration/calibration.py` | Modify | Thin facade re-exporting today's public names |
| `backend/app/api/sessions.py` | Modify | Pass `CalibrationError.hint` through; persist `axis_points` via existing calibration / preferences routes (no new route) |
| `backend/app/export/project_io.py` | Unchanged behaviour | `model_dump()` already persists new Calibration fields |
| `backend/tests/test_calibration_schema.py` | Create | Schema defaults, old-payload validate, SessionPublic + project round-trip |
| `backend/tests/test_transform.py` | Create | Solver unit tests |
| `backend/tests/test_coords.py` | Create | Orthogonal 1e-12 oracle, affine/projective gates, checker/resolution |
| `backend/tests/test_polar.py` | Create | Polar adapter + 4 reference docs |
| `backend/tests/test_map.py` | Create | Map / scale-bar adapter |
| `backend/tests/reference/test_calibration_reference.py` | Create | 9 ground-truth docs vs expected CSV |
| `backend/tests/synth/gen_transform_vectors.py` | Modify | Emit affine/projective/polar/map vectors |
| `frontend/src/lib/__fixtures__/transform-vectors.json` | Modify | Extended parity fixture |
| `frontend/src/types.ts` | Modify | Mirror new schema |
| `frontend/src/lib/transform2d.ts` | Create | TS solver + three adapters |
| `frontend/src/lib/transform.ts` | Modify | Re-export mapping through `transform2d.ts`; keep four-bound helpers |
| `frontend/src/lib/calibration.ts` | Modify | Defaults for new fields; axis-point / scale-bar helpers |
| `frontend/src/lib/axesChecker.ts` | Create | Overlay geometry, model label, resolution formatting, 3 s visibility |
| `frontend/src/lib/__tests__/transform2d.test.ts` | Create | 1e-9 parity vs fixture |
| `frontend/src/lib/__tests__/axesChecker.test.ts` | Create | Pure UI-helper tests (no DOM) |
| `frontend/src/components/CalibrationPanel.tsx` | Modify | Coords selector, precise mode, polar/map fields, model + resolution |
| `frontend/src/components/AxesCheckerOverlay.tsx` | Create | Konva polyline, 3 s auto-hide |
| `frontend/src/components/EditorCanvas.tsx` | Modify | Delete `addPointMode`; required `canvasMode: CanvasMode`; `axis` clicks; overlay host |
| `frontend/src/components/CurveList.tsx` | Modify | Delete `addPointMode` / `onAddPointModeChange`; Place-points toggles `'place'` ↔ `'select'` |
| `frontend/src/App.tsx` | Modify | Single `useState<CanvasMode>`; Precise/polar/map placement; persist via preferences |
| `README.md` / `UPDATES.md` | Modify | Architecture note + version bump `2.2.2` → `2.3.0` |

Phase 0 already provides `tests/synth/plotgen.py`, `tests/metrics.py`, `tests/reference/refcorpus.py`, `tests/reference/conftest.py`, vitest, and orthogonal-only `transform-vectors.json`. Do not re-implement those. `plotgen.AxisPoint` stays a test-local dataclass permanently; Phase 1 converts to `schemas.AxisPoint` at each call site (Pydantic v2 will not accept the dataclass).

**Not in this phase (Phase 4):** CSV header rename (`theta,R` / units line) and Plotly `scatterpolar` preview. `pixel_to_data` already returns polar `(θ, R)` / map units; headers stay `x,y` until Phase 4.

**Not in this phase:** `ColorFilter`, `ConnectAs`, `show_mask`, segment/point-match workspace fields.

---

### Task 1: Schema additions

**Files:**
- Create: `backend/tests/test_calibration_schema.py`
- Modify: `backend/app/models/schemas.py`
- Test: `backend/tests/test_calibration_schema.py`

**Interfaces:**
- Consumes: existing `Calibration`, `CalibrationAxis`, `RefPoint`, `Session`, `SessionPublic`, `export_project_json`, `load_project_from_text`
- Produces:
  - `CoordsType = Literal["cartesian", "polar", "map"]`
  - `ThetaUnits = Literal["degrees", "radians", "gradians", "turns"]`
  - `TransformModel = Literal["auto", "orthogonal", "affine", "projective"]`
  - `class AxisPoint(BaseModel): id: str; pixel: tuple[float, float]; x_value: float | None = None; y_value: float | None = None`
  - `class ScaleBar(BaseModel): pixel_a: tuple[float, float]; pixel_b: tuple[float, float]; length: float; units: str = ""`
  - `Calibration` gains optional `coords_type: CoordsType = "cartesian"`, `model: TransformModel = "auto"`, `axis_points: list[AxisPoint] = []`, `theta_units: ThetaUnits = "degrees"`, `origin_radius: float = 0.0`, `scale_bar: ScaleBar | None = None`
  - Existing `x`, `y`, `source` fields unchanged

- [ ] **Step 1: Create the feature branch (do not commit on `master`)**

```bash
cd /home/valentin/Projects/PlotDigitizer
git checkout -b feat/precision-toolkit-phase1-calibration
```

If the branch already exists, check it out. Never commit these tasks on `master`.

- [ ] **Step 2: Write the failing schema tests**

Create `backend/tests/test_calibration_schema.py`:

```python
from __future__ import annotations

import io
import json

from PIL import Image
from pydantic import ValidationError

from app.export.project_io import export_project_json, load_project_from_text
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    Curve,
    ImageMeta,
    Point,
    RefPoint,
    ScaleBar,
    Session,
    SessionPublic,
)


def _old_payload() -> dict:
    return {
        "x": {
            "scale": "linear",
            "ref_points": [
                {"pixel": [100.0, 400.0], "value": 0.0},
                {"pixel": [500.0, 400.0], "value": 10.0},
            ],
        },
        "y": {
            "scale": "log",
            "ref_points": [
                {"pixel": [100.0, 400.0], "value": 0.1},
                {"pixel": [100.0, 100.0], "value": 10.0},
            ],
        },
        "source": "manual",
    }


def _tiny_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_old_payload_still_validates():
    cal = Calibration.model_validate(_old_payload())
    assert cal.x.scale == "linear"
    assert cal.y.scale == "log"
    assert cal.source == "manual"
    assert len(cal.x.ref_points) == 2
    assert cal.x.ref_points[0].pixel == (100.0, 400.0)


def test_defaults_reproduce_today():
    cal = Calibration.model_validate(_old_payload())
    assert cal.coords_type == "cartesian"
    assert cal.model == "auto"
    assert cal.axis_points == []
    assert cal.theta_units == "degrees"
    assert cal.origin_radius == 0.0
    assert cal.scale_bar is None


def test_new_fields_round_trip_session_public():
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 10.0), value=0.0),
                RefPoint(pixel=(100.0, 10.0), value=1.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 10.0), value=0.0),
                RefPoint(pixel=(0.0, 0.0), value=1.0),
            ],
        ),
        coords_type="polar",
        model="affine",
        axis_points=[
            AxisPoint(id="ap1", pixel=(50.0, 50.0), x_value=0.0, y_value=1.0),
            AxisPoint(id="ap2", pixel=(80.0, 50.0), x_value=90.0, y_value=2.0),
        ],
        theta_units="gradians",
        origin_radius=0.25,
        scale_bar=ScaleBar(
            pixel_a=(1.0, 2.0),
            pixel_b=(11.0, 2.0),
            length=5.0,
            units="km",
        ),
    )
    public = SessionPublic(
        id="sess-1",
        image_meta=ImageMeta(width=100, height=80, scale_factor=1.0),
        calibration=cal,
        curves=[],
        history=[],
        image_url="/sessions/sess-1/image",
    )
    restored = SessionPublic.model_validate(public.model_dump())
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "polar"
    assert restored.calibration.model == "affine"
    assert restored.calibration.theta_units == "gradians"
    assert restored.calibration.origin_radius == 0.25
    assert restored.calibration.axis_points[0].id == "ap1"
    assert restored.calibration.axis_points[0].pixel == (50.0, 50.0)
    assert restored.calibration.axis_points[1].y_value == 2.0
    assert restored.calibration.scale_bar is not None
    assert restored.calibration.scale_bar.units == "km"
    assert restored.calibration.scale_bar.length == 5.0


def test_new_fields_round_trip_project_io():
    cal = Calibration.model_validate(_old_payload())
    cal = cal.model_copy(
        update={
            "coords_type": "map",
            "model": "orthogonal",
            "axis_points": [
                AxisPoint(pixel=(3.0, 4.0), x_value=1.0, y_value=None),
            ],
            "theta_units": "turns",
            "origin_radius": 1.5,
            "scale_bar": ScaleBar(
                pixel_a=(0.0, 0.0),
                pixel_b=(10.0, 0.0),
                length=100.0,
                units="m",
            ),
        }
    )
    session = Session(
        image_meta=ImageMeta(width=4, height=4, scale_factor=1.0),
        calibration=cal,
        curves=[Curve(label="A", points=[Point(pixel=(1.0, 1.0), origin="user")])],
    )
    exported = export_project_json(session, image_bytes=_tiny_png())
    payload = json.loads(exported)
    assert payload["calibration"]["coords_type"] == "map"
    assert payload["calibration"]["model"] == "orthogonal"
    assert payload["calibration"]["theta_units"] == "turns"
    assert payload["calibration"]["origin_radius"] == 1.5
    assert payload["calibration"]["scale_bar"]["length"] == 100.0
    assert payload["calibration"]["axis_points"][0]["x_value"] == 1.0
    assert payload["calibration"]["axis_points"][0]["y_value"] is None
    loaded, _image = load_project_from_text(exported)
    assert loaded.calibration is not None
    assert loaded.calibration.coords_type == "map"
    assert loaded.calibration.model == "orthogonal"
    assert loaded.calibration.theta_units == "turns"
    assert loaded.calibration.origin_radius == 1.5
    assert loaded.calibration.scale_bar is not None
    assert loaded.calibration.scale_bar.units == "m"
    assert loaded.calibration.axis_points[0].x_value == 1.0
    assert loaded.calibration.axis_points[0].y_value is None


def test_axis_point_partial_values_allowed():
    pt = AxisPoint(pixel=(1.0, 2.0), x_value=3.0, y_value=None)
    assert pt.y_value is None
    assert pt.id  # uuid assigned


def test_invalid_coords_type_rejected():
    payload = _old_payload()
    payload["coords_type"] = "spherical"
    try:
        Calibration.model_validate(payload)
        raised = False
    except ValidationError:
        raised = True
    assert raised
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_calibration_schema.py -v`

Expected: FAIL with `ImportError` (`AxisPoint` / `ScaleBar` cannot be imported from `app.models.schemas`) or `AttributeError` on `cal.coords_type`.

- [ ] **Step 4: Add the schema types and Calibration fields**

In `backend/app/models/schemas.py`, immediately after the existing `CalibrationSource` alias, add:

```python
CoordsType = Literal["cartesian", "polar", "map"]
ThetaUnits = Literal["degrees", "radians", "gradians", "turns"]
TransformModel = Literal["auto", "orthogonal", "affine", "projective"]
```

Immediately before `class Calibration`, add:

```python
class AxisPoint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    pixel: tuple[float, float]
    x_value: float | None = None  # cartesian X, or polar θ
    y_value: float | None = None  # cartesian Y, or polar R


class ScaleBar(BaseModel):
    pixel_a: tuple[float, float]
    pixel_b: tuple[float, float]
    length: float
    units: str = ""
```

Replace `class Calibration` with:

```python
class Calibration(BaseModel):
    x: CalibrationAxis
    y: CalibrationAxis
    source: CalibrationSource = "manual"
    coords_type: CoordsType = "cartesian"
    model: TransformModel = "auto"
    axis_points: list[AxisPoint] = Field(default_factory=list)
    theta_units: ThetaUnits = "degrees"
    origin_radius: float = 0.0
    scale_bar: ScaleBar | None = None
```

Do not add `ColorFilter` / `ConnectAs` / extra `WorkspaceState` fields in this task.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_calibration_schema.py tests/test_calibration.py tests/test_project.py tests/test_preferences.py tests/test_export.py -v`

Expected: PASS. Old four-bound payloads still construct `Calibration`; project load of fixtures without the new keys still works because of defaults.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/tests/test_calibration_schema.py
git commit -m "$(cat <<'EOF'
feat: add optional 2D calibration schema fields

EOF
)"
```

---

### Task 2: Transform solver core

**Files:**
- Create: `backend/app/calibration/transform.py`
- Create: `backend/tests/test_transform.py`
- Test: `backend/tests/test_transform.py`

**Interfaces:**
- Consumes: `Calibration`, `AxisPoint`, `TransformModel`, `CoordsType`, `ThetaUnits` from Task 1; NumPy `lstsq`
- Produces:
  - `class CalibrationError(ValueError): def __init__(self, message: str, hint: str = "") -> None`
  - `@dataclass(frozen=True) class Constraint: pixel: tuple[float, float]; axis: Literal["u", "v"]; value: float`
  - `@dataclass(frozen=True) class Transform2D: model: TransformModel; matrix: np.ndarray  # 3x3 homogeneous, pixel → (u, v, w)`
  - `Transform2D.to_linear(self, pixel: tuple[float, float]) -> tuple[float, float]`
  - `Transform2D.from_linear(self, uv: tuple[float, float]) -> tuple[float, float]`
  - `def build_constraints(cal: Calibration) -> list[Constraint]`
  - `def solve_transform(constraints: list[Constraint], model: TransformModel = "auto") -> Transform2D`
  - Orthogonal: `u = a·px + c`, `v = e·py + f` (4 unknowns). Affine: 6 unknowns. Projective: 8 unknowns, DLT, ≥4 full points. `model="auto"` tries projective → affine → orthogonal. Degenerate systems raise `CalibrationError` with `.hint`. Log axes: `Constraint.value` is already `log10` of the pinned value. Polar axis points become a full `(u, v)` pair (see implementation). Map calibrations do not go through this solver.

- [ ] **Step 1: Write the failing solver tests**

Create `backend/tests/test_transform.py`:

```python
from __future__ import annotations

import math

import numpy as np
import pytest

from app.calibration.transform import (
    CalibrationError,
    Constraint,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    RefPoint,
)


def _apply_h(H: np.ndarray, pixel: tuple[float, float]) -> tuple[float, float]:
    vec = H @ np.array([pixel[0], pixel[1], 1.0], dtype=np.float64)
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def test_orthogonal_recovers_known_mapping():
    # u = 0.05 * px - 5, v = -0.02 * py + 8
    constraints = [
        Constraint(pixel=(100.0, 400.0), axis="u", value=0.0),
        Constraint(pixel=(500.0, 400.0), axis="u", value=20.0),
        Constraint(pixel=(100.0, 400.0), axis="v", value=0.0),
        Constraint(pixel=(100.0, 100.0), axis="v", value=6.0),
    ]
    t = solve_transform(constraints, model="orthogonal")
    assert t.model == "orthogonal"
    u, v = t.to_linear((300.0, 250.0))
    assert u == pytest.approx(10.0, abs=1e-12)
    assert v == pytest.approx(3.0, abs=1e-12)
    px, py = t.from_linear((10.0, 3.0))
    assert px == pytest.approx(300.0, abs=1e-9)
    assert py == pytest.approx(250.0, abs=1e-9)


def test_affine_recovers_known_mapping():
    # u = 0.04*px + 0.01*py + 1, v = -0.02*px + 0.05*py - 2
    def uv(px: float, py: float) -> tuple[float, float]:
        return 0.04 * px + 0.01 * py + 1.0, -0.02 * px + 0.05 * py - 2.0

    pixels = [(10.0, 20.0), (80.0, 15.0), (30.0, 90.0), (60.0, 70.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = uv(*p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="affine")
    assert t.model == "affine"
    for p in pixels + [(45.0, 40.0)]:
        got = t.to_linear(p)
        exp = uv(*p)
        assert got[0] == pytest.approx(exp[0], abs=1e-10)
        assert got[1] == pytest.approx(exp[1], abs=1e-10)
        back = t.from_linear(got)
        assert back[0] == pytest.approx(p[0], abs=1e-8)
        assert back[1] == pytest.approx(p[1], abs=1e-8)


def test_projective_recovers_known_homography():
    H = np.array(
        [
            [1.2, 0.15, 4.0],
            [-0.08, 0.9, 3.0],
            [0.0004, -0.0003, 1.0],
        ],
        dtype=np.float64,
    )
    pixels = [(0.0, 0.0), (200.0, 10.0), (15.0, 180.0), (190.0, 170.0), (90.0, 80.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = _apply_h(H, p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="projective")
    assert t.model == "projective"
    for p in pixels:
        got = t.to_linear(p)
        exp = _apply_h(H, p)
        assert got[0] == pytest.approx(exp[0], rel=1e-8, abs=1e-8)
        assert got[1] == pytest.approx(exp[1], rel=1e-8, abs=1e-8)


def test_auto_selects_projective_when_four_full_points():
    H = np.array(
        [[1.1, 0.2, 2.0], [0.05, 1.3, 1.0], [0.0005, 0.0002, 1.0]],
        dtype=np.float64,
    )
    pixels = [(0.0, 0.0), (100.0, 0.0), (0.0, 80.0), (90.0, 70.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = _apply_h(H, p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="auto")
    assert t.model == "projective"


def test_auto_selects_affine_when_three_full_noncollinear():
    def uv(px: float, py: float) -> tuple[float, float]:
        return 0.1 * px + 0.02 * py, 0.03 * px + 0.2 * py + 1.0

    pixels = [(0.0, 0.0), (50.0, 5.0), (10.0, 40.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = uv(*p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="auto")
    assert t.model == "affine"


def test_auto_selects_orthogonal_from_axis_aligned_bounds():
    constraints = [
        Constraint(pixel=(0.0, 10.0), axis="u", value=0.0),
        Constraint(pixel=(100.0, 10.0), axis="u", value=5.0),
        Constraint(pixel=(0.0, 10.0), axis="v", value=1.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=3.0),
    ]
    t = solve_transform(constraints, model="auto")
    assert t.model == "orthogonal"


def test_collinear_affine_raises():
    constraints = [
        Constraint(pixel=(0.0, 0.0), axis="u", value=0.0),
        Constraint(pixel=(10.0, 10.0), axis="u", value=1.0),
        Constraint(pixel=(20.0, 20.0), axis="u", value=2.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(10.0, 10.0), axis="v", value=1.0),
        Constraint(pixel=(20.0, 20.0), axis="v", value=2.0),
    ]
    with pytest.raises(CalibrationError) as exc:
        solve_transform(constraints, model="affine")
    assert exc.value.hint


def test_projective_three_collinear_raises():
    constraints = [
        Constraint(pixel=(0.0, 0.0), axis="u", value=0.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(10.0, 0.0), axis="u", value=1.0),
        Constraint(pixel=(10.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(20.0, 0.0), axis="u", value=2.0),
        Constraint(pixel=(20.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(5.0, 0.0), axis="u", value=0.5),
        Constraint(pixel=(5.0, 0.0), axis="v", value=0.0),
    ]
    with pytest.raises(CalibrationError) as exc:
        solve_transform(constraints, model="projective")
    assert exc.value.hint


def test_too_few_constraints_raises():
    with pytest.raises(CalibrationError):
        solve_transform(
            [Constraint(pixel=(0.0, 0.0), axis="u", value=0.0)],
            model="orthogonal",
        )


def test_build_constraints_from_ref_points_linear():
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(500.0, 400.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(100.0, 100.0), value=5.0),
            ],
        ),
    )
    cons = build_constraints(cal)
    u_vals = sorted(c.value for c in cons if c.axis == "u")
    v_vals = sorted(c.value for c in cons if c.axis == "v")
    assert u_vals == [0.0, 10.0]
    assert v_vals == [0.0, 5.0]


def test_build_constraints_log_space():
    cal = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 10.0), value=1.0),
                RefPoint(pixel=(100.0, 10.0), value=100.0),
            ],
        ),
        y=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 100.0), value=0.1),
                RefPoint(pixel=(10.0, 10.0), value=10.0),
            ],
        ),
    )
    cons = build_constraints(cal)
    u_vals = sorted(c.value for c in cons if c.axis == "u")
    v_vals = sorted(c.value for c in cons if c.axis == "v")
    assert u_vals[0] == pytest.approx(0.0)
    assert u_vals[1] == pytest.approx(2.0)
    assert v_vals[0] == pytest.approx(-1.0)
    assert v_vals[1] == pytest.approx(1.0)


def test_build_constraints_log_rejects_non_positive():
    cal = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 10.0), value=1.0),
                RefPoint(pixel=(100.0, 10.0), value=0.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 100.0), value=0.0),
                RefPoint(pixel=(0.0, 10.0), value=1.0),
            ],
        ),
    )
    with pytest.raises(CalibrationError):
        build_constraints(cal)


def test_axis_points_are_sole_source_when_non_empty():
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=999.0),
                RefPoint(pixel=(1.0, 0.0), value=998.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=997.0),
                RefPoint(pixel=(0.0, 1.0), value=996.0),
            ],
        ),
        axis_points=[
            AxisPoint(pixel=(10.0, 20.0), x_value=1.0, y_value=2.0),
            AxisPoint(pixel=(30.0, 20.0), x_value=3.0, y_value=None),
            AxisPoint(pixel=(10.0, 40.0), x_value=None, y_value=4.0),
        ],
    )
    cons = build_constraints(cal)
    assert len(cons) == 4
    assert all(c.value < 10.0 for c in cons)


def test_build_constraints_polar_full_pair():
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(140.0, 100.0), x_value=90.0, y_value=2.0),
        ],
    )
    cons = build_constraints(cal)
    by_pixel = {}
    for c in cons:
        by_pixel.setdefault(c.pixel, {})[c.axis] = c.value
    origin = by_pixel[(100.0, 100.0)]
    assert origin["u"] == pytest.approx(2.0)
    assert origin["v"] == pytest.approx(0.0)
    other = by_pixel[(140.0, 100.0)]
    assert other["u"] == pytest.approx(0.0, abs=1e-12)
    assert other["v"] == pytest.approx(2.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_transform.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.calibration.transform'`.

- [ ] **Step 3: Implement `backend/app/calibration/transform.py`**

Create `backend/app/calibration/transform.py` with this complete file:

```python
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.schemas import Calibration, TransformModel

_RANK_TOL = 1e-10
_COLLINEAR_AREA = 1e-6
_DENOM_TOL = 1e-15


class CalibrationError(ValueError):
    def __init__(self, message: str, hint: str = "") -> None:
        super().__init__(message)
        self.hint = hint


@dataclass(frozen=True)
class Constraint:
    pixel: tuple[float, float]
    axis: Literal["u", "v"]
    value: float


@dataclass(frozen=True)
class Transform2D:
    model: TransformModel
    matrix: np.ndarray

    def to_linear(self, pixel: tuple[float, float]) -> tuple[float, float]:
        vec = self.matrix @ np.array([pixel[0], pixel[1], 1.0], dtype=np.float64)
        w = float(vec[2])
        if abs(w) < _DENOM_TOL:
            raise CalibrationError(
                "Projective transform denominator is zero",
                hint="Move axis points off the vanishing line",
            )
        return float(vec[0] / w), float(vec[1] / w)

    def from_linear(self, uv: tuple[float, float]) -> tuple[float, float]:
        try:
            inv = np.linalg.inv(self.matrix)
        except np.linalg.LinAlgError as exc:
            raise CalibrationError(
                "Transform matrix is not invertible",
                hint="Add more non-collinear axis points",
            ) from exc
        vec = inv @ np.array([uv[0], uv[1], 1.0], dtype=np.float64)
        w = float(vec[2])
        if abs(w) < _DENOM_TOL:
            raise CalibrationError(
                "Inverse transform denominator is zero",
                hint="Move axis points off the vanishing line",
            )
        return float(vec[0] / w), float(vec[1] / w)


def _log_value(value: float, scale: str, axis_name: str) -> float:
    if scale == "log":
        if value <= 0:
            raise CalibrationError(
                f"{axis_name} log scale requires all reference values > 0",
                hint="Use linear scale or enter values greater than zero",
            )
        return math.log10(value)
    return float(value)


def _theta_to_radians(theta: float, units: str) -> float:
    if units == "degrees":
        return theta * math.pi / 180.0
    if units == "radians":
        return theta
    if units == "gradians":
        return theta * math.pi / 200.0
    if units == "turns":
        return theta * 2.0 * math.pi
    raise CalibrationError(f"Unknown theta units: {units}")


def _rho(radius: float, scale: str, origin_radius: float) -> float:
    if scale == "log":
        if radius <= 0:
            raise CalibrationError(
                "polar log radius requires all R values > 0",
                hint="Enter a positive radius",
            )
        return math.log10(radius)
    return float(radius) - float(origin_radius)


def build_constraints(cal: Calibration) -> list[Constraint]:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map calibrations do not use axis-point constraints",
            hint="Set a scale bar instead of axis points",
        )
    if cal.axis_points:
        if cal.coords_type == "polar":
            return _constraints_polar(cal)
        return _constraints_from_axis_points(cal)
    return _constraints_from_ref_points(cal)


def _constraints_from_ref_points(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for rp in cal.x.ref_points:
        out.append(
            Constraint(
                pixel=(float(rp.pixel[0]), float(rp.pixel[1])),
                axis="u",
                value=_log_value(float(rp.value), cal.x.scale, "x"),
            )
        )
    for rp in cal.y.ref_points:
        out.append(
            Constraint(
                pixel=(float(rp.pixel[0]), float(rp.pixel[1])),
                axis="v",
                value=_log_value(float(rp.value), cal.y.scale, "y"),
            )
        )
    if not out:
        raise CalibrationError(
            "Calibration has no reference points",
            hint="Place X/Y bounds or precise axis points",
        )
    return out


def _constraints_from_axis_points(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for pt in cal.axis_points:
        pixel = (float(pt.pixel[0]), float(pt.pixel[1]))
        if pt.x_value is not None:
            out.append(
                Constraint(
                    pixel=pixel,
                    axis="u",
                    value=_log_value(float(pt.x_value), cal.x.scale, "x"),
                )
            )
        if pt.y_value is not None:
            out.append(
                Constraint(
                    pixel=pixel,
                    axis="v",
                    value=_log_value(float(pt.y_value), cal.y.scale, "y"),
                )
            )
    if not out:
        raise CalibrationError(
            "Precise axis points do not pin any coordinate",
            hint="Enter X and/or Y for each placed point",
        )
    return out


def _constraints_polar(cal: Calibration) -> list[Constraint]:
    out: list[Constraint] = []
    for pt in cal.axis_points:
        if pt.x_value is None or pt.y_value is None:
            raise CalibrationError(
                "Polar axis points must pin both θ and R",
                hint="Enter angle and radius for every polar axis point",
            )
        theta = _theta_to_radians(float(pt.x_value), cal.theta_units)
        rho = _rho(float(pt.y_value), cal.y.scale, cal.origin_radius)
        u = rho * math.cos(theta)
        v = rho * math.sin(theta)
        pixel = (float(pt.pixel[0]), float(pt.pixel[1]))
        out.append(Constraint(pixel=pixel, axis="u", value=u))
        out.append(Constraint(pixel=pixel, axis="v", value=v))
    if not out:
        raise CalibrationError(
            "Polar calibration has no (θ, R) axis points",
            hint="Place origin plus two more (θ, R) points",
        )
    return out


def _pixels_for(constraints: list[Constraint], axis: Literal["u", "v"]) -> list[tuple[float, float]]:
    return [c.pixel for c in constraints if c.axis == axis]


def _full_points(constraints: list[Constraint]) -> list[tuple[tuple[float, float], float, float]]:
    by_pixel: dict[tuple[float, float], dict[str, float]] = defaultdict(dict)
    for c in constraints:
        by_pixel[c.pixel][c.axis] = c.value
    out: list[tuple[tuple[float, float], float, float]] = []
    for pixel, axes in by_pixel.items():
        if "u" in axes and "v" in axes:
            out.append((pixel, axes["u"], axes["v"]))
    return out


def _collinear(pixels: list[tuple[float, float]]) -> bool:
    if len(pixels) < 3:
        return False
    unique: list[tuple[float, float]] = []
    for p in pixels:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9 for q in unique):
            unique.append(p)
    if len(unique) < 3:
        return True
    x0, y0 = unique[0]
    x1, y1 = unique[1]
    for x, y in unique[2:]:
        area = abs((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0))
        if area > _COLLINEAR_AREA:
            return False
    return True


def _distinct_coord(pixels: list[tuple[float, float]], index: int) -> bool:
    vals = {p[index] for p in pixels}
    return len(vals) >= 2


def _lstsq(A: np.ndarray, b: np.ndarray, n_unknowns: int, hint: str) -> np.ndarray:
    if A.shape[0] < n_unknowns:
        raise CalibrationError("Not enough constraints for this transform model", hint=hint)
    sol, _residuals, rank, _s = np.linalg.lstsq(A, b, rcond=None)
    if int(rank) < n_unknowns:
        raise CalibrationError("Transform system is degenerate", hint=hint)
    if np.any(~np.isfinite(sol)):
        raise CalibrationError("Transform system is degenerate", hint=hint)
    return sol.astype(np.float64)


def _solve_orthogonal(constraints: list[Constraint]) -> Transform2D:
    u_pts = _pixels_for(constraints, "u")
    v_pts = _pixels_for(constraints, "v")
    hint = "Need ≥2 X constraints with distinct px and ≥2 Y constraints with distinct py"
    if len(u_pts) < 2 or len(v_pts) < 2:
        raise CalibrationError("Orthogonal model needs 2 X and 2 Y constraints", hint=hint)
    if not _distinct_coord(u_pts, 0) or not _distinct_coord(v_pts, 1):
        raise CalibrationError("Orthogonal reference pixels are degenerate", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for c in constraints:
        px, py = c.pixel
        if c.axis == "u":
            rows.append([px, 1.0, 0.0, 0.0])
            rhs.append(c.value)
        else:
            rows.append([0.0, 0.0, py, 1.0])
            rhs.append(c.value)
    a, c0, e, f = _lstsq(np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 4, hint)
    matrix = np.array([[a, 0.0, c0], [0.0, e, f], [0.0, 0.0, 1.0]], dtype=np.float64)
    return Transform2D(model="orthogonal", matrix=matrix)


def _solve_affine(constraints: list[Constraint]) -> Transform2D:
    u_pts = _pixels_for(constraints, "u")
    v_pts = _pixels_for(constraints, "v")
    hint = "Need ≥3 non-collinear points pinning X and ≥3 non-collinear points pinning Y"
    if len(u_pts) < 3 or len(v_pts) < 3:
        raise CalibrationError("Affine model needs 3 X and 3 Y constraints", hint=hint)
    if _collinear(u_pts) or _collinear(v_pts):
        raise CalibrationError("Affine axis points are collinear", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for c in constraints:
        px, py = c.pixel
        if c.axis == "u":
            rows.append([px, py, 1.0, 0.0, 0.0, 0.0])
            rhs.append(c.value)
        else:
            rows.append([0.0, 0.0, 0.0, px, py, 1.0])
            rhs.append(c.value)
    a, b, c0, d, e, f = _lstsq(
        np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 6, hint
    )
    matrix = np.array([[a, b, c0], [d, e, f], [0.0, 0.0, 1.0]], dtype=np.float64)
    return Transform2D(model="affine", matrix=matrix)


def _solve_projective(constraints: list[Constraint]) -> Transform2D:
    full = _full_points(constraints)
    hint = "Need ≥4 points that each pin both X and Y, with no 3 collinear"
    if len(full) < 4:
        raise CalibrationError("Projective model needs 4 full (X,Y) points", hint=hint)
    pixels = [p for p, _u, _v in full]
    # any 3 of 4+ collinear is degenerate for a homography
    if len(pixels) >= 3:
        for i in range(len(pixels)):
            for j in range(i + 1, len(pixels)):
                for k in range(j + 1, len(pixels)):
                    if _collinear([pixels[i], pixels[j], pixels[k]]):
                        raise CalibrationError("Projective axis points have 3 collinear", hint=hint)
    rows: list[list[float]] = []
    rhs: list[float] = []
    for (px, py), u, v in full:
        rows.append([px, py, 1.0, 0.0, 0.0, 0.0, -u * px, -u * py])
        rhs.append(u)
        rows.append([0.0, 0.0, 0.0, px, py, 1.0, -v * px, -v * py])
        rhs.append(v)
    h = _lstsq(np.array(rows, dtype=np.float64), np.array(rhs, dtype=np.float64), 8, hint)
    matrix = np.array(
        [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]],
        dtype=np.float64,
    )
    return Transform2D(model="projective", matrix=matrix)


_SOLVERS = {
    "orthogonal": _solve_orthogonal,
    "affine": _solve_affine,
    "projective": _solve_projective,
}


def solve_transform(
    constraints: list[Constraint],
    model: TransformModel = "auto",
) -> Transform2D:
    if not constraints:
        raise CalibrationError(
            "No constraints to solve",
            hint="Place axis bounds or precise axis points",
        )
    if model != "auto":
        return _SOLVERS[model](constraints)
    last_error: CalibrationError | None = None
    for candidate in ("projective", "affine", "orthogonal"):
        try:
            return _SOLVERS[candidate](constraints)
        except CalibrationError as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise CalibrationError(
            "Cannot determine a transform from these axis points",
            hint=last_error.hint or "Add more non-collinear points that pin X and Y",
        )
    raise CalibrationError(
        "Cannot determine a transform from these axis points",
        hint="Add more non-collinear points that pin X and Y",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_transform.py -v`

Expected: PASS (all solver tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/calibration/transform.py backend/tests/test_transform.py
git commit -m "$(cat <<'EOF'
feat: add 2D orthogonal/affine/projective transform solver

EOF
)"
```

---

### Task 3: Cartesian adapter and the exact-equality regression gate

**Files:**
- Create: `backend/app/calibration/coords.py`
- Create: `backend/tests/test_coords.py`
- Modify: `backend/app/calibration/calibration.py` (replace body with facade)
- Modify: `backend/app/api/sessions.py` (use `exc.hint` when present)
- Test: `backend/tests/test_coords.py` (plus existing `backend/tests/test_calibration.py` must keep passing)

**Interfaces:**
- Consumes: `build_constraints`, `solve_transform`, `Transform2D`, `CalibrationError` from Task 2; `render_plot` from Phase 0 `tests.synth.plotgen`; `max_abs_error` from Phase 0 `tests.metrics`
- Produces:
  - `def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]`
  - `def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]`
  - `def validate_calibration(cal: Calibration) -> None`
  - `def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]`
  - `def axes_checker_polyline(cal: Calibration, image_size: tuple[int, int]) -> list[tuple[float, float]]`
  - `calibration.py` re-exports `CalibrationError`, `pixel_to_data`, `data_to_pixel`, `validate_calibration` (same names as today)
  - Cartesian adapter: `x = 10**u if scale_x == "log" else u` (likewise `y` from `v`). Map/polar branches may raise `CalibrationError("not implemented")` until Tasks 5–6; cartesian tests must not hit them.
  - Phase 0 `SynthPlot.axis_points` is a **test-local frozen dataclass** in `backend/tests/synth/plotgen.py`, not `app.models.schemas.AxisPoint`. Pydantic v2 will not coerce that dataclass into the BaseModel (`ValidationError: Input should be a valid dictionary or instance of AxisPoint`). Convert field-by-field at every call site. Do not change Phase 0 to import the production model — Phase 0 runs before Task 1 exists, and the generator must stay independent of the production schema.

- [ ] **Step 1: Write the failing cartesian / regression tests**

Create `backend/tests/test_coords.py`:

```python
from __future__ import annotations

import math

import numpy as np
import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    resolution_at,
    validate_calibration,
)
from app.calibration.transform import CalibrationError
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis, RefPoint
from tests.metrics import max_abs_error
from tests.synth.plotgen import render_plot


# --- independent oracle: the v2.2 1D extreme-two-point fit (our code, not Engauge) ---

def _extreme_ref_index(ref_points, axis_name: str, which: str) -> int:
    coord = 0 if axis_name == "x" else 1
    idx = 0
    for i in range(1, len(ref_points)):
        v = ref_points[i].pixel[coord]
        best = ref_points[idx].pixel[coord]
        if which == "min" and v < best:
            idx = i
        elif which == "max" and v > best:
            idx = i
    return idx


def _fit_axis(ref_points, scale: str, axis_name: str) -> tuple[float, float]:
    i_a = _extreme_ref_index(ref_points, axis_name, "min")
    i_b = _extreme_ref_index(ref_points, axis_name, "max")
    pix_a = float(ref_points[i_a].pixel[0 if axis_name == "x" else 1])
    pix_b = float(ref_points[i_b].pixel[0 if axis_name == "x" else 1])
    val_a = float(ref_points[i_a].value)
    val_b = float(ref_points[i_b].value)
    if abs(pix_b - pix_a) < 1e-9:
        raise RuntimeError("oracle degenerate")
    if scale == "log":
        val_a = math.log10(val_a)
        val_b = math.log10(val_b)
    slope = (val_b - val_a) / (pix_b - pix_a)
    intercept = val_a - slope * pix_a
    return float(slope), float(intercept)


def oracle_pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    xs, xi = _fit_axis(cal.x.ref_points, cal.x.scale, "x")
    ys, yi = _fit_axis(cal.y.ref_points, cal.y.scale, "y")
    xt = xs * pixel[0] + xi
    yt = ys * pixel[1] + yi
    x = 10**xt if cal.x.scale == "log" else xt
    y = 10**yt if cal.y.scale == "log" else yt
    return float(x), float(y)


def _cal(x_scale, y_scale, x_pix, x_val, y_pix, y_val) -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale=x_scale,
            ref_points=[
                RefPoint(pixel=x_pix[0], value=x_val[0]),
                RefPoint(pixel=x_pix[1], value=x_val[1]),
            ],
        ),
        y=CalibrationAxis(
            scale=y_scale,
            ref_points=[
                RefPoint(pixel=y_pix[0], value=y_val[0]),
                RefPoint(pixel=y_pix[1], value=y_val[1]),
            ],
        ),
        source="manual",
    )


ORTHOGONAL_CASES = [
    (
        "linear_linear",
        _cal(
            "linear",
            "linear",
            ((100.0, 400.0), (500.0, 400.0)),
            (0.0, 10.0),
            ((100.0, 400.0), (100.0, 100.0)),
            (0.0, 5.0),
        ),
        [(300.0, 250.0), (100.0, 400.0), (500.0, 100.0), (250.5, 333.25)],
    ),
    (
        "linear_log",
        _cal(
            "linear",
            "log",
            ((80.0, 500.0), (720.0, 500.0)),
            (-2.0, 8.0),
            ((80.0, 500.0), (80.0, 40.0)),
            (0.1, 100.0),
        ),
        [(200.0, 200.0), (80.0, 500.0), (400.0, 120.0)],
    ),
    (
        "log_linear",
        _cal(
            "log",
            "linear",
            ((50.0, 350.0), (550.0, 350.0)),
            (0.1, 100.0),
            ((50.0, 350.0), (50.0, 50.0)),
            (-3.0, 7.0),
        ),
        [(150.0, 200.0), (300.0, 100.0), (50.0, 350.0)],
    ),
    (
        "log_log",
        _cal(
            "log",
            "log",
            ((20.0, 480.0), (620.0, 480.0)),
            (1.0, 1000.0),
            ((20.0, 480.0), (20.0, 30.0)),
            (0.01, 10.0),
        ),
        [(120.0, 240.0), (400.0, 90.0), (20.0, 480.0)],
    ),
    (
        "reversed_x",
        _cal(
            "linear",
            "linear",
            ((500.0, 400.0), (100.0, 400.0)),
            (0.0, 10.0),
            ((500.0, 400.0), (500.0, 100.0)),
            (0.0, 5.0),
        ),
        [(300.0, 250.0), (500.0, 400.0), (100.0, 100.0)],
    ),
    (
        "negative_values",
        _cal(
            "linear",
            "linear",
            ((40.0, 300.0), (440.0, 300.0)),
            (-20.0, 20.0),
            ((40.0, 300.0), (40.0, 20.0)),
            (-5.0, 15.0),
        ),
        [(240.0, 160.0), (40.0, 300.0), (440.0, 20.0)],
    ),
]


@pytest.mark.parametrize("name,cal,pixels", ORTHOGONAL_CASES, ids=[c[0] for c in ORTHOGONAL_CASES])
def test_orthogonal_matches_old_1d_fit_to_1e_12(name, cal, pixels):
    validate_calibration(cal)
    for px in pixels:
        got = pixel_to_data(cal, px)
        exp = oracle_pixel_to_data(cal, px)
        assert got[0] == pytest.approx(exp[0], abs=1e-12), f"{name} x {px}"
        assert got[1] == pytest.approx(exp[1], abs=1e-12), f"{name} y {px}"
        back = data_to_pixel(cal, got)
        assert back[0] == pytest.approx(px[0], abs=1e-8)
        assert back[1] == pytest.approx(px[1], abs=1e-8)


def test_existing_calibration_helpers_still_importable():
    from app.calibration.calibration import (
        CalibrationError as FacadeError,
        data_to_pixel as d2p,
        pixel_to_data as p2d,
        validate_calibration as validate,
    )

    cal = ORTHOGONAL_CASES[0][1]
    validate(cal)
    assert p2d(cal, (300.0, 250.0)) == pixel_to_data(cal, (300.0, 250.0))
    assert d2p(cal, (5.0, 2.5))
    with pytest.raises(FacadeError):
        validate(
            _cal(
                "log",
                "linear",
                ((10.0, 10.0), (100.0, 10.0)),
                (1.0, 0.0),
                ((0.0, 100.0), (0.0, 10.0)),
                (0.0, 1.0),
            )
        )


def test_affine_accuracy_on_rotated_synth_plot():
    plot = render_plot(
        np.sin,
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        rotation_deg=15.0,
    )
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="cartesian",
        model="affine",
        axis_points=[
            AxisPoint(pixel=ap.pixel, x_value=ap.x_value, y_value=ap.y_value)
            for ap in plot.axis_points
        ],
    )
    validate_calibration(cal)
    got = [pixel_to_data(cal, plot.pixel_of(x, y)) for x, y in plot.truth]
    err = max_abs_error(got, plot.truth)
    x_span = 2.0 * math.pi
    y_span = 3.0
    axis_range = max(x_span, y_span)
    assert err <= 0.002 * axis_range


def test_projective_accuracy_on_perspective_synth_plot():
    plot = render_plot(
        lambda x: 0.3 * x + 1.0,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(800, 600),
        perspective=0.18,
    )
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="cartesian",
        model="projective",
        axis_points=[
            AxisPoint(pixel=ap.pixel, x_value=ap.x_value, y_value=ap.y_value)
            for ap in plot.axis_points
        ],
    )
    validate_calibration(cal)
    got = [pixel_to_data(cal, plot.pixel_of(x, y)) for x, y in plot.truth]
    err = max_abs_error(got, plot.truth)
    axis_range = 10.0
    assert err <= 0.005 * axis_range


def test_resolution_at_positive_for_linear():
    cal = ORTHOGONAL_CASES[0][1]
    dx, dy = resolution_at(cal, (300.0, 250.0))
    assert dx > 0
    assert dy > 0


def test_axes_checker_polyline_is_closed_quad():
    cal = ORTHOGONAL_CASES[0][1]
    poly = axes_checker_polyline(cal, (800, 600))
    assert len(poly) >= 4
    assert poly[0] == pytest.approx(poly[-1], abs=1e-6)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_coords.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.calibration.coords'`.

- [ ] **Step 3: Implement cartesian `coords.py` and the facade**

Create `backend/app/calibration/coords.py`:

```python
from __future__ import annotations

import math

from app.calibration.transform import (
    CalibrationError,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import Calibration

_RESOLVE_EPS = 0.5


def _transform_of(cal: Calibration) -> Transform2D:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map adapter is not available yet",
            hint="Use cartesian calibration",
        )
    if cal.coords_type == "polar":
        raise CalibrationError(
            "Polar adapter is not available yet",
            hint="Use cartesian calibration",
        )
    constraints = build_constraints(cal)
    requested = cal.model
    if requested == "auto" and not cal.axis_points:
        requested = "orthogonal"
    return solve_transform(constraints, model=requested)


def _from_linear_axes(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    x = 10**u if cal.x.scale == "log" else u
    y = 10**v if cal.y.scale == "log" else v
    return float(x), float(y)


def _to_linear_axes(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    x, y = data
    if cal.x.scale == "log":
        if x <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log X requires values > 0",
            )
        u = math.log10(x)
    else:
        u = x
    if cal.y.scale == "log":
        if y <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log Y requires values > 0",
            )
        v = math.log10(y)
    else:
        v = y
    return float(u), float(v)


def validate_calibration(cal: Calibration) -> None:
    if cal.coords_type == "cartesian" and not cal.axis_points:
        if len(cal.x.ref_points) < 2:
            raise CalibrationError(
                "x axis needs at least 2 reference points",
                hint="Place X min and X max",
            )
        if len(cal.y.ref_points) < 2:
            raise CalibrationError(
                "y axis needs at least 2 reference points",
                hint="Place Y min and Y max",
            )
    _transform_of(cal)


def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    return _from_linear_axes(cal, t.to_linear(pixel))


def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    return t.from_linear(_to_linear_axes(cal, data))


def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    x0, y0 = pixel_to_data(cal, pixel)
    x1, _y1 = pixel_to_data(cal, (pixel[0] + _RESOLVE_EPS, pixel[1]))
    _x2, y2 = pixel_to_data(cal, (pixel[0], pixel[1] + _RESOLVE_EPS))
    return abs(x1 - x0) / _RESOLVE_EPS, abs(y2 - y0) / _RESOLVE_EPS


def _data_limits(cal: Calibration) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    if cal.axis_points:
        for pt in cal.axis_points:
            if pt.x_value is not None:
                xs.append(float(pt.x_value))
            if pt.y_value is not None:
                ys.append(float(pt.y_value))
    else:
        xs = [float(p.value) for p in cal.x.ref_points]
        ys = [float(p.value) for p in cal.y.ref_points]
    if len(xs) < 2 or len(ys) < 2:
        raise CalibrationError(
            "Not enough pinned values to draw axes checker",
            hint="Pin both X and Y extents",
        )
    return min(xs), max(xs), min(ys), max(ys)


def axes_checker_polyline(
    cal: Calibration,
    image_size: tuple[int, int],
) -> list[tuple[float, float]]:
    xmin, xmax, ymin, ymax = _data_limits(cal)
    corners = [
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
        (xmin, ymin),
    ]
    return [data_to_pixel(cal, c) for c in corners]
```

Replace the entire body of `backend/app/calibration/calibration.py` with this facade (keep the module path stable):

```python
from __future__ import annotations

from app.calibration.coords import (
    data_to_pixel,
    pixel_to_data,
    validate_calibration,
)
from app.calibration.transform import CalibrationError

__all__ = [
    "CalibrationError",
    "pixel_to_data",
    "data_to_pixel",
    "validate_calibration",
]
```

In `backend/app/api/sessions.py`, change both calibration error handlers from a hardcoded hint to:

```python
    except CalibrationError as exc:
        raise _error(exc, "calibration_invalid", exc.hint or "Fix reference points") from exc
```

(the `set_calibration` handler and the `patch_preferences` handler).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_coords.py tests/test_calibration.py tests/test_transform.py tests/test_export.py tests/test_project.py -v`

Expected: PASS. Orthogonal cases match the inline oracle to 1e-12. Affine max abs error ≤ 0.2 % of axis range. Projective ≤ 0.5 %. Existing `test_calibration.py` still passes through the facade.

`render_plot(..., perspective=0.18)` uses Phase 0’s pinned signature: `perspective: float | None` is the top-edge inset fraction. Do not pass a tuple. If affine/projective gates fail, do not silently loosen them: record the measured error in the task report and stop.

- [ ] **Step 5: Commit**

```bash
git add backend/app/calibration/coords.py backend/app/calibration/calibration.py backend/app/api/sessions.py backend/tests/test_coords.py
git commit -m "$(cat <<'EOF'
feat: cartesian adapter with 1e-12 orthogonal regression gate

EOF
)"
```

---

### Task 4: Reference-corpus calibration tests

**Files:**
- Create: `backend/tests/reference/test_calibration_reference.py`
- Test: `backend/tests/reference/test_calibration_reference.py`

**Interfaces:**
- Consumes: `pixel_to_data`, `validate_calibration` from Task 3; `AxisPoint`, `Calibration` from Task 1; Phase 0 `load_doc` / `iter_docs` / `ReferenceDoc` / `ReferenceAxisPoint`; Phase 0 `assert_not_worse`, `max_abs_error`; `@pytest.mark.reference` from Phase 0 `tests/reference/conftest.py`
- Produces: corpus test that builds `Calibration(model="affine", axis_points=...)` from each of the 9 ground-truth docs (Engauge's 3-point affine path), maps `curve_points` screen pixels, interpolates onto `expected_csv` X, skips `XXX` cells, asserts ≤ 0.5 % relative (linear) / ≤ 1 % (log), and records the achieved error via `assert_not_worse`.

Note: Engauge uses a 3-point affine transform. Set `model="affine"` explicitly so `auto` cannot promote a 4-point doc to projective.

The 9 docs (stems; Phase 0 `ReferenceDoc.name` is the stem):

`extrapolate_functions_smooth`, `extrapolate_functions_straight`, `extrapolate_relations_smooth`, `extrapolate_relations_straight`, `guidelines_cartesian`, `guidelines_cartesian_log`, `guidelines_polar`, `guidelines_polar_log`, `points_along_axes`.

- [ ] **Step 1: Write the failing reference tests**

Create `backend/tests/reference/test_calibration_reference.py`:

```python
from __future__ import annotations

import math
import os
from pathlib import Path

import pytest

from app.calibration.coords import pixel_to_data, validate_calibration
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis
from tests.metrics import assert_not_worse, max_abs_error
from tests.reference.refcorpus import iter_docs

pytestmark = pytest.mark.reference

REF_DIR = Path(os.environ.get("PLOTDIG_REF_DIR", "/home/valentin/Projects/t/engauge-digitizer"))

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


def _require_ref() -> Path:
    if not REF_DIR.exists():
        pytest.skip(f"reference corpus missing: {REF_DIR}")
    return REF_DIR


def _docs_by_name():
    found = {doc.name: doc for doc in iter_docs(_require_ref())}
    return found


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
    return Calibration(
        x=CalibrationAxis(scale=scale_x, ref_points=[]),
        y=CalibrationAxis(scale=scale_y, ref_points=[]),
        coords_type=coords,
        model="affine",
        axis_points=axis_points,
        theta_units="degrees",
    )


def _parse_cell(raw: str) -> float | None:
    text = str(raw).strip()
    if text == "" or text.upper() == "XXX":
        return None
    return float(text)


def _interp_y(points: list[tuple[float, float]], x_query: float) -> float | None:
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda p: p[0])
    xs = [p[0] for p in ordered]
    if x_query < xs[0] or x_query > xs[-1]:
        # nearest endpoint — still compared; skip if far
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
def test_reference_doc_matches_expected_csv(name: str):
    docs = _docs_by_name()
    if name not in docs:
        pytest.skip(f"{name} not present in corpus")
    doc = docs[name]
    if not doc.expected_csv or not doc.axis_points or not doc.curve_points:
        pytest.skip(f"{name} missing axis points, curve points, or expected CSV")
    if doc.coords_type == "polar":
        pytest.skip("polar docs are asserted in test_polar.py against the θ/R gate")
    cal = _calibration_from_doc(doc)
    validate_calibration(cal)

    header = doc.expected_csv[0]
    rows = doc.expected_csv[1:]
    curve_names = [c for c in header[1:]]
    mapped: dict[str, list[tuple[float, float]]] = {}
    for curve_name, pixels in doc.curve_points.items():
        mapped[curve_name] = [pixel_to_data(cal, pix) for pix in pixels]

    rels: list[float] = []
    log_y = doc.scale_y == "log"
    gate = 0.01 if log_y else 0.005
    for col_index, curve_name in enumerate(curve_names, start=1):
        series = mapped.get(curve_name) or mapped.get(curve_name.strip())
        if series is None:
            # first / only curve fallback
            if len(mapped) == 1:
                series = next(iter(mapped.values()))
            else:
                continue
        got_y: list[float] = []
        exp_y: list[float] = []
        for row in rows:
            if col_index >= len(row):
                continue
            x_exp = _parse_cell(row[0])
            y_exp = _parse_cell(row[col_index])
            if x_exp is None or y_exp is None:
                continue
            y_got = _interp_y(series, x_exp)
            if y_got is None:
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
```

Polar members of the 9-doc list are skipped here because Task 3's cartesian `_transform_of` still rejects `coords_type="polar"` until Task 5. After Task 5, **remove the polar skip** so `guidelines_polar` and `guidelines_polar_log` run in this file too (keep the θ/R gate in Task 5 as the polar-specific assertion). Implementers: delete the `if doc.coords_type == "polar": pytest.skip(...)` block at the start of Task 5's final test run, then re-run this file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/reference/test_calibration_reference.py -v`

Expected when corpus is present: FAIL — either affine solve cannot yet consume polar-skipped cartesian docs (should actually run cartesian ones) or interpolation/assert fails because `pixel_to_data` on affine axis_points from Engauge is the behaviour under test. First run of cartesian docs should **collect** 9 tests; `guidelines_polar*` skipped; remaining should FAIL only if mapping is wrong. If the cartesian affine path from Task 3 is already correct, this step may PASS on cartesian docs — that is acceptable (the tests still lock the gate). If `PLOTDIG_REF_DIR` is absent: all tests SKIP (not FAIL). Confirm with `pytest -q` from `backend/` that a clean checkout without the corpus still passes overall.

- [ ] **Step 3: No extra production code unless a cartesian doc fails the gate**

If a cartesian doc exceeds 0.5 % / 1 %, inspect `is_x_only` handling and whether `graph_y` is `None` vs `0`. Do not copy Engauge source. Do not vendor CSVs. Fix only our constraint builder / affine solve. If a target cannot be met, record the measured error in the task report and stop — do not loosen the gate.

- [ ] **Step 4: Run tests (corpus optional)**

Run: `cd backend && .venv/bin/pytest tests/reference/test_calibration_reference.py tests/test_coords.py tests/test_calibration.py -v`

Expected: PASS, or SKIP all reference tests when the corpus is missing. `pytest -q` without `PLOTDIG_REF_DIR` still green.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/reference/test_calibration_reference.py
git commit -m "$(cat <<'EOF'
test: lock affine calibration against Engauge ground-truth docs

EOF
)"
```

After the gate assertions pass, record the achieved errors (Phase 0 flag):

`cd backend && .venv/bin/pytest tests/reference/test_calibration_reference.py -v --update-baselines`

Include `backend/tests/reference/baselines/metrics.json` in the same commit.

---

### Task 5: Polar adapter

**Files:**
- Modify: `backend/app/calibration/coords.py`
- Modify: `backend/tests/reference/test_calibration_reference.py` (remove the polar skip added in Task 4)
- Create: `backend/tests/test_polar.py`
- Test: `backend/tests/test_polar.py`

**Interfaces:**
- Consumes: `build_constraints` polar branch from Task 2; `Transform2D.to_linear` / `from_linear`; `Calibration.theta_units`, `origin_radius`, `y.scale` (radius scale), `axis_points`
- Produces: polar path inside `pixel_to_data` / `data_to_pixel` / `validate_calibration` / `resolution_at` / `axes_checker_polyline`
  - Forward: θ̂ = θ in radians; `ρ(R) = log10(R) if y.scale == "log" else R - origin_radius`; `u = ρ·cos θ̂`, `v = ρ·sin θ̂`; then cartesian-style `from_linear` is inverted — wait, forward pixel→data: `to_linear` → `(u,v)` → `ρ = hypot(u,v)`, `θ = atan2(v,u)` converted to `theta_units`, `R = 10**ρ if log else ρ + origin_radius`
  - Inverse data→pixel: θ→radians, ρ from R, `(u,v) = (ρ cos θ̂, ρ sin θ̂)`, `from_linear`
  - Radius scale is `Calibration.y.scale`. θ scale is always linear.
  - Polar docs (verified 2026-09-04): `guidelines_polar.xml`, `guidelines_polar_log.xml`, `polar_linear_linear_3curve.xml`, `polar_linear_linear_nonzero_center.xml`. Exclude `guidelines_polar_linear_shear.dig` and `guidelines_polar_log_rotated.dig`: they contain zero `CmdAddPointAxis` records, so they have no calibration ground truth — do not add them later to “complete” the set.

- [ ] **Step 1: Write the failing polar tests**

Create `backend/tests/test_polar.py`:

```python
from __future__ import annotations

import math
import os
from pathlib import Path

import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    validate_calibration,
)
from app.calibration.transform import CalibrationError
from app.models.schemas import AxisPoint, Calibration, CalibrationAxis
from tests.metrics import assert_not_worse
from tests.reference.refcorpus import iter_docs

POLAR_UNITS = ("degrees", "radians", "gradians", "turns")
THETA_90 = {"degrees": 90.0, "radians": math.pi / 2.0, "gradians": 100.0, "turns": 0.25}

# Usable polar corpus only. guidelines_polar_linear_shear.dig and
# guidelines_polar_log_rotated.dig have zero CmdAddPointAxis records
# (no calibration ground truth) — do not add them.
POLAR_DOCS = (
    "guidelines_polar",
    "guidelines_polar_log",
    "polar_linear_linear_3curve",
    "polar_linear_linear_nonzero_center",
)

REF_DIR = Path(os.environ.get("PLOTDIG_REF_DIR", "/home/valentin/Projects/t/engauge-digitizer"))


def _polar_cal(
    points: list[AxisPoint],
    *,
    theta_units: str = "degrees",
    origin_radius: float = 0.0,
    radius_scale: str = "linear",
) -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale=radius_scale, ref_points=[]),
        coords_type="polar",
        model="affine",
        axis_points=points,
        theta_units=theta_units,  # type: ignore[arg-type]
        origin_radius=origin_radius,
    )


def test_polar_roundtrip_all_theta_units():
    for units in POLAR_UNITS:
        points = [
            AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(200.0, 120.0), x_value=THETA_90[units], y_value=2.0),
        ]
        cal = _polar_cal(points, theta_units=units)
        validate_calibration(cal)
        theta, radius = pixel_to_data(cal, (280.0, 200.0))
        assert radius == pytest.approx(2.0, abs=1e-9)
        assert theta == pytest.approx(0.0, abs=1e-9)
        back = data_to_pixel(cal, (theta, radius))
        assert back[0] == pytest.approx(280.0, abs=1e-6)
        assert back[1] == pytest.approx(200.0, abs=1e-6)


def test_polar_nonzero_origin_radius():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=1.0),  # ρ = 0
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=3.0),  # ρ = 2
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=3.0),
    ]
    cal = _polar_cal(points, origin_radius=1.0)
    validate_calibration(cal)
    theta, radius = pixel_to_data(cal, (200.0, 200.0))
    assert radius == pytest.approx(1.0, abs=1e-9)
    theta2, radius2 = pixel_to_data(cal, (280.0, 200.0))
    assert radius2 == pytest.approx(3.0, abs=1e-9)
    assert theta2 == pytest.approx(0.0, abs=1e-8)


def test_polar_log_radius():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=1.0),
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=100.0),
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=100.0),
    ]
    cal = _polar_cal(points, radius_scale="log")
    validate_calibration(cal)
    _theta, radius = pixel_to_data(cal, (280.0, 200.0))
    assert radius == pytest.approx(100.0, rel=1e-8)
    back = data_to_pixel(cal, (0.0, 10.0))
    got = pixel_to_data(cal, back)
    assert got[1] == pytest.approx(10.0, rel=1e-7)


def test_polar_checker_is_annular():
    points = [
        AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
        AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
        AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=2.0),
    ]
    cal = _polar_cal(points)
    poly = axes_checker_polyline(cal, (400, 400))
    assert len(poly) >= 16


@pytest.mark.reference
@pytest.mark.parametrize("name", POLAR_DOCS)
def test_polar_reference_docs(name: str):
    if not REF_DIR.exists():
        pytest.skip(f"reference corpus missing: {REF_DIR}")
    docs = {doc.name: doc for doc in iter_docs(REF_DIR)}
    if name not in docs:
        pytest.skip(f"{name} not present")
    doc = docs[name]
    axis_points = []
    for ap in doc.axis_points:
        axis_points.append(
            AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=ap.graph_y)
        )
    cal = Calibration(
        x=CalibrationAxis(scale="linear" if doc.scale_x != "log" else "log", ref_points=[]),
        y=CalibrationAxis(scale="log" if doc.scale_y == "log" else "linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        axis_points=axis_points,
        theta_units="degrees",
        origin_radius=0.0,
    )
    validate_calibration(cal)
    assert doc.expected_csv, name
    header = doc.expected_csv[0]
    rows = doc.expected_csv[1:]
    # expected CSV is θ in column 0, R in following curve columns
    first_curve = next(iter(doc.curve_points.values()))
    mapped = [pixel_to_data(cal, pix) for pix in first_curve]
    dtheta: list[float] = []
    drel_r: list[float] = []
    for row in rows:
        if len(row) < 2:
            continue
        if str(row[0]).strip().upper() == "XXX" or str(row[1]).strip().upper() == "XXX":
            continue
        try:
            th_exp = float(row[0])
            r_exp = float(row[1])
        except ValueError:
            continue
        # nearest mapped point in θ
        nearest = min(mapped, key=lambda p: abs(p[0] - th_exp))
        dtheta.append(abs(nearest[0] - th_exp))
        if abs(r_exp) > 1e-12:
            drel_r.append(abs(nearest[1] - r_exp) / abs(r_exp))
    assert dtheta, name
    peak_th = max(dtheta)
    peak_r = max(drel_r) if drel_r else 0.0
    assert peak_th <= 0.5, f"{name} θ {peak_th}° > 0.5°"
    assert peak_r <= 0.01, f"{name} R rel {peak_r} > 1%"
    assert_not_worse(f"calibration.polar.{name}.theta_deg", peak_th, lower_is_better=True)
    assert_not_worse(f"calibration.polar.{name}.r_rel", peak_r, lower_is_better=True)
```

Also delete this block from `backend/tests/reference/test_calibration_reference.py`:

```python
    if doc.coords_type == "polar":
        pytest.skip("polar docs are asserted in test_polar.py against the θ/R gate")
```

For polar docs in that file, `_calibration_from_doc` already sets `coords_type="polar"`. Relative CSV compare on θ/R is extra coverage; the hard polar gate lives in `test_polar.py`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_polar.py -v`

Expected: FAIL with `CalibrationError: Polar adapter is not available yet` from `_transform_of`.

- [ ] **Step 3: Implement the polar adapter in `coords.py`**

Replace `backend/app/calibration/coords.py` with this complete file (cartesian + polar; map still stubs):

```python
from __future__ import annotations

import math

from app.calibration.transform import (
    CalibrationError,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import Calibration

_RESOLVE_EPS = 0.5
_TWO_PI = 2.0 * math.pi


def _theta_to_radians(theta: float, units: str) -> float:
    if units == "degrees":
        return theta * math.pi / 180.0
    if units == "radians":
        return theta
    if units == "gradians":
        return theta * math.pi / 200.0
    if units == "turns":
        return theta * _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _radians_to_theta(rad: float, units: str) -> float:
    if units == "degrees":
        return rad * 180.0 / math.pi
    if units == "radians":
        return rad
    if units == "gradians":
        return rad * 200.0 / math.pi
    if units == "turns":
        return rad / _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _transform_of(cal: Calibration) -> Transform2D:
    if cal.coords_type == "map":
        raise CalibrationError(
            "Map adapter is not available yet",
            hint="Use cartesian or polar calibration",
        )
    constraints = build_constraints(cal)
    requested = cal.model
    if requested == "auto" and not cal.axis_points and cal.coords_type == "cartesian":
        requested = "orthogonal"
    if cal.coords_type == "polar" and requested == "auto":
        requested = "affine"
    return solve_transform(constraints, model=requested)


def _from_linear_axes(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    x = 10**u if cal.x.scale == "log" else u
    y = 10**v if cal.y.scale == "log" else v
    return float(x), float(y)


def _to_linear_axes(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    x, y = data
    if cal.x.scale == "log":
        if x <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log X requires values > 0",
            )
        u = math.log10(x)
    else:
        u = x
    if cal.y.scale == "log":
        if y <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log Y requires values > 0",
            )
        v = math.log10(y)
    else:
        v = y
    return float(u), float(v)


def _polar_from_linear(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    rho = math.hypot(u, v)
    theta_rad = math.atan2(v, u)
    theta = _radians_to_theta(theta_rad, cal.theta_units)
    if cal.y.scale == "log":
        radius = 10**rho
    else:
        radius = rho + cal.origin_radius
    return float(theta), float(radius)


def _polar_to_linear(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    theta, radius = data
    theta_rad = _theta_to_radians(theta, cal.theta_units)
    if cal.y.scale == "log":
        if radius <= 0:
            raise CalibrationError(
                "Cannot map non-positive radius on log polar axis",
                hint="Log radius requires R > 0",
            )
        rho = math.log10(radius)
    else:
        rho = radius - cal.origin_radius
    return rho * math.cos(theta_rad), rho * math.sin(theta_rad)


def validate_calibration(cal: Calibration) -> None:
    if cal.coords_type == "polar":
        if len(cal.axis_points) < 3:
            raise CalibrationError(
                "Polar calibration needs at least 3 axis points",
                hint="Place origin plus two more (θ, R) points",
            )
        _transform_of(cal)
        return
    if cal.coords_type == "cartesian" and not cal.axis_points:
        if len(cal.x.ref_points) < 2:
            raise CalibrationError(
                "x axis needs at least 2 reference points",
                hint="Place X min and X max",
            )
        if len(cal.y.ref_points) < 2:
            raise CalibrationError(
                "y axis needs at least 2 reference points",
                hint="Place Y min and Y max",
            )
    _transform_of(cal)


def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    uv = t.to_linear(pixel)
    if cal.coords_type == "polar":
        return _polar_from_linear(cal, uv)
    return _from_linear_axes(cal, uv)


def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    t = _transform_of(cal)
    if cal.coords_type == "polar":
        return t.from_linear(_polar_to_linear(cal, data))
    return t.from_linear(_to_linear_axes(cal, data))


def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    a0 = pixel_to_data(cal, pixel)
    a1 = pixel_to_data(cal, (pixel[0] + _RESOLVE_EPS, pixel[1]))
    a2 = pixel_to_data(cal, (pixel[0], pixel[1] + _RESOLVE_EPS))
    return abs(a1[0] - a0[0]) / _RESOLVE_EPS, abs(a2[1] - a0[1]) / _RESOLVE_EPS


def _data_limits(cal: Calibration) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    if cal.axis_points:
        for pt in cal.axis_points:
            if pt.x_value is not None:
                xs.append(float(pt.x_value))
            if pt.y_value is not None:
                ys.append(float(pt.y_value))
    else:
        xs = [float(p.value) for p in cal.x.ref_points]
        ys = [float(p.value) for p in cal.y.ref_points]
    if len(xs) < 2 or len(ys) < 2:
        raise CalibrationError(
            "Not enough pinned values to draw axes checker",
            hint="Pin both X and Y extents",
        )
    return min(xs), max(xs), min(ys), max(ys)


def _polar_checker(cal: Calibration) -> list[tuple[float, float]]:
    radii = [float(pt.y_value) for pt in cal.axis_points if pt.y_value is not None]
    thetas = [float(pt.x_value) for pt in cal.axis_points if pt.x_value is not None]
    r_inner = cal.origin_radius
    r_outer = max(radii) if radii else r_inner + 1.0
    t0 = min(thetas) if thetas else 0.0
    t1 = max(thetas) if thetas else (
        360.0 if cal.theta_units == "degrees" else math.pi * 2 if cal.theta_units == "radians" else 400.0 if cal.theta_units == "gradians" else 1.0
    )
    n = 32
    poly: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        poly.append(data_to_pixel(cal, (t, r_outer)))
    for i in range(n + 1):
        t = t1 + (t0 - t1) * i / n
        poly.append(data_to_pixel(cal, (t, r_inner)))
    poly.append(poly[0])
    return poly


def axes_checker_polyline(
    cal: Calibration,
    image_size: tuple[int, int],
) -> list[tuple[float, float]]:
    if cal.coords_type == "polar":
        return _polar_checker(cal)
    xmin, xmax, ymin, ymax = _data_limits(cal)
    corners = [
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
        (xmin, ymin),
    ]
    return [data_to_pixel(cal, c) for c in corners]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_polar.py tests/test_coords.py tests/test_transform.py tests/test_calibration.py tests/reference/test_calibration_reference.py -v`

Expected: PASS (reference polar/cartesian SKIP if corpus absent). Polar synthetic round-trips pass for all four θ units. Corpus polar docs meet θ ≤ 0.5°, R ≤ 1 %.

- [ ] **Step 5: Commit**

```bash
git add backend/app/calibration/coords.py backend/tests/test_polar.py backend/tests/reference/test_calibration_reference.py
git commit -m "$(cat <<'EOF'
feat: polar coordinate adapter with unit and corpus gates

EOF
)"
```

---

### Task 6: Map / scale-bar adapter

**Files:**
- Modify: `backend/app/calibration/coords.py`
- Create: `backend/tests/test_map.py`
- Test: `backend/tests/test_map.py`

**Interfaces:**
- Consumes: `Calibration.scale_bar: ScaleBar | None`, `coords_type == "map"`
- Produces: map path in `pixel_to_data` / `data_to_pixel` / `validate_calibration` / `resolution_at` / `axes_checker_polyline`
  - `s = L / hypot(p2 - p1)`
  - `x = (px - p1x) * s`
  - `y = (p1y - py) * s` (y up)
  - Inverse: `px = p1x + x / s`, `py = p1y - y / s`
  - Isotropic; origin at `pixel_a`. Does **not** call `solve_transform`.
  - `validate_calibration` raises if `coords_type == "map"` and `scale_bar` is missing, `length` ≤ 0, or the two pixels coincide.

- [ ] **Step 1: Write the failing map tests**

Create `backend/tests/test_map.py`:

```python
from __future__ import annotations

import math

import pytest

from app.calibration.coords import (
    axes_checker_polyline,
    data_to_pixel,
    pixel_to_data,
    resolution_at,
    validate_calibration,
)
from app.calibration.transform import CalibrationError
from app.models.schemas import Calibration, CalibrationAxis, ScaleBar


def _map_cal(bar: ScaleBar | None) -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=bar,
    )


def test_map_horizontal_scale_bar_distances():
    cal = _map_cal(
        ScaleBar(pixel_a=(10.0, 50.0), pixel_b=(110.0, 50.0), length=50.0, units="m")
    )
    validate_calibration(cal)
    x, y = pixel_to_data(cal, (10.0, 50.0))
    assert x == pytest.approx(0.0)
    assert y == pytest.approx(0.0)
    x2, y2 = pixel_to_data(cal, (110.0, 50.0))
    assert x2 == pytest.approx(50.0)
    assert y2 == pytest.approx(0.0)
    x3, y3 = pixel_to_data(cal, (10.0, 0.0))
    assert x3 == pytest.approx(0.0)
    assert y3 == pytest.approx(25.0)  # 50 px up * 0.5 m/px
    back = data_to_pixel(cal, (25.0, 10.0))
    got = pixel_to_data(cal, back)
    assert got[0] == pytest.approx(25.0)
    assert got[1] == pytest.approx(10.0)


def test_map_rotated_scale_bar():
    # 3-4-5 triangle: (0,0) -> (30,40) is 50 px for 10 units → s = 0.2
    cal = _map_cal(
        ScaleBar(pixel_a=(0.0, 0.0), pixel_b=(30.0, 40.0), length=10.0, units="km")
    )
    validate_calibration(cal)
    x, y = pixel_to_data(cal, (30.0, 40.0))
    dist = math.hypot(x, y)
    assert dist == pytest.approx(10.0, abs=1e-9)
    dx, dy = resolution_at(cal, (0.0, 0.0))
    assert dx == pytest.approx(0.2, abs=1e-12)
    assert dy == pytest.approx(0.2, abs=1e-12)


def test_map_missing_scale_bar_raises():
    with pytest.raises(CalibrationError, match="scale bar"):
        validate_calibration(_map_cal(None))


def test_map_zero_length_bar_raises():
    with pytest.raises(CalibrationError):
        validate_calibration(
            _map_cal(ScaleBar(pixel_a=(5.0, 5.0), pixel_b=(5.0, 5.0), length=10.0))
        )
    with pytest.raises(CalibrationError):
        validate_calibration(
            _map_cal(ScaleBar(pixel_a=(5.0, 5.0), pixel_b=(15.0, 5.0), length=0.0))
        )


def test_map_checker_includes_scale_bar_endpoints():
    cal = _map_cal(
        ScaleBar(pixel_a=(10.0, 20.0), pixel_b=(40.0, 20.0), length=3.0, units="m")
    )
    poly = axes_checker_polyline(cal, (100, 80))
    assert (10.0, 20.0) in poly or pytest.approx(poly[0][0]) == 10.0
    assert len(poly) >= 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_map.py -v`

Expected: FAIL with `CalibrationError: Map adapter is not available yet`.

- [ ] **Step 3: Add the map adapter to `coords.py`**

Replace `_transform_of` so map never calls the solver. Add these functions and wire the existing public functions. The complete file after this task is:

```python
from __future__ import annotations

import math

from app.calibration.transform import (
    CalibrationError,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import Calibration, ScaleBar

_RESOLVE_EPS = 0.5
_TWO_PI = 2.0 * math.pi


def _theta_to_radians(theta: float, units: str) -> float:
    if units == "degrees":
        return theta * math.pi / 180.0
    if units == "radians":
        return theta
    if units == "gradians":
        return theta * math.pi / 200.0
    if units == "turns":
        return theta * _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _radians_to_theta(rad: float, units: str) -> float:
    if units == "degrees":
        return rad * 180.0 / math.pi
    if units == "radians":
        return rad
    if units == "gradians":
        return rad * 200.0 / math.pi
    if units == "turns":
        return rad / _TWO_PI
    raise CalibrationError(f"Unknown theta units: {units}")


def _map_scale(bar: ScaleBar) -> float:
    dx = bar.pixel_b[0] - bar.pixel_a[0]
    dy = bar.pixel_b[1] - bar.pixel_a[1]
    dist = math.hypot(dx, dy)
    if dist < 1e-12:
        raise CalibrationError(
            "Scale bar pixels coincide",
            hint="Place two distinct scale-bar endpoints",
        )
    if bar.length <= 0:
        raise CalibrationError(
            "Scale bar length must be positive",
            hint="Enter the physical length between the two pixels",
        )
    return float(bar.length) / dist


def _require_scale_bar(cal: Calibration) -> ScaleBar:
    if cal.scale_bar is None:
        raise CalibrationError(
            "Map calibration requires a scale bar",
            hint="Place two pixels and enter the physical length",
        )
    return cal.scale_bar


def _map_pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    bar = _require_scale_bar(cal)
    s = _map_scale(bar)
    x = (pixel[0] - bar.pixel_a[0]) * s
    y = (bar.pixel_a[1] - pixel[1]) * s
    return float(x), float(y)


def _map_data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    bar = _require_scale_bar(cal)
    s = _map_scale(bar)
    px = bar.pixel_a[0] + data[0] / s
    py = bar.pixel_a[1] - data[1] / s
    return float(px), float(py)


def _transform_of(cal: Calibration) -> Transform2D:
    constraints = build_constraints(cal)
    requested = cal.model
    if requested == "auto" and not cal.axis_points and cal.coords_type == "cartesian":
        requested = "orthogonal"
    if cal.coords_type == "polar" and requested == "auto":
        requested = "affine"
    return solve_transform(constraints, model=requested)


def _from_linear_axes(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    x = 10**u if cal.x.scale == "log" else u
    y = 10**v if cal.y.scale == "log" else v
    return float(x), float(y)


def _to_linear_axes(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    x, y = data
    if cal.x.scale == "log":
        if x <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log X requires values > 0",
            )
        u = math.log10(x)
    else:
        u = x
    if cal.y.scale == "log":
        if y <= 0:
            raise CalibrationError(
                "Cannot map non-positive value on log axis",
                hint="Log Y requires values > 0",
            )
        v = math.log10(y)
    else:
        v = y
    return float(u), float(v)


def _polar_from_linear(cal: Calibration, uv: tuple[float, float]) -> tuple[float, float]:
    u, v = uv
    rho = math.hypot(u, v)
    theta_rad = math.atan2(v, u)
    theta = _radians_to_theta(theta_rad, cal.theta_units)
    if cal.y.scale == "log":
        radius = 10**rho
    else:
        radius = rho + cal.origin_radius
    return float(theta), float(radius)


def _polar_to_linear(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    theta, radius = data
    theta_rad = _theta_to_radians(theta, cal.theta_units)
    if cal.y.scale == "log":
        if radius <= 0:
            raise CalibrationError(
                "Cannot map non-positive radius on log polar axis",
                hint="Log radius requires R > 0",
            )
        rho = math.log10(radius)
    else:
        rho = radius - cal.origin_radius
    return rho * math.cos(theta_rad), rho * math.sin(theta_rad)


def validate_calibration(cal: Calibration) -> None:
    if cal.coords_type == "map":
        bar = _require_scale_bar(cal)
        _map_scale(bar)
        return
    if cal.coords_type == "polar":
        if len(cal.axis_points) < 3:
            raise CalibrationError(
                "Polar calibration needs at least 3 axis points",
                hint="Place origin plus two more (θ, R) points",
            )
        _transform_of(cal)
        return
    if cal.coords_type == "cartesian" and not cal.axis_points:
        if len(cal.x.ref_points) < 2:
            raise CalibrationError(
                "x axis needs at least 2 reference points",
                hint="Place X min and X max",
            )
        if len(cal.y.ref_points) < 2:
            raise CalibrationError(
                "y axis needs at least 2 reference points",
                hint="Place Y min and Y max",
            )
    _transform_of(cal)


def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    if cal.coords_type == "map":
        return _map_pixel_to_data(cal, pixel)
    t = _transform_of(cal)
    uv = t.to_linear(pixel)
    if cal.coords_type == "polar":
        return _polar_from_linear(cal, uv)
    return _from_linear_axes(cal, uv)


def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]:
    if cal.coords_type == "map":
        return _map_data_to_pixel(cal, data)
    t = _transform_of(cal)
    if cal.coords_type == "polar":
        return t.from_linear(_polar_to_linear(cal, data))
    return t.from_linear(_to_linear_axes(cal, data))


def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]:
    if cal.coords_type == "map":
        s = _map_scale(_require_scale_bar(cal))
        return s, s
    a0 = pixel_to_data(cal, pixel)
    a1 = pixel_to_data(cal, (pixel[0] + _RESOLVE_EPS, pixel[1]))
    a2 = pixel_to_data(cal, (pixel[0], pixel[1] + _RESOLVE_EPS))
    return abs(a1[0] - a0[0]) / _RESOLVE_EPS, abs(a2[1] - a0[1]) / _RESOLVE_EPS


def _data_limits(cal: Calibration) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    if cal.axis_points:
        for pt in cal.axis_points:
            if pt.x_value is not None:
                xs.append(float(pt.x_value))
            if pt.y_value is not None:
                ys.append(float(pt.y_value))
    else:
        xs = [float(p.value) for p in cal.x.ref_points]
        ys = [float(p.value) for p in cal.y.ref_points]
    if len(xs) < 2 or len(ys) < 2:
        raise CalibrationError(
            "Not enough pinned values to draw axes checker",
            hint="Pin both X and Y extents",
        )
    return min(xs), max(xs), min(ys), max(ys)


def _polar_checker(cal: Calibration) -> list[tuple[float, float]]:
    radii = [float(pt.y_value) for pt in cal.axis_points if pt.y_value is not None]
    thetas = [float(pt.x_value) for pt in cal.axis_points if pt.x_value is not None]
    r_inner = cal.origin_radius
    r_outer = max(radii) if radii else r_inner + 1.0
    t0 = min(thetas) if thetas else 0.0
    t1 = max(thetas) if thetas else (
        360.0
        if cal.theta_units == "degrees"
        else math.pi * 2
        if cal.theta_units == "radians"
        else 400.0
        if cal.theta_units == "gradians"
        else 1.0
    )
    n = 32
    poly: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        poly.append(data_to_pixel(cal, (t, r_outer)))
    for i in range(n + 1):
        t = t1 + (t0 - t1) * i / n
        poly.append(data_to_pixel(cal, (t, r_inner)))
    poly.append(poly[0])
    return poly


def _map_checker(cal: Calibration) -> list[tuple[float, float]]:
    bar = _require_scale_bar(cal)
    a = (float(bar.pixel_a[0]), float(bar.pixel_a[1]))
    b = (float(bar.pixel_b[0]), float(bar.pixel_b[1]))
    unit = data_to_pixel(cal, (bar.length, 0.0))
    up = data_to_pixel(cal, (0.0, bar.length))
    return [a, b, a, up, a, unit, a]


def axes_checker_polyline(
    cal: Calibration,
    image_size: tuple[int, int],
) -> list[tuple[float, float]]:
    if cal.coords_type == "map":
        return _map_checker(cal)
    if cal.coords_type == "polar":
        return _polar_checker(cal)
    xmin, xmax, ymin, ymax = _data_limits(cal)
    corners = [
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
        (xmin, ymin),
    ]
    return [data_to_pixel(cal, c) for c in corners]
```

`build_constraints` still raises for `coords_type == "map"` — that is correct because map never calls it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_map.py tests/test_polar.py tests/test_coords.py tests/test_transform.py tests/test_calibration.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/calibration/coords.py backend/tests/test_map.py
git commit -m "$(cat <<'EOF'
feat: map calibration via isotropic two-point scale bar

EOF
)"
```

---

### Task 7: Frontend transform parity

**Files:**
- Create: `frontend/src/lib/transform2d.ts`
- Create: `frontend/src/lib/__tests__/transform2d.test.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/transform.ts`
- Modify: `frontend/src/lib/calibration.ts`
- Modify: `backend/tests/synth/gen_transform_vectors.py`
- Modify: `frontend/src/lib/__fixtures__/transform-vectors.json`
- Test: `frontend/src/lib/__tests__/transform2d.test.ts` and `backend/tests/test_coords.py` (vectors generated from Python)

**Interfaces:**
- Consumes: Python `pixel_to_data` / `solve_transform` behaviour from Tasks 2–6; Phase 0 vitest (`npm test` in `frontend/`); existing orthogonal-only `transform-vectors.json`
- Produces (TypeScript):
  - `export type CoordsType = 'cartesian' | 'polar' | 'map'`
  - `export type ThetaUnits = 'degrees' | 'radians' | 'gradians' | 'turns'`
  - `export type TransformModel = 'auto' | 'orthogonal' | 'affine' | 'projective'`
  - `export interface AxisPoint { id: string; pixel: [number, number]; x_value?: number | null; y_value?: number | null }`
  - `export interface ScaleBar { pixel_a: [number, number]; pixel_b: [number, number]; length: number; units?: string }`
  - `export interface Transform2D { model: Exclude<TransformModel, 'auto'>; matrix: number[][] }`
  - `export class CalibrationError extends Error { hint: string }`
  - `export function buildConstraints(cal: Calibration): Constraint[]`
  - `export function solveTransform(constraints: Constraint[], model?: TransformModel): Transform2D`
  - `export function pixelToData(cal: Calibration, pixel: [number, number]): [number, number]`
  - `export function dataToPixel(cal: Calibration, data: [number, number]): [number, number]`
  - `export function validateCalibration(cal: Calibration): void`
  - `export function resolutionAt(cal: Calibration, pixel: [number, number]): [number, number]`
  - `export function axesCheckerPolyline(cal: Calibration, imageSize: [number, number]): [number, number][]`
  - `export function resolvedModel(cal: Calibration): Exclude<TransformModel, 'auto'>`
  - Agreement with Python on the fixture: ≤ 1e-9
  - `lib/transform.ts` keeps `getAxisBounds` / `updateAxisBound` / `formatAxisValue` and re-exports `pixelToData`, `isCalibrationValid`, `CalibrationError` from `transform2d.ts`

Fixture schema (generator rewrites the file; preserve any Phase 0 orthogonal samples by regenerating them too):

```json
{
  "cases": [
    {
      "name": "orthogonal_linear_linear",
      "pixel": [300.0, 250.0],
      "data": [5.0, 2.5],
      "calibration": { }
    }
  ]
}
```

- [ ] **Step 1: Write the failing vitest and the Python vector generator**

Replace `backend/tests/synth/gen_transform_vectors.py` with this complete generator:

```python
from __future__ import annotations

import json
import math
from pathlib import Path

from app.calibration.coords import pixel_to_data
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    RefPoint,
    ScaleBar,
)

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "frontend" / "src" / "lib" / "__fixtures__" / "transform-vectors.json"


def _dump_cal(cal: Calibration) -> dict:
    payload = cal.model_dump()
    return payload


def _case(name: str, cal: Calibration, pixel: tuple[float, float]) -> dict:
    data = pixel_to_data(cal, pixel)
    return {
        "name": name,
        "pixel": [float(pixel[0]), float(pixel[1])],
        "data": [float(data[0]), float(data[1])],
        "calibration": _dump_cal(cal),
    }


def main() -> None:
    cases: list[dict] = []
    ortho = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(500.0, 400.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(100.0, 100.0), value=5.0),
            ],
        ),
    )
    cases.append(_case("orthogonal_linear_linear", ortho, (300.0, 250.0)))
    loglog = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(20.0, 480.0), value=1.0),
                RefPoint(pixel=(620.0, 480.0), value=1000.0),
            ],
        ),
        y=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(20.0, 480.0), value=0.01),
                RefPoint(pixel=(20.0, 30.0), value=10.0),
            ],
        ),
    )
    cases.append(_case("orthogonal_log_log", loglog, (120.0, 240.0)))
    affine = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        model="affine",
        axis_points=[
            AxisPoint(pixel=(10.0, 20.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(80.0, 15.0), x_value=3.0, y_value=0.4),
            AxisPoint(pixel=(30.0, 90.0), x_value=1.2, y_value=4.1),
        ],
    )
    cases.append(_case("affine_three_point", affine, (45.0, 40.0)))
    proj = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        model="projective",
        axis_points=[
            AxisPoint(pixel=(0.0, 0.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(200.0, 10.0), x_value=10.0, y_value=0.2),
            AxisPoint(pixel=(15.0, 180.0), x_value=0.4, y_value=9.0),
            AxisPoint(pixel=(190.0, 170.0), x_value=9.5, y_value=8.4),
        ],
    )
    cases.append(_case("projective_four_point", proj, (90.0, 80.0)))
    polar = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=2.0),
        ],
    )
    cases.append(_case("polar_degrees", polar, (240.0, 160.0)))
    mapping = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=ScaleBar(pixel_a=(10.0, 50.0), pixel_b=(110.0, 50.0), length=50.0, units="m"),
    )
    cases.append(_case("map_horizontal", mapping, (60.0, 10.0)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases}, indent=2) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
```

Create `frontend/src/lib/__tests__/transform2d.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import vectors from '../__fixtures__/transform-vectors.json'
import { dataToPixel, pixelToData, type Calibration } from '../transform2d'

type Case = {
  name: string
  pixel: [number, number]
  data: [number, number]
  calibration: Calibration
}

describe('transform2d parity with Python', () => {
  it('agrees to 1e-9 on every fixture vector', () => {
    const cases = (vectors as { cases: Case[] }).cases
    expect(cases.length).toBeGreaterThanOrEqual(6)
    for (const c of cases) {
      const got = pixelToData(c.calibration, c.pixel)
      expect(got[0], c.name + ' x').toBeCloseTo(c.data[0], 9)
      expect(got[1], c.name + ' y').toBeCloseTo(c.data[1], 9)
      const back = dataToPixel(c.calibration, got)
      expect(back[0], c.name + ' px').toBeCloseTo(c.pixel[0], 6)
      expect(back[1], c.name + ' py').toBeCloseTo(c.pixel[1], 6)
    }
  })
})
```

- [ ] **Step 2: Generate vectors, then run vitest to verify it fails**

Run:

```bash
cd backend && .venv/bin/python tests/synth/gen_transform_vectors.py
cd ../frontend && npm test -- --run src/lib/__tests__/transform2d.test.ts
```

Expected: FAIL with `Failed to resolve import '../transform2d'` (or `pixelToData is not a function`).

- [ ] **Step 3: Implement TypeScript types + solver + adapters, and route existing modules through them**

Replace the `Calibration` / `WorkspaceState` section of `frontend/src/types.ts` so it contains:

```typescript
export type Scale = 'linear' | 'log'
export type Origin = 'ai' | 'user'
export type CurveStyle = 'solid' | 'dashed' | 'dotted' | 'unknown'
export type CoordsType = 'cartesian' | 'polar' | 'map'
export type ThetaUnits = 'degrees' | 'radians' | 'gradians' | 'turns'
export type TransformModel = 'auto' | 'orthogonal' | 'affine' | 'projective'
export type CanvasMode = 'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'

export interface RefPoint {
  pixel: [number, number]
  value: number
}

export interface CalibrationAxis {
  scale: Scale
  ref_points: RefPoint[]
}

export interface AxisPoint {
  id: string
  pixel: [number, number]
  x_value?: number | null
  y_value?: number | null
}

export interface ScaleBar {
  pixel_a: [number, number]
  pixel_b: [number, number]
  length: number
  units?: string
}

export interface Calibration {
  x: CalibrationAxis
  y: CalibrationAxis
  source: 'manual'
  coords_type?: CoordsType
  model?: TransformModel
  axis_points?: AxisPoint[]
  theta_units?: ThetaUnits
  origin_radius?: number
  scale_bar?: ScaleBar | null
}
```

Leave `Point`, `Curve`, `ImageMeta`, `Session` as they are. Add to `WorkspaceState` (needed by Task 8; defaulting keeps old sessions valid):

```typescript
export interface WorkspaceState {
  active_curve_id?: string | null
  resample_count?: number
  unskew_mode?: 'perspective' | 'mesh'
  mesh?: MeshGridPayload | null
  canvas_mode?: CanvasMode
  show_axes_checker?: boolean
}
```

Create `frontend/src/lib/transform2d.ts` with this complete file (ports Tasks 2–6; no Engauge code):

```typescript
import type {
  AxisPoint,
  Calibration,
  CoordsType,
  ScaleBar,
  ThetaUnits,
  TransformModel,
} from '../types'

export class CalibrationError extends Error {
  hint: string
  constructor(message: string, hint = '') {
    super(message)
    this.name = 'CalibrationError'
    this.hint = hint
  }
}

export interface Constraint {
  pixel: [number, number]
  axis: 'u' | 'v'
  value: number
}

export interface Transform2D {
  model: Exclude<TransformModel, 'auto'>
  matrix: number[][]
}

const COLLINEAR_AREA = 1e-6
const DENOM_TOL = 1e-15
const RANK_TOL = 1e-10
const RESOLVE_EPS = 0.5

function coordsType(cal: Calibration): CoordsType {
  return cal.coords_type ?? 'cartesian'
}

function thetaUnits(cal: Calibration): ThetaUnits {
  return cal.theta_units ?? 'degrees'
}

function originRadius(cal: Calibration): number {
  return cal.origin_radius ?? 0
}

function axisPoints(cal: Calibration): AxisPoint[] {
  return cal.axis_points ?? []
}

function logValue(value: number, scale: 'linear' | 'log', axisName: string): number {
  if (scale === 'log') {
    if (value <= 0) {
      throw new CalibrationError(
        `${axisName} log scale requires all reference values > 0`,
        'Use linear scale or enter values greater than zero',
      )
    }
    return Math.log10(value)
  }
  return value
}

function thetaToRadians(theta: number, units: ThetaUnits): number {
  if (units === 'degrees') return (theta * Math.PI) / 180
  if (units === 'radians') return theta
  if (units === 'gradians') return (theta * Math.PI) / 200
  return theta * 2 * Math.PI
}

function radiansToTheta(rad: number, units: ThetaUnits): number {
  if (units === 'degrees') return (rad * 180) / Math.PI
  if (units === 'radians') return rad
  if (units === 'gradians') return (rad * 200) / Math.PI
  return rad / (2 * Math.PI)
}

function rhoOf(radius: number, scale: 'linear' | 'log', origin: number): number {
  if (scale === 'log') {
    if (radius <= 0) {
      throw new CalibrationError('polar log radius requires all R values > 0', 'Enter a positive radius')
    }
    return Math.log10(radius)
  }
  return radius - origin
}

export function lstsq(A: number[][], b: number[]): number[] {
  const m = A.length
  const n = A[0]?.length ?? 0
  if (m < n) throw new CalibrationError('Not enough constraints for this transform model', 'Add more axis points')
  const ata: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  const atb: number[] = Array(n).fill(0)
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < n; k++) {
      atb[k] += A[i][k] * b[i]
      for (let j = 0; j < n; j++) ata[k][j] += A[i][k] * A[i][j]
    }
  }
  const aug = ata.map((row, i) => [...row, atb[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
    }
    if (Math.abs(aug[pivot][col]) < RANK_TOL) {
      throw new CalibrationError('Transform system is degenerate', 'Add more non-collinear axis points')
    }
    if (pivot !== col) {
      const tmp = aug[col]
      aug[col] = aug[pivot]
      aug[pivot] = tmp
    }
    const div = aug[col][col]
    for (let j = col; j <= n; j++) aug[col][j] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = aug[r][col]
      for (let j = col; j <= n; j++) aug[r][j] -= f * aug[col][j]
    }
  }
  return aug.map((row) => row[n])
}

function applyH(matrix: number[][], x: number, y: number): [number, number] {
  const u = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]
  const v = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]
  const w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2]
  if (Math.abs(w) < DENOM_TOL) {
    throw new CalibrationError('Projective transform denominator is zero', 'Move axis points off the vanishing line')
  }
  return [u / w, v / w]
}

function inv3(m: number[][]): number[][] {
  const a = m[0][0], b = m[0][1], c = m[0][2]
  const d = m[1][0], e = m[1][1], f = m[1][2]
  const g = m[2][0], h = m[2][1], i = m[2][2]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  const det = a * A + b * B + c * C
  if (Math.abs(det) < RANK_TOL) {
    throw new CalibrationError('Transform matrix is not invertible', 'Add more non-collinear axis points')
  }
  return [
    [A / det, D / det, G / det],
    [B / det, E / det, H / det],
    [C / det, F / det, I / det],
  ]
}

function toLinear(t: Transform2D, pixel: [number, number]): [number, number] {
  return applyH(t.matrix, pixel[0], pixel[1])
}

function fromLinear(t: Transform2D, uv: [number, number]): [number, number] {
  return applyH(inv3(t.matrix), uv[0], uv[1])
}

function collinear(pixels: [number, number][]): boolean {
  const unique: [number, number][] = []
  for (const p of pixels) {
    if (unique.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9)) unique.push(p)
  }
  if (unique.length < 3) return unique.length < 3 && pixels.length >= 3
  const [x0, y0] = unique[0]
  const [x1, y1] = unique[1]
  for (let i = 2; i < unique.length; i++) {
    const [x, y] = unique[i]
    const area = Math.abs((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0))
    if (area > COLLINEAR_AREA) return false
  }
  return true
}

function pixelsFor(constraints: Constraint[], axis: 'u' | 'v'): [number, number][] {
  return constraints.filter((c) => c.axis === axis).map((c) => c.pixel)
}

function distinctCoord(pixels: [number, number][], index: 0 | 1): boolean {
  return new Set(pixels.map((p) => p[index])).size >= 2
}

function fullPoints(constraints: Constraint[]): { pixel: [number, number]; u: number; v: number }[] {
  const map = new Map<string, { pixel: [number, number]; u?: number; v?: number }>()
  for (const c of constraints) {
    const key = `${c.pixel[0]},${c.pixel[1]}`
    const cur = map.get(key) ?? { pixel: c.pixel }
    if (c.axis === 'u') cur.u = c.value
    else cur.v = c.value
    map.set(key, cur)
  }
  const out: { pixel: [number, number]; u: number; v: number }[] = []
  for (const cur of map.values()) {
    if (cur.u !== undefined && cur.v !== undefined) out.push({ pixel: cur.pixel, u: cur.u, v: cur.v })
  }
  return out
}

function solveOrthogonal(constraints: Constraint[]): Transform2D {
  const uPts = pixelsFor(constraints, 'u')
  const vPts = pixelsFor(constraints, 'v')
  const hint = 'Need ≥2 X constraints with distinct px and ≥2 Y constraints with distinct py'
  if (uPts.length < 2 || vPts.length < 2) throw new CalibrationError('Orthogonal model needs 2 X and 2 Y constraints', hint)
  if (!distinctCoord(uPts, 0) || !distinctCoord(vPts, 1)) {
    throw new CalibrationError('Orthogonal reference pixels are degenerate', hint)
  }
  const A: number[][] = []
  const b: number[] = []
  for (const c of constraints) {
    const [px, py] = c.pixel
    if (c.axis === 'u') {
      A.push([px, 1, 0, 0])
      b.push(c.value)
    } else {
      A.push([0, 0, py, 1])
      b.push(c.value)
    }
  }
  const [a, c0, e, f] = lstsq(A, b)
  return { model: 'orthogonal', matrix: [[a, 0, c0], [0, e, f], [0, 0, 1]] }
}

function solveAffine(constraints: Constraint[]): Transform2D {
  const uPts = pixelsFor(constraints, 'u')
  const vPts = pixelsFor(constraints, 'v')
  const hint = 'Need ≥3 non-collinear points pinning X and ≥3 non-collinear points pinning Y'
  if (uPts.length < 3 || vPts.length < 3) throw new CalibrationError('Affine model needs 3 X and 3 Y constraints', hint)
  if (collinear(uPts) || collinear(vPts)) throw new CalibrationError('Affine axis points are collinear', hint)
  const A: number[][] = []
  const b: number[] = []
  for (const c of constraints) {
    const [px, py] = c.pixel
    if (c.axis === 'u') {
      A.push([px, py, 1, 0, 0, 0])
      b.push(c.value)
    } else {
      A.push([0, 0, 0, px, py, 1])
      b.push(c.value)
    }
  }
  const [a, b0, c0, d, e, f] = lstsq(A, b)
  return { model: 'affine', matrix: [[a, b0, c0], [d, e, f], [0, 0, 1]] }
}

function solveProjective(constraints: Constraint[]): Transform2D {
  const full = fullPoints(constraints)
  const hint = 'Need ≥4 points that each pin both X and Y, with no 3 collinear'
  if (full.length < 4) throw new CalibrationError('Projective model needs 4 full (X,Y) points', hint)
  const pixels = full.map((p) => p.pixel)
  for (let i = 0; i < pixels.length; i++) {
    for (let j = i + 1; j < pixels.length; j++) {
      for (let k = j + 1; k < pixels.length; k++) {
        if (collinear([pixels[i], pixels[j], pixels[k]])) {
          throw new CalibrationError('Projective axis points have 3 collinear', hint)
        }
      }
    }
  }
  const A: number[][] = []
  const b: number[] = []
  for (const p of full) {
    const [px, py] = p.pixel
    A.push([px, py, 1, 0, 0, 0, -p.u * px, -p.u * py])
    b.push(p.u)
    A.push([0, 0, 0, px, py, 1, -p.v * px, -p.v * py])
    b.push(p.v)
  }
  const h = lstsq(A, b)
  return {
    model: 'projective',
    matrix: [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1],
    ],
  }
}

const SOLVERS = {
  orthogonal: solveOrthogonal,
  affine: solveAffine,
  projective: solveProjective,
}

export function solveTransform(
  constraints: Constraint[],
  model: TransformModel = 'auto',
): Transform2D {
  if (!constraints.length) {
    throw new CalibrationError('No constraints to solve', 'Place axis bounds or precise axis points')
  }
  if (model !== 'auto') return SOLVERS[model](constraints)
  let last: CalibrationError | undefined
  for (const candidate of ['projective', 'affine', 'orthogonal'] as const) {
    try {
      return SOLVERS[candidate](constraints)
    } catch (err) {
      if (err instanceof CalibrationError) last = err
      else throw err
    }
  }
  throw new CalibrationError(
    'Cannot determine a transform from these axis points',
    last?.hint ?? 'Add more non-collinear points that pin X and Y',
  )
}

export function buildConstraints(cal: Calibration): Constraint[] {
  const kind = coordsType(cal)
  if (kind === 'map') {
    throw new CalibrationError('Map calibrations do not use axis-point constraints', 'Set a scale bar instead of axis points')
  }
  const points = axisPoints(cal)
  if (points.length) {
    if (kind === 'polar') return constraintsPolar(cal, points)
    return constraintsAxisPoints(cal, points)
  }
  return constraintsRefPoints(cal)
}

function constraintsRefPoints(cal: Calibration): Constraint[] {
  const out: Constraint[] = []
  for (const rp of cal.x.ref_points) {
    out.push({ pixel: rp.pixel, axis: 'u', value: logValue(rp.value, cal.x.scale, 'x') })
  }
  for (const rp of cal.y.ref_points) {
    out.push({ pixel: rp.pixel, axis: 'v', value: logValue(rp.value, cal.y.scale, 'y') })
  }
  if (!out.length) throw new CalibrationError('Calibration has no reference points', 'Place X/Y bounds or precise axis points')
  return out
}

function constraintsAxisPoints(cal: Calibration, points: AxisPoint[]): Constraint[] {
  const out: Constraint[] = []
  for (const pt of points) {
    if (pt.x_value !== undefined && pt.x_value !== null) {
      out.push({ pixel: pt.pixel, axis: 'u', value: logValue(pt.x_value, cal.x.scale, 'x') })
    }
    if (pt.y_value !== undefined && pt.y_value !== null) {
      out.push({ pixel: pt.pixel, axis: 'v', value: logValue(pt.y_value, cal.y.scale, 'y') })
    }
  }
  if (!out.length) {
    throw new CalibrationError('Precise axis points do not pin any coordinate', 'Enter X and/or Y for each placed point')
  }
  return out
}

function constraintsPolar(cal: Calibration, points: AxisPoint[]): Constraint[] {
  const out: Constraint[] = []
  const units = thetaUnits(cal)
  const origin = originRadius(cal)
  for (const pt of points) {
    if (pt.x_value === undefined || pt.x_value === null || pt.y_value === undefined || pt.y_value === null) {
      throw new CalibrationError('Polar axis points must pin both θ and R', 'Enter angle and radius for every polar axis point')
    }
    const th = thetaToRadians(pt.x_value, units)
    const rho = rhoOf(pt.y_value, cal.y.scale, origin)
    out.push({ pixel: pt.pixel, axis: 'u', value: rho * Math.cos(th) })
    out.push({ pixel: pt.pixel, axis: 'v', value: rho * Math.sin(th) })
  }
  if (!out.length) {
    throw new CalibrationError('Polar calibration has no (θ, R) axis points', 'Place origin plus two more (θ, R) points')
  }
  return out
}

function mapScale(bar: ScaleBar): number {
  const dist = Math.hypot(bar.pixel_b[0] - bar.pixel_a[0], bar.pixel_b[1] - bar.pixel_a[1])
  if (dist < 1e-12) throw new CalibrationError('Scale bar pixels coincide', 'Place two distinct scale-bar endpoints')
  if (bar.length <= 0) throw new CalibrationError('Scale bar length must be positive', 'Enter the physical length between the two pixels')
  return bar.length / dist
}

function requireBar(cal: Calibration): ScaleBar {
  if (!cal.scale_bar) {
    throw new CalibrationError('Map calibration requires a scale bar', 'Place two pixels and enter the physical length')
  }
  return cal.scale_bar
}

function transformOf(cal: Calibration): Transform2D {
  const constraints = buildConstraints(cal)
  let requested: TransformModel = cal.model ?? 'auto'
  if (requested === 'auto' && !axisPoints(cal).length && coordsType(cal) === 'cartesian') requested = 'orthogonal'
  if (coordsType(cal) === 'polar' && requested === 'auto') requested = 'affine'
  return solveTransform(constraints, requested)
}

function fromLinearAxes(cal: Calibration, uv: [number, number]): [number, number] {
  const x = cal.x.scale === 'log' ? 10 ** uv[0] : uv[0]
  const y = cal.y.scale === 'log' ? 10 ** uv[1] : uv[1]
  return [x, y]
}

function toLinearAxes(cal: Calibration, data: [number, number]): [number, number] {
  let u = data[0]
  let v = data[1]
  if (cal.x.scale === 'log') {
    if (data[0] <= 0) throw new CalibrationError('Cannot map non-positive value on log axis', 'Log X requires values > 0')
    u = Math.log10(data[0])
  }
  if (cal.y.scale === 'log') {
    if (data[1] <= 0) throw new CalibrationError('Cannot map non-positive value on log axis', 'Log Y requires values > 0')
    v = Math.log10(data[1])
  }
  return [u, v]
}

function polarFromLinear(cal: Calibration, uv: [number, number]): [number, number] {
  const rho = Math.hypot(uv[0], uv[1])
  const theta = radiansToTheta(Math.atan2(uv[1], uv[0]), thetaUnits(cal))
  const radius = cal.y.scale === 'log' ? 10 ** rho : rho + originRadius(cal)
  return [theta, radius]
}

function polarToLinear(cal: Calibration, data: [number, number]): [number, number] {
  const th = thetaToRadians(data[0], thetaUnits(cal))
  let rho: number
  if (cal.y.scale === 'log') {
    if (data[1] <= 0) throw new CalibrationError('Cannot map non-positive radius on log polar axis', 'Log radius requires R > 0')
    rho = Math.log10(data[1])
  } else {
    rho = data[1] - originRadius(cal)
  }
  return [rho * Math.cos(th), rho * Math.sin(th)]
}

export function validateCalibration(cal: Calibration): void {
  const kind = coordsType(cal)
  if (kind === 'map') {
    mapScale(requireBar(cal))
    return
  }
  if (kind === 'polar') {
    if (axisPoints(cal).length < 3) {
      throw new CalibrationError('Polar calibration needs at least 3 axis points', 'Place origin plus two more (θ, R) points')
    }
    transformOf(cal)
    return
  }
  if (!axisPoints(cal).length) {
    if (cal.x.ref_points.length < 2) throw new CalibrationError('x axis needs at least 2 reference points', 'Place X min and X max')
    if (cal.y.ref_points.length < 2) throw new CalibrationError('y axis needs at least 2 reference points', 'Place Y min and Y max')
  }
  transformOf(cal)
}

export function pixelToData(cal: Calibration, pixel: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const bar = requireBar(cal)
    const s = mapScale(bar)
    return [(pixel[0] - bar.pixel_a[0]) * s, (bar.pixel_a[1] - pixel[1]) * s]
  }
  const t = transformOf(cal)
  const uv = toLinear(t, pixel)
  if (coordsType(cal) === 'polar') return polarFromLinear(cal, uv)
  return fromLinearAxes(cal, uv)
}

export function dataToPixel(cal: Calibration, data: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const bar = requireBar(cal)
    const s = mapScale(bar)
    return [bar.pixel_a[0] + data[0] / s, bar.pixel_a[1] - data[1] / s]
  }
  const t = transformOf(cal)
  if (coordsType(cal) === 'polar') return fromLinear(t, polarToLinear(cal, data))
  return fromLinear(t, toLinearAxes(cal, data))
}

export function resolutionAt(cal: Calibration, pixel: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const s = mapScale(requireBar(cal))
    return [s, s]
  }
  const a0 = pixelToData(cal, pixel)
  const a1 = pixelToData(cal, [pixel[0] + RESOLVE_EPS, pixel[1]])
  const a2 = pixelToData(cal, [pixel[0], pixel[1] + RESOLVE_EPS])
  return [Math.abs(a1[0] - a0[0]) / RESOLVE_EPS, Math.abs(a2[1] - a0[1]) / RESOLVE_EPS]
}

export function resolvedModel(cal: Calibration): Exclude<TransformModel, 'auto'> {
  if (coordsType(cal) === 'map') return 'orthogonal'
  return transformOf(cal).model
}

function dataLimits(cal: Calibration): [number, number, number, number] {
  const xs: number[] = []
  const ys: number[] = []
  const points = axisPoints(cal)
  if (points.length) {
    for (const pt of points) {
      if (pt.x_value !== undefined && pt.x_value !== null) xs.push(pt.x_value)
      if (pt.y_value !== undefined && pt.y_value !== null) ys.push(pt.y_value)
    }
  } else {
    for (const p of cal.x.ref_points) xs.push(p.value)
    for (const p of cal.y.ref_points) ys.push(p.value)
  }
  if (xs.length < 2 || ys.length < 2) {
    throw new CalibrationError('Not enough pinned values to draw axes checker', 'Pin both X and Y extents')
  }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
}

export function axesCheckerPolyline(cal: Calibration, _imageSize: [number, number]): [number, number][] {
  const kind = coordsType(cal)
  if (kind === 'map') {
    const bar = requireBar(cal)
    const a = bar.pixel_a
    const b = bar.pixel_b
    const unit = dataToPixel(cal, [bar.length, 0])
    const up = dataToPixel(cal, [0, bar.length])
    return [a, b, a, up, a, unit, a]
  }
  if (kind === 'polar') {
    const points = axisPoints(cal)
    const radii = points.map((p) => p.y_value).filter((v): v is number => v !== undefined && v !== null)
    const thetas = points.map((p) => p.x_value).filter((v): v is number => v !== undefined && v !== null)
    const rInner = originRadius(cal)
    const rOuter = radii.length ? Math.max(...radii) : rInner + 1
    const units = thetaUnits(cal)
    const t0 = thetas.length ? Math.min(...thetas) : 0
    const t1 = thetas.length
      ? Math.max(...thetas)
      : units === 'degrees'
        ? 360
        : units === 'radians'
          ? Math.PI * 2
          : units === 'gradians'
            ? 400
            : 1
    const n = 32
    const poly: [number, number][] = []
    for (let i = 0; i <= n; i++) poly.push(dataToPixel(cal, [t0 + ((t1 - t0) * i) / n, rOuter]))
    for (let i = 0; i <= n; i++) poly.push(dataToPixel(cal, [t1 + ((t0 - t1) * i) / n, rInner]))
    poly.push(poly[0])
    return poly
  }
  const [xmin, xmax, ymin, ymax] = dataLimits(cal)
  const corners: [number, number][] = [
    [xmin, ymin],
    [xmax, ymin],
    [xmax, ymax],
    [xmin, ymax],
    [xmin, ymin],
  ]
  return corners.map((c) => dataToPixel(cal, c))
}

export function isCalibrationValid(cal: Calibration | null): boolean {
  if (!cal) return false
  try {
    validateCalibration(cal)
    return true
  } catch {
    return false
  }
}
```

In `frontend/src/lib/transform.ts`, replace `CalibrationError`, `pixelToData`, and `isCalibrationValid` with re-exports, and extend `areCalibrationPixelsInImage` to visit `axis_points` and `scale_bar`. Keep `getAxisBounds` / `updateAxisBound` / `formatAxisValue` / `fitAxisTwoPoint` **removed** from the mapping path (mapping now goes through `transform2d`). `getAxisBounds` still uses local extreme-index logic for the four-bound UI — copy `extremeRefIndex` so four-bound editing still works without calling the old 1D fit for data values.

Replace the top of `transform.ts` with:

```typescript
import type { Calibration, RefPoint } from '../types'
export { CalibrationError, pixelToData, isCalibrationValid } from './transform2d'
```

Delete `axisPixelToValue`, `pixelToData`, `isCalibrationValid`, `fitAxisTwoPoint`, and the old `CalibrationError` class from this file. Keep `extremeRefIndex`, `getAxisBounds`, `updateAxisBound`, `formatAxisValue`, `areCalibrationPixelsInImage`.

Change `areCalibrationPixelsInImage` to:

```typescript
export function areCalibrationPixelsInImage(
  calibration: Calibration,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= imageWidth && y <= imageHeight
  for (const axis of [calibration.x, calibration.y]) {
    for (const ref of axis.ref_points) {
      if (!inside(ref.pixel[0], ref.pixel[1])) return false
    }
  }
  for (const pt of calibration.axis_points ?? []) {
    if (!inside(pt.pixel[0], pt.pixel[1])) return false
  }
  const bar = calibration.scale_bar
  if (bar) {
    if (!inside(bar.pixel_a[0], bar.pixel_a[1])) return false
    if (!inside(bar.pixel_b[0], bar.pixel_b[1])) return false
  }
  return true
}
```

Update `frontend/src/lib/calibration.ts` `createEmptyCalibration` to include the new defaults:

```typescript
  return {
    source: 'manual',
    coords_type: 'cartesian',
    model: 'auto',
    axis_points: [],
    theta_units: 'degrees',
    origin_radius: 0,
    scale_bar: null,
    x: { scale: 'linear', ref_points: [ ... ] },
    y: { scale: 'linear', ref_points: [ ... ] },
  }
```

Keep `setAxisBoundPixel` unchanged.

- [ ] **Step 4: Re-generate vectors and run both suites**

Run:

```bash
cd backend && .venv/bin/python tests/synth/gen_transform_vectors.py && .venv/bin/pytest tests/test_coords.py tests/test_polar.py tests/test_map.py tests/test_transform.py -v
cd ../frontend && npm test -- --run src/lib/__tests__/transform2d.test.ts
```

Expected: both PASS. Vitest reports every fixture case within 1e-9. (`toBeCloseTo(..., 9)` is 1e-9 absolute in the integer-digit sense for values around 1–10; for log-log values use the Python-generated expected numbers, not re-derived ones.)

Also run: `cd frontend && npm test`

Expected: PASS. The generator overwrites `transform-vectors.json` (orthogonal cases included). `transform.ts` no longer exports `fitAxisTwoPoint`; the mapping suite is `src/lib/__tests__/transform2d.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/transform2d.ts frontend/src/lib/transform.ts frontend/src/lib/calibration.ts frontend/src/types.ts frontend/src/lib/__tests__/transform2d.test.ts frontend/src/lib/__fixtures__/transform-vectors.json backend/tests/synth/gen_transform_vectors.py
git commit -m "$(cat <<'EOF'
feat: TypeScript 2D transform with 1e-9 Python parity

EOF
)"
```

---

### Task 8: Calibration UI, axes checker and resolution readout

**Files:**
- Create: `frontend/src/lib/axesChecker.ts`
- Create: `frontend/src/lib/__tests__/axesChecker.test.ts`
- Create: `frontend/src/components/AxesCheckerOverlay.tsx`
- Modify: `frontend/src/components/CalibrationPanel.tsx`
- Modify: `frontend/src/components/EditorCanvas.tsx` (delete `addPointMode`; required `canvasMode: CanvasMode`)
- Modify: `frontend/src/components/CurveList.tsx` (delete `addPointMode` / `onAddPointModeChange`)
- Modify: `frontend/src/App.tsx` (delete `addPointMode` state; one `CanvasMode` union)
- Modify: `backend/app/models/schemas.py` (`WorkspaceState.canvas_mode`, `show_axes_checker`)
- Modify: `README.md`, `UPDATES.md`
- Test: `frontend/src/lib/__tests__/axesChecker.test.ts` (pure helpers only — no testing-library / no DOM)

**Interfaces:**
- Consumes: `pixelToData`, `dataToPixel`, `resolvedModel`, `resolutionAt`, `axesCheckerPolyline`, `isCalibrationValid` from Task 7; existing `PATCH /sessions/{id}/preferences` with `calibration` (persists `axis_points` / `scale_bar` — **no new backend route**)
- Produces:
  - `export function axesCheckerVisible(enabled: boolean, changedAtMs: number, nowMs: number, holdMs?: number): boolean`
  - `export function formatModelLabel(model: TransformModel | 'invalid'): string`
  - `export function formatResolution(res: [number, number], coordsType: CoordsType): string`
  - `export function appendAxisPoint(cal: Calibration, pixel: [number, number], xValue: number | null, yValue: number | null): Calibration`
  - `export function setScaleBarPixel(cal: Calibration, which: 'a' | 'b', pixel: [number, number]): Calibration`
  - `CalibrationPanel`: coordinate-system selector; cartesian four-bound **or** “Precise (3+ points)”; polar origin / θ units / radius scale / origin radius; map two pixels + length + units; active model + resolution readout. Canvas `axis` clicks **append** an `AxisPoint` with `x_value`/`y_value` empty (`null`). The panel renders one row per point using the existing `BoundInput` (`type="text"` `inputMode="decimal"` `className="input-no-spinner w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"`, `shouldDeferBoundCommit` so a leading minus stays typeable) plus a delete button. No `window.prompt`.
  - `AxesCheckerOverlay`: implied axis rectangle (cartesian) or annular arc (polar) or scale-bar polyline (map); 3 s auto-hide; toggle persisted as `WorkspaceState.show_axes_checker` (default `true`)
  - `EditorCanvas` `axis` mode for full 2D axis points (and scale-bar clicks)
  - **Phase 1 owns the `addPointMode` → `CanvasMode` migration** (spec §5.3; this project already double-paid for two independent canvas flags — `UPDATES.md` `1.7.2` and `1.8.11`). Delete `addPointMode` and `onAddPointModeChange` from `App.tsx`, `EditorCanvas.tsx`, and `CurveList.tsx`. One `canvasMode: CanvasMode` state, typed as the **full** six-value union from Task 7 (`'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`), never a narrowed `'select' | 'place' | 'axis'`. Modes with no handler yet (`pick-color`, `segment-fill`, `point-match`) are inert. `CurveList`’s “Place points” button is no longer a private boolean: it toggles `'place'` ↔ `'select'` via `onCanvasModeChange`. Express stage-drag / click-guard conditions **positively** on the union (`canvasMode === 'select'`, plus existing `spaceDownRef` / `axisPlaceStep`) so Phases 2–4 add a handler rather than extending a negation chain. Leave `axisPlaceStep` as-is — it is four-bound bound-placing, not part of the mode union.
  - `WorkspaceState.canvas_mode: Literal["select","place","axis","pick-color","segment-fill","point-match"] = "select"`

- [ ] **Step 1: Write failing helper tests and WorkspaceState schema test**

Create `frontend/src/lib/axesChecker.ts` as a stub that will fail the tests until filled in — actually TDD: write tests first against the **intended** module, then implement.

Create `frontend/src/lib/__tests__/axesChecker.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  appendAxisPoint,
  axesCheckerVisible,
  formatModelLabel,
  formatResolution,
  setScaleBarPixel,
} from '../axesChecker'
import { axesCheckerPolyline } from '../transform2d'
import { createEmptyCalibration } from '../calibration'
import type { Calibration } from '../../types'

const empty = (): Calibration => createEmptyCalibration(800, 600)

describe('axesCheckerVisible', () => {
  it('hides when the toggle is off', () => {
    expect(axesCheckerVisible(false, 0, 1000)).toBe(false)
  })
  it('shows for 3 seconds after a change', () => {
    expect(axesCheckerVisible(true, 1000, 2500, 3000)).toBe(true)
    expect(axesCheckerVisible(true, 1000, 4000, 3000)).toBe(false)
  })
})

describe('formatModelLabel', () => {
  it('labels resolved models', () => {
    expect(formatModelLabel('affine')).toBe('affine')
    expect(formatModelLabel('orthogonal')).toBe('orthogonal')
    expect(formatModelLabel('projective')).toBe('projective')
    expect(formatModelLabel('invalid')).toBe('invalid')
  })
})

describe('formatResolution', () => {
  it('formats cartesian units/px', () => {
    expect(formatResolution([0.025, 0.01], 'cartesian')).toMatch(/0\.025/)
    expect(formatResolution([0.025, 0.01], 'cartesian')).toMatch(/\/px/)
  })
  it('formats polar as θ and R per pixel', () => {
    const text = formatResolution([0.2, 0.01], 'polar')
    expect(text.toLowerCase()).toMatch(/θ|theta/)
  })
})

describe('appendAxisPoint / setScaleBarPixel', () => {
  it('canvas axis-mode click appends a point with empty X/Y for the panel to edit', () => {
    const next = appendAxisPoint(empty(), [120, 80], null, null)
    expect(next.axis_points?.length).toBe(1)
    expect(next.axis_points?.[0].pixel).toEqual([120, 80])
    expect(next.axis_points?.[0].x_value).toBeNull()
    expect(next.axis_points?.[0].y_value).toBeNull()
  })
  it('can append a point that already has values', () => {
    const next = appendAxisPoint(empty(), [120, 80], 1, 2)
    expect(next.axis_points?.[0].x_value).toBe(1)
    expect(next.axis_points?.[0].y_value).toBe(2)
  })
  it('sets scale bar endpoints', () => {
    let cal = setScaleBarPixel(empty(), 'a', [5, 6])
    cal = setScaleBarPixel(cal, 'b', [15, 6])
    expect(cal.scale_bar?.pixel_a).toEqual([5, 6])
    expect(cal.scale_bar?.pixel_b).toEqual([15, 6])
  })
})

describe('axesCheckerPolyline geometry', () => {
  it('returns a closed quad for four-bound cartesian', () => {
    const poly = axesCheckerPolyline(empty(), [800, 600])
    expect(poly.length).toBeGreaterThanOrEqual(4)
    expect(poly[0][0]).toBeCloseTo(poly[poly.length - 1][0], 6)
    expect(poly[0][1]).toBeCloseTo(poly[poly.length - 1][1], 6)
  })
})
```

Add to `backend/tests/test_calibration_schema.py`:

```python
from app.models.schemas import WorkspaceState


def test_workspace_axes_checker_defaults():
    ws = WorkspaceState()
    assert ws.show_axes_checker is True
    assert ws.canvas_mode == "select"


def test_old_workspace_payload_still_validates():
    ws = WorkspaceState.model_validate({"active_curve_id": "c1", "resample_count": 9})
    assert ws.show_axes_checker is True
    assert ws.canvas_mode == "select"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend && npm test -- --run src/lib/__tests__/axesChecker.test.ts
cd ../backend && .venv/bin/pytest tests/test_calibration_schema.py::test_workspace_axes_checker_defaults tests/test_calibration_schema.py::test_old_workspace_payload_still_validates -v
```

Expected: frontend FAIL `Failed to resolve import '../axesChecker'`. Backend FAIL `AttributeError: canvas_mode` / `show_axes_checker`.

- [ ] **Step 3: Implement helpers, schema fields, overlay, panel, canvas mode, App wiring, docs**

Add to `WorkspaceState` in `backend/app/models/schemas.py` (keep existing fields):

```python
class WorkspaceState(BaseModel):
    active_curve_id: str | None = None
    resample_count: int = Field(default=DEFAULT_POINT_COUNT, ge=2, le=200)
    unskew_mode: Literal["perspective", "mesh"] | None = None
    mesh: MeshGridPayload | None = None
    canvas_mode: Literal[
        "select", "place", "axis", "pick-color", "segment-fill", "point-match"
    ] = "select"
    show_axes_checker: bool = True
```

Create `frontend/src/lib/axesChecker.ts`:

```typescript
import type { Calibration, CoordsType, TransformModel } from '../types'
import { formatAxisValue } from './transform'

export function axesCheckerVisible(
  enabled: boolean,
  changedAtMs: number,
  nowMs: number,
  holdMs = 3000,
): boolean {
  if (!enabled) return false
  return nowMs - changedAtMs <= holdMs
}

export function formatModelLabel(model: TransformModel | 'invalid'): string {
  return model
}

export function formatResolution(res: [number, number], coordsType: CoordsType): string {
  const a = formatAxisValue(res[0])
  const b = formatAxisValue(res[1])
  if (coordsType === 'polar') return `θ ${a}/px · R ${b}/px`
  if (coordsType === 'map') return `${a} units/px`
  return `${a} x/px · ${b} y/px`
}

export function appendAxisPoint(
  cal: Calibration,
  pixel: [number, number],
  xValue: number | null,
  yValue: number | null,
): Calibration {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ap-${pixel[0]}-${pixel[1]}-${Date.now()}`
  return {
    ...cal,
    source: 'manual',
    axis_points: [
      ...(cal.axis_points ?? []),
      { id, pixel, x_value: xValue, y_value: yValue },
    ],
  }
}

export function setScaleBarPixel(
  cal: Calibration,
  which: 'a' | 'b',
  pixel: [number, number],
): Calibration {
  const prev = cal.scale_bar ?? {
    pixel_a: [0, 0] as [number, number],
    pixel_b: [0, 0] as [number, number],
    length: 1,
    units: '',
  }
  return {
    ...cal,
    source: 'manual',
    coords_type: 'map',
    scale_bar: {
      ...prev,
      pixel_a: which === 'a' ? pixel : prev.pixel_a,
      pixel_b: which === 'b' ? pixel : prev.pixel_b,
    },
  }
}
```

Create `frontend/src/components/AxesCheckerOverlay.tsx`:

```tsx
import { Line } from 'react-konva'
import type { Calibration } from '../types'
import { axesCheckerPolyline, isCalibrationValid } from '../lib/transform2d'
import { axesCheckerVisible } from '../lib/axesChecker'

interface Props {
  calibration: Calibration | null
  imageWidth: number
  imageHeight: number
  enabled: boolean
  changedAtMs: number
  nowMs: number
  scale: number
}

export function AxesCheckerOverlay({
  calibration,
  imageWidth,
  imageHeight,
  enabled,
  changedAtMs,
  nowMs,
  scale,
}: Props) {
  if (!calibration || !isCalibrationValid(calibration)) return null
  if (!axesCheckerVisible(enabled, changedAtMs, nowMs)) return null
  let points: [number, number][] = []
  try {
    points = axesCheckerPolyline(calibration, [imageWidth, imageHeight])
  } catch {
    return null
  }
  if (points.length < 2) return null
  return (
    <Line
      points={points.flat()}
      stroke="#fbbf24"
      strokeWidth={2 / scale}
      dash={[6 / scale, 4 / scale]}
      closed={false}
      listening={false}
    />
  )
}
```

Rewrite `frontend/src/components/CalibrationPanel.tsx` as this complete file:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type {
  Calibration,
  CoordsType,
  Scale,
  ThetaUnits,
  TransformModel,
} from '../types'
import {
  formatAxisValue,
  getAxisBounds,
  updateAxisBound,
  type AxisBoundKey,
} from '../lib/transform'
import { AXIS_PLACE_LABELS } from '../lib/calibration'
import {
  isCalibrationValid,
  resolutionAt,
  resolvedModel,
} from '../lib/transform2d'
import { formatModelLabel, formatResolution } from '../lib/axesChecker'

interface Props {
  calibration: Calibration | null
  axisPlaceStep: AxisBoundKey | null
  preciseMode: boolean
  scaleBarStep: 'a' | 'b' | null
  showAxesChecker: boolean
  onToggleAxesChecker: (show: boolean) => void
  onStartAxisPlacement: () => void
  onStartPrecisePlacement: () => void
  onStartScaleBarPlacement: () => void
  onChange: (cal: Calibration) => void
  onSave: () => void
}

function shouldDeferBoundCommit(raw: string): boolean {
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return true
  if (raw.endsWith('.')) return true
  if (/^-0$/.test(raw)) return true
  return false
}

function BoundInput({
  value,
  logScale,
  title,
  allowEmpty = false,
  onCommit,
}: {
  value: number | null
  logScale: boolean
  title?: string
  allowEmpty?: boolean
  onCommit: (value: number | null) => void
}) {
  const shown = value == null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => {
    setDraft(value == null ? '' : String(value))
  }, [value])
  const tryCommit = (raw: string) => {
    if (shouldDeferBoundCommit(raw)) return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    if (logScale && n <= 0) return
    onCommit(n)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      className="input-no-spinner w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        tryCommit(raw)
      }}
      onBlur={() => {
        if (allowEmpty && draft.trim() === '') {
          onCommit(null)
          return
        }
        if (shouldDeferBoundCommit(draft)) {
          setDraft(value == null ? '' : String(value))
          return
        }
        const n = Number(draft)
        if (!Number.isFinite(n) || (logScale && n <= 0)) {
          setDraft(value == null ? '' : String(value))
          return
        }
        setDraft(String(n))
        onCommit(n)
      }}
    />
  )
}

export function CalibrationPanel({
  calibration,
  axisPlaceStep,
  preciseMode,
  scaleBarStep,
  showAxesChecker,
  onToggleAxesChecker,
  onStartAxisPlacement,
  onStartPrecisePlacement,
  onStartScaleBarPlacement,
  onChange,
  onSave,
}: Props) {
  const coords: CoordsType = calibration?.coords_type ?? 'cartesian'
  const bounds = calibration && coords === 'cartesian' && !preciseMode ? getAxisBounds(calibration) : null

  const modelLabel = useMemo(() => {
    if (!calibration || !isCalibrationValid(calibration)) return 'invalid'
    try {
      return resolvedModel(calibration)
    } catch {
      return 'invalid'
    }
  }, [calibration])

  const resolutionText = useMemo(() => {
    if (!calibration || !isCalibrationValid(calibration)) return '—'
    try {
      const pixel =
        calibration.axis_points?.[0]?.pixel ??
        calibration.x.ref_points[0]?.pixel ??
        calibration.scale_bar?.pixel_a ??
        ([0, 0] as [number, number])
      return formatResolution(resolutionAt(calibration, pixel), coords)
    } catch {
      return '—'
    }
  }, [calibration, coords])

  const setCoords = (next: CoordsType) => {
    if (!calibration) return
    onChange({
      ...calibration,
      source: 'manual',
      coords_type: next,
      axis_points: next === 'cartesian' ? calibration.axis_points : calibration.axis_points,
    })
  }

  const updateScale = (axis: 'x' | 'y', scale: Scale) => {
    if (!calibration) return
    onChange({
      ...calibration,
      source: 'manual',
      [axis]: { ...calibration[axis], scale },
    })
  }

  const commitBoundValue = (key: AxisBoundKey, value: number) => {
    if (!calibration) return
    if (calibration[key.startsWith('x') ? 'x' : 'y'].scale === 'log' && value <= 0) return
    onChange(updateAxisBound(calibration, key, { value }))
  }

  const placeTitle = axisPlaceStep
    ? `Click on the plot: ${AXIS_PLACE_LABELS[axisPlaceStep]}`
    : preciseMode
      ? 'Click the plot to add a precise axis point'
      : scaleBarStep
        ? `Click scale-bar ${scaleBarStep === 'a' ? 'start' : 'end'}`
        : 'Click four points on the plot: X min, X max, Y min, Y max'

  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Calibration</h3>
        <select
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          value={coords}
          onChange={(e) => setCoords(e.target.value as CoordsType)}
          title="Coordinate system"
        >
          <option value="cartesian">Cartesian</option>
          <option value="polar">Polar</option>
          <option value="map">Map</option>
        </select>
        {coords === 'cartesian' && (
          <button
            type="button"
            title={placeTitle}
            onClick={preciseMode ? onStartPrecisePlacement : onStartAxisPlacement}
            className={`shrink-0 rounded px-2 py-0.5 font-medium ${
              axisPlaceStep || preciseMode ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {axisPlaceStep ? `Placing ${axisPlaceStep.toUpperCase()}` : preciseMode ? 'Placing points' : 'Place bounds'}
          </button>
        )}
        {coords === 'cartesian' && (
          <label className="inline-flex items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              checked={preciseMode}
              onChange={(e) => {
                if (e.target.checked) onStartPrecisePlacement()
                else onStartAxisPlacement()
              }}
            />
            Precise (3+ points)
          </label>
        )}
        {coords === 'map' && (
          <button
            type="button"
            onClick={onStartScaleBarPlacement}
            className={`shrink-0 rounded px-2 py-0.5 font-medium ${
              scaleBarStep ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {scaleBarStep ? `Bar ${scaleBarStep.toUpperCase()}` : 'Place scale bar'}
          </button>
        )}
        {coords === 'polar' && (
          <button
            type="button"
            onClick={onStartPrecisePlacement}
            className="shrink-0 rounded bg-sky-600 px-2 py-0.5 font-medium hover:bg-sky-500"
          >
            Place polar points
          </button>
        )}
        {calibration && (
          <button
            type="button"
            onClick={onSave}
            className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
          >
            Save
          </button>
        )}
      </div>

      {calibration && coords === 'cartesian' && bounds && !preciseMode && (
        <div className="flex flex-col gap-0.5">
          {(['x', 'y'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <label className="inline-flex w-14 shrink-0 items-center gap-1 text-slate-300">
                {axis.toUpperCase()}
                <select
                  className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                  value={calibration[axis].scale}
                  onChange={(e) => updateScale(axis, e.target.value as Scale)}
                >
                  <option value="linear">lin</option>
                  <option value="log">log</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                {axis === 'x' ? 'Xmin' : 'Ymin'}
                <BoundInput
                  value={bounds[axis === 'x' ? 'xmin' : 'ymin'].value}
                  logScale={calibration[axis].scale === 'log'}
                  title={formatAxisValue(bounds[axis === 'x' ? 'xmin' : 'ymin'].value)}
                  onCommit={(value) => {
                    if (value == null) return
                    commitBoundValue(axis === 'x' ? 'xmin' : 'ymin', value)
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                {axis === 'x' ? 'Xmax' : 'Ymax'}
                <BoundInput
                  value={bounds[axis === 'x' ? 'xmax' : 'ymax'].value}
                  logScale={calibration[axis].scale === 'log'}
                  title={formatAxisValue(bounds[axis === 'x' ? 'xmax' : 'ymax'].value)}
                  onCommit={(value) => {
                    if (value == null) return
                    commitBoundValue(axis === 'x' ? 'xmax' : 'ymax', value)
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'cartesian' && preciseMode && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            Model
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.model ?? 'auto'}
              onChange={(e) => onChange({ ...calibration, source: 'manual', model: e.target.value as TransformModel })}
            >
              <option value="auto">auto</option>
              <option value="orthogonal">orthogonal</option>
              <option value="affine">affine</option>
              <option value="projective">projective</option>
            </select>
          </label>
          <p>{(calibration.axis_points ?? []).length} axis points — click the plot, then type X and/or Y</p>
          {(calibration.axis_points ?? []).map((pt, i) => (
            <div key={pt.id} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                X
                <BoundInput
                  value={pt.x_value ?? null}
                  logScale={calibration.x.scale === 'log'}
                  title="X"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, x_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                Y
                <BoundInput
                  value={pt.y_value ?? null}
                  logScale={calibration.y.scale === 'log'}
                  title="Y"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, y_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <button
                type="button"
                className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
                onClick={() =>
                  onChange({
                    ...calibration,
                    source: 'manual',
                    axis_points: (calibration.axis_points ?? []).filter((p) => p.id !== pt.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'polar' && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            θ units
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.theta_units ?? 'degrees'}
              onChange={(e) =>
                onChange({ ...calibration, source: 'manual', theta_units: e.target.value as ThetaUnits })
              }
            >
              <option value="degrees">degrees</option>
              <option value="radians">radians</option>
              <option value="gradians">gradians</option>
              <option value="turns">turns</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Radius
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.y.scale}
              onChange={(e) => updateScale('y', e.target.value as Scale)}
            >
              <option value="linear">lin</option>
              <option value="log">log</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Origin R
            <BoundInput
              value={calibration.origin_radius ?? 0}
              logScale={false}
              onCommit={(value) => {
                if (value == null) return
                onChange({ ...calibration, source: 'manual', origin_radius: value })
              }}
            />
          </label>
          <p>Click the plot to place a point, then type θ and R. {(calibration.axis_points ?? []).length} placed.</p>
          {(calibration.axis_points ?? []).map((pt, i) => (
            <div key={pt.id} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                θ
                <BoundInput
                  value={pt.x_value ?? null}
                  logScale={false}
                  title="θ"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, x_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                R
                <BoundInput
                  value={pt.y_value ?? null}
                  logScale={calibration.y.scale === 'log'}
                  title="R"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, y_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <button
                type="button"
                className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
                onClick={() =>
                  onChange({
                    ...calibration,
                    source: 'manual',
                    axis_points: (calibration.axis_points ?? []).filter((p) => p.id !== pt.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'map' && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            Length
            <BoundInput
              value={calibration.scale_bar?.length ?? 1}
              logScale={false}
              onCommit={(value) => {
                if (value == null) return
                onChange({
                  ...calibration,
                  source: 'manual',
                  scale_bar: {
                    pixel_a: calibration.scale_bar?.pixel_a ?? [0, 0],
                    pixel_b: calibration.scale_bar?.pixel_b ?? [0, 0],
                    length: value,
                    units: calibration.scale_bar?.units ?? '',
                  },
                })
              }}
            />
          </label>
          <label className="inline-flex items-center gap-1">
            Units
            <input
              className="w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.scale_bar?.units ?? ''}
              onChange={(e) =>
                onChange({
                  ...calibration,
                  source: 'manual',
                  scale_bar: {
                    pixel_a: calibration.scale_bar?.pixel_a ?? [0, 0],
                    pixel_b: calibration.scale_bar?.pixel_b ?? [0, 0],
                    length: calibration.scale_bar?.length ?? 1,
                    units: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-slate-400">
        <span>model {formatModelLabel(modelLabel)}</span>
        <span>{resolutionText}</span>
        <label className="ml-auto inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={showAxesChecker}
            onChange={(e) => onToggleAxesChecker(e.target.checked)}
          />
          Axes checker
        </label>
      </div>
    </section>
  )
}
```

**`addPointMode` → `CanvasMode` migration (Phase 1 owns this).** Delete the boolean and its setter from all three files. Do not leave `addPointMode` as a parallel flag. Type every prop and the `App` state as `CanvasMode` (the full six-value union from `types.ts`), never `'select' | 'place' | 'axis'`. A mode with no handler yet is inert. Express drag / click-guard conditions positively (`canvasMode === 'select'`, plus existing `spaceDownRef` and `axisPlaceStep`) so Phases 2–4 add a handler instead of extending `!addPointMode && canvasMode !== 'pick-color'`-style chains. `axisPlaceStep` stays — it is four-bound bound-placing, not part of the union.

**EditorCanvas.tsx** — every `addPointMode` site (file today has no `onAddPointModeChange`). Import `CanvasMode` from `../types`.

1. **Props (`addPointMode: boolean`, today ~line 32).** Replace with required full-union `canvasMode` plus the new overlay / axis-click props (do **not** narrow the union; do **not** keep `addPointMode`):

```typescript
  canvasMode: CanvasMode
  onAxisPointClick?: (pixel: [number, number]) => void
  onMoveAxisPoint?: (id: string, pixel: [number, number]) => void
  showAxesChecker?: boolean
  axesCheckerChangedAt?: number
  axesCheckerNow?: number
```

2. **Destructure (`addPointMode`, today ~line 110).** Replace with `canvasMode` (and the new optional props).

3. **Stage-drag sync (`useEffect` on `addPointMode`, today ~lines 339–342).** Positive on `'select'`:

```typescript
  useEffect(() => {
    if (canvasMode === 'select') setStageDraggable(true)
    else if (!spaceDownRef.current) setStageDraggable(false)
  }, [canvasMode])
```

4. **`handleStageMouseDown` place-points branch (today ~line 447).** `addPointMode` → `canvasMode === 'place'`. After the existing `axisPlaceStep` branch (unchanged), insert the new `axis` branch, then the place-points branch:

```typescript
    if (axisPlaceStep) {
      onAxisPlaceClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'axis' && onAxisPointClick) {
      onAxisPointClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'place' && placementCurveId) {
      onAddPoint(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
```

5. **`handleStageClick` selection-clear guard (today ~line 474).** Only clear in `'select'` (plus existing `axisPlaceStep` early-return):

```typescript
    if (axisPlaceStep) return
    if (canvasMode === 'select') onClearSelection()
```

6. **`handleMouseUp` restage (today ~line 502).** Positive on `'select'`:

```typescript
    setStageDraggable(canvasMode === 'select' && !axisPlaceStep && spaceDownRef.current)
```

7. **`<PlotInteractionHint>` prop (today ~line 573).** `addPointMode={addPointMode}` → `canvasMode={canvasMode}`.

8. **`<Stage draggable={…}>` (today ~line 587).** Positive on `'select'` (Space-pan still overrides):

```tsx
        draggable={stageDraggable && (canvasMode === 'select' || spacePan) && !axisPlaceStep}
```

9. **`PlotInteractionHint` helper (today ~lines 676–693).** Replace the `addPointMode: boolean` prop with `canvasMode: CanvasMode`. Keep the `axisPlaceStep` branch first. Then:

```typescript
  } else if (canvasMode === 'axis') {
    text = `Left-click to place an axis point (type values in the Calibration panel). ${panHint}`
  } else if (canvasMode === 'place') {
    text = `Left-click to place points on the first visible curve. Delete/Backspace: undo last point. ${panHint}`
```

Import overlay and render it inside the Konva `Layer` after calibration marks:

```tsx
import { AxesCheckerOverlay } from './AxesCheckerOverlay'
```

Inside the Layer, after mesh overlay:

```tsx
          <AxesCheckerOverlay
            calibration={calibration}
            imageWidth={width}
            imageHeight={height}
            enabled={showAxesChecker ?? true}
            changedAtMs={axesCheckerChangedAt ?? 0}
            nowMs={axesCheckerNow ?? Date.now()}
            scale={totalScale}
          />
```

When `calibration.axis_points` is non-empty, also map those points as `CalibrationMark`s with labels `#1`, `#2`, … (drag calls `onMoveAxisPoint`). When `coords_type === 'map'` and `scale_bar` exists, draw two marks `A` / `B`.

**CurveList.tsx** — every `addPointMode` / `onAddPointModeChange` site. Keep the existing `disabled={busy || !placementCurveId}` and the existing `title` ternary text. Import `CanvasMode` from `../types`.

1. **Props (today ~lines 14–15):**

```typescript
  canvasMode: CanvasMode
  onCanvasModeChange: (mode: CanvasMode) => void
```

2. **Destructure (today ~lines 31–32):** `addPointMode, onAddPointModeChange` → `canvasMode, onCanvasModeChange`.

3. **“Place points” `onClick` (today ~line 104)** — toggle `'place'` ↔ `'select'`:

```tsx
            onClick={() => onCanvasModeChange(canvasMode === 'place' ? 'select' : 'place')}
```

4. **Active styling (today ~line 106)** — `addPointMode` → `canvasMode === 'place'`:

```tsx
            className={`rounded px-2 py-0.5 text-[11px] disabled:opacity-50 ${
              canvasMode === 'place'
                ? 'bg-sky-600 hover:bg-sky-500'
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
```

**App.tsx** — every `addPointMode` / `setAddPointMode` / `onAddPointModeChange` site. Import `CanvasMode` from `./types`.

1. **State (today ~line 73).** Delete `const [addPointMode, setAddPointMode] = useState(false)`. Replace with the full-union state plus the new Task 8 clocks (do **not** write `useState<'select' | 'place' | 'axis'>`):

```typescript
  const [preciseMode, setPreciseMode] = useState(false)
  const [scaleBarStep, setScaleBarStep] = useState<'a' | 'b' | null>(null)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
  const [showAxesChecker, setShowAxesChecker] = useState(true)
  const [axesCheckerChangedAt, setAxesCheckerChangedAt] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
```

2. **Delete-key handler (today ~line 487) and its effect deps (~line 500).** `addPointMode` → `canvasMode === 'place'`:

```typescript
      if (canvasMode === 'place' && placementCurveId) {
        if (handleRemoveLastPlacedPoint()) e.preventDefault()
        return
      }
```

Dependency array: `addPointMode` → `canvasMode`.

3. **`startAxisPlacement` (today ~line 741).** `setAddPointMode(false)` → `setCanvasMode('select')` (four-bound placing stays on `axisPlaceStep`, not `'axis'`):

```typescript
    setAxisPlaceStep('xmin')
    setCanvasMode('select')
    setSelectedPointIds([])
```

4. **`onLoadProject` (today ~line 859).** `setAddPointMode(false)` → `setCanvasMode('select')`:

```typescript
              setSelectedPointIds([])
              setCanvasMode('select')
              setAxisPlaceStep(null)
```

5. **`<EditorCanvas>` prop (today ~line 889).** `addPointMode={addPointMode}` → `canvasMode={canvasMode}` plus the new overlay / axis-click props (`onAxisPointClick={handleAxisPointClick}`, `showAxesChecker`, `axesCheckerChangedAt`, `axesCheckerNow={nowMs}`).

6. **`<CurveList>` props (today ~lines 919–923).** Delete `addPointMode` / `onAddPointModeChange`. Entering `'place'` still clears `axisPlaceStep`:

```tsx
            canvasMode={canvasMode}
            onCanvasModeChange={(mode) => {
              setCanvasMode(mode)
              if (mode === 'place') setAxisPlaceStep(null)
            }}
```

When applying workspace from session (inside `applyWorkspaceFromSession`), restore any of the six values — do **not** name only three:

```typescript
    if (ws?.show_axes_checker !== undefined) setShowAxesChecker(ws.show_axes_checker)
    const CANVAS_MODES: readonly CanvasMode[] = [
      'select',
      'place',
      'axis',
      'pick-color',
      'segment-fill',
      'point-match',
    ]
    if (ws?.canvas_mode && CANVAS_MODES.includes(ws.canvas_mode)) {
      setCanvasMode(ws.canvas_mode)
    }
```

After `handleCalibrationChange`, bump the checker clock:

```typescript
  const bumpChecker = () => {
    const t = Date.now()
    setAxesCheckerChangedAt(t)
    setNowMs(t)
  }

  useEffect(() => {
    if (!showAxesChecker) return
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [showAxesChecker, axesCheckerChangedAt])
```

Call `bumpChecker()` inside `handleCalibrationChange` and bound-drag handlers.

Precise placement (no `setAddPointMode` — `'axis'` is the mode):

```typescript
  const startPrecisePlacement = () => {
    if (!session) return
    const w = session.image_meta.width
    const h = session.image_meta.height
    const cal = draftCalibration ?? createEmptyCalibration(w, h)
    const next = { ...cal, coords_type: 'cartesian' as const, axis_points: cal.axis_points ?? [] }
    setDraftCalibration(next)
    setPreciseMode(true)
    setAxisPlaceStep(null)
    setCanvasMode('axis')
    savePreferencesQuiet({
      calibration: next,
      manual_calibration: true,
      workspace: { ...(session.workspace ?? {}), canvas_mode: 'axis', show_axes_checker: showAxesChecker },
    })
  }

  const handleAxisPointClick = (pixel: [number, number]) => {
    if (!draftCalibration) return
    const coords = draftCalibration.coords_type ?? 'cartesian'
    if (coords === 'map' && scaleBarStep) {
      const next = setScaleBarPixel(draftCalibration, scaleBarStep, pixel)
      setDraftCalibration(next)
      savePreferencesQuiet({ calibration: next, manual_calibration: true })
      bumpChecker()
      setScaleBarStep(scaleBarStep === 'a' ? 'b' : null)
      if (scaleBarStep === 'b') setCanvasMode('select')
      return
    }
    const next = appendAxisPoint(draftCalibration, pixel, null, null)
    setDraftCalibration(next)
    savePreferencesQuiet({ calibration: next, manual_calibration: true })
    bumpChecker()
  }
```

Import `appendAxisPoint` and `setScaleBarPixel` from `./lib/axesChecker`. The panel’s `BoundInput` rows are where the user types X/Y or θ/R (same `shouldDeferBoundCommit` + `input-no-spinner` as today’s min/max fields).

Toggle checker:

```typescript
  const handleToggleAxesChecker = (show: boolean) => {
    setShowAxesChecker(show)
    if (!session) return
    saveWorkspaceQuiet()
    savePreferencesQuiet({
      workspace: {
        ...(session.workspace ?? {}),
        show_axes_checker: show,
        canvas_mode: canvasMode,
      },
    })
  }
```

Extend `saveWorkspaceQuiet`'s workspace object (and add `canvasMode` / `showAxesChecker` to that callback’s dependency list):

```typescript
        canvas_mode: canvasMode,
        show_axes_checker: showAxesChecker,
```

Pass the new props into `CalibrationPanel` and `EditorCanvas` as listed above. After this task, `rg addPointMode frontend/src` must be empty.

**README.md** — in Architecture, change the calibration bullet from “pixel ↔ data transforms (linear / log)” to “pixel ↔ data 2D transform (orthogonal / affine / projective; cartesian, polar, map)”. In Typical Workflow, mention Precise (3+ points), polar, and map as optional calibration modes. Touch no other markdown.

**UPDATES.md** — insert this exact entry at the top of the Changelog (newest first). Title must be “Affine, projective, polar and map calibration”:

```markdown
## [2.3.0] — 2026-09-04 — Affine, projective, polar and map calibration
### Added
- 2D transform solver (orthogonal / affine / projective, `auto`) plus polar and map adapters; precise 3+ axis points; axes checker overlay; graph-units-per-pixel readout.
### Changed
- Four-bound cartesian sessions keep producing the same numbers as the old 1D fit (exact to 1e-12).
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend && npm test -- --run src/lib/__tests__/axesChecker.test.ts src/lib/__tests__/transform2d.test.ts
cd ../backend && .venv/bin/pytest tests/test_calibration_schema.py tests/test_coords.py tests/test_polar.py tests/test_map.py tests/test_calibration.py tests/test_preferences.py tests/test_transform.py -v
```

Expected: PASS.

Then: `cd frontend && npm test` and `cd backend && .venv/bin/pytest -q`.

Expected: full suites PASS; reference tests SKIP if `PLOTDIG_REF_DIR` is absent.

Manual UI check (if a browser is available): cartesian four-bound still places xmin→xmax→ymin→ymax; Precise / polar `axis` clicks append an empty row and the panel `BoundInput`s accept a leading minus while typing; axes checker flashes 3 s; polar/map fields persist on reload of last session; CurveList “Place points” toggles `canvasMode` `'place'` ↔ `'select'` (active styling when `'place'`) and does not leave a leftover `addPointMode` boolean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/axesChecker.ts frontend/src/lib/__tests__/axesChecker.test.ts frontend/src/components/AxesCheckerOverlay.tsx frontend/src/components/CalibrationPanel.tsx frontend/src/components/EditorCanvas.tsx frontend/src/components/CurveList.tsx frontend/src/App.tsx backend/app/models/schemas.py backend/tests/test_calibration_schema.py README.md UPDATES.md
git commit -m "$(cat <<'EOF'
feat: calibration UI for precise, polar, and map with axes checker

EOF
)"
```

---

## Self-Review

**1. Spec coverage.** §5.1 solver + three adapters → Tasks 2, 3, 5, 6. §6 Calibration fields → Task 1; `WorkspaceState.canvas_mode` / `show_axes_checker` → Task 8. §5.3 one `CanvasMode` union (delete `addPointMode`) → Task 8. §7 `transform.py` / `coords.py` signatures → Tasks 2–3 (polar/map extend `coords.py` in 5–6). §9 CalibrationPanel, axes checker, resolution, `axis` canvas mode → Task 8. §10.4 orthogonal 1e-12 → Task 3; affine 0.2 % / projective 0.5 % → Task 3; 9-doc CSV → Task 4; polar θ/R → Task 5; frontend 1e-9 → Task 7. Colour filter, grid, snap, segments, point match, scatter preview, CSV header rename → later phases, intentionally omitted.

**2. Placeholder scan.** No TBD/TODO. Polar “not implemented” stubs exist only in Task 3’s `coords.py` and are replaced with full code in Tasks 5 and 6 (complete files restated, not “similar to Task N”). Axis-point values are typed in the existing `BoundInput` (no `window.prompt`). `render_plot(..., perspective=0.18)` is the Phase 0 float top-edge inset; no alternate call shape.

**3. Type consistency.** `CalibrationError(message, hint="")`, `Constraint`, `Transform2D`, `build_constraints` / `buildConstraints`, `solve_transform` / `solveTransform`, `pixel_to_data` / `pixelToData`, `data_to_pixel` / `dataToPixel`, `validate_calibration` / `validateCalibration`, `resolution_at` / `resolutionAt`, `axes_checker_polyline` / `axesCheckerPolyline` match across Python and TS. Polar radius scale is `Calibration.y.scale`. Map never calls the solver. `axis_points` persist through existing `POST /calibration` and `PATCH /preferences`. Phase 0 `plotgen.AxisPoint` / `ReferenceAxisPoint` are not production models — every `Calibration(...)` call site constructs `schemas.AxisPoint` field by field; the generator is not asked to import `schemas.AxisPoint`. Task 8 deletes `addPointMode` / `onAddPointModeChange`; `canvasMode` and `WorkspaceState.canvas_mode` are the full six-value `CanvasMode` (no narrowed union); stage-drag / click-guard use `canvasMode === 'select'`.

---

## Deviations from the brief / spec (intentional)

1. **No new HTTP route for `axis_points`.** They are fields on `Calibration`, so the existing calibration and preferences endpoints persist them. Adding a duplicate route would violate YAGNI and spec §8 (Phase 1 is not in the new-route table).
2. **Phase 4 still owns CSV headers and Plotly polar/map preview.** `pixel_to_data` already returns `(θ, R)` / map units; column names stay `x,y` until Phase 4.
3. **Spec §6 `WorkspaceState` fields for filter/segments/point-match are not added** (`show_mask`, `point_separation`, …). Only `canvas_mode` and `show_axes_checker` land here. `canvas_mode` uses the full spec union so later phases do not migrate the type. Phase 1 also deletes `addPointMode` (the existing boolean) so Phases 2–4 add values to one union rather than a second flag.
4. **`ColorFilter` / `ConnectAs` / `Curve.filter` are not in Task 1** — the brief lists only calibration schema types for Task 1.
5. **Polar radius scale lives on `Calibration.y.scale`** (spec’s `scale_radius` is not a schema field).
6. **Four polar corpus docs** (verified on disk): `guidelines_polar.xml`, `guidelines_polar_log.xml`, `polar_linear_linear_3curve.xml`, `polar_linear_linear_nonzero_center.xml`. The shear/rotated `.dig` files are excluded because they have zero `CmdAddPointAxis` records (no calibration ground truth).
7. **`render_plot(..., perspective=0.18)`** uses Phase 0’s pinned `perspective: float | None` (top-edge inset fraction).
8. **`model="auto"` on four-bound cartesian is forced to orthogonal** in `_transform_of` so two X + two Y bounds cannot be mis-read as a deficient projective/affine attempt. Explicit `model="affine"` / `"projective"` still available in precise mode.
9. **Precise/polar axis-point values are typed in the existing CalibrationPanel `BoundInput`** (text + `input-no-spinner`, leading-minus deferred). A canvas `axis` click only appends an empty `AxisPoint`; there is no `window.prompt`.
