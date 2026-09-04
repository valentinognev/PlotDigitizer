# Precision Toolkit Design (Engauge-informed)

**Status:** approved architecture, pending plan execution
**Supersedes nothing.** Extends `refs/WORKFLOW.md` (v2.2 manual pipeline).
**Reference project:** Engauge Digitizer at `/home/valentin/Projects/t/engauge-digitizer` (GPL-2.0+, read-only reference).

---

## 1. Goal

Raise PlotDigitizer's digitization accuracy and widen its toolkit by porting *techniques*
(not code) from Engauge Digitizer, in three tracks the user selected:

- **A — Precision of the existing line-graph workflow.**
- **B — Faster automatic digitizing.**
- **D — Additional plot kinds: scatter, polar, maps.**

Track C (spline/shared-X export, geometry/area, extra digits) is explicitly **out of scope**.

## 2. Non-goals

- No re-introduction of VLM / AI services (removed in v2.0, stays removed).
- No Engauge UI clone: no digitize-state toolbar, no modal settings dialogs.
- No date/time or DMS axis units, no multiple coordinate systems per image, no PDF/JPEG2000
  import, no polynomial-fitting window, no CLI batch mode, no cubic-spline export.
- No FFTW dependency; correlation uses OpenCV.
- No change to the persistence model (in-memory `SessionStore` + last-session on disk).

## 3. Global constraints

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

## 4. Current state (baseline being improved)

| Area | Today |
|---|---|
| Calibration | Four bound pixels (Xmin/Xmax/Ymin/Ymax), independent **1D** least-extremes fit per axis, linear or log10. Rotation/shear must be removed by image warp first. |
| Tracing | `cv/trace.py` BGR-distance + optional hue band mask; `cv/improve.py` samples ink from the darkest quartile of a 9×9 patch under each seed, builds a corridor, snaps samples to the nearest mask pixel within 25 px. |
| Resampling | Arc-length linear interpolation to `target_point_count`. |
| Image conditioning | None (no colour filter, no grid removal). `cv/erase.py` exists, reachable only by API. |
| Plot kinds | Cartesian line graphs only. |
| Tests | 15 backend pytest files, synthetic/inline only. **No frontend test runner.** |

## 5. Architecture

### 5.1 One transform solver, three coordinate adapters

The precision core is a single solver that maps **pixel → linear graph space**, plus thin
adapters that turn linear graph space into the user's coordinate system. This replaces the
per-axis 1D fit as the general path while keeping it as one of the solver's models.

```
                       ┌───────────────────────── calibration/transform.py ──────────────────────────┐
axis points ─────────▶ │  build_constraints()  →  solve_transform()  →  Transform2D                  │
(pixel, known coord)   │      orthogonal (4 unknowns) | affine (6) | projective (8)                  │
                       └───────────────────────────────────┬─────────────────────────────────────────┘
                                                           │ (u, v) linear graph space
                       ┌───────────────────────────────────┴─────────────────────────────────────────┐
                       │ cartesian adapter │ polar adapter │ map adapter   (calibration/coords.py)  │
                       └─────────────────────────────────────────────────────────────────────────────┘
```

**Constraint.** Each axis point contributes one constraint per coordinate it pins:

```python
@dataclass(frozen=True)
class Constraint:
    pixel: tuple[float, float]
    axis: Literal["u", "v"]   # which linear-graph coordinate is known
    value: float              # already log10-transformed when that axis is log
```

**Models** (`pixel (px, py) → (u, v)`):

| Model | Equations | Unknowns | Requires | Handles |
|---|---|---|---|---|
| `orthogonal` | `u = a·px + c`, `v = e·py + f` | 4 | ≥2 `u`-constraints with distinct `px`, ≥2 `v`-constraints with distinct `py` | today's axis-aligned case |
| `affine` | `u = a·px + b·py + c`, `v = d·px + e·py + f` | 6 | ≥3 `u`-constraints and ≥3 `v`-constraints, each set non-collinear in pixel space | rotation + shear **without warping pixels** |
| `projective` | `u = (h₀px + h₁py + h₂)/(h₆px + h₇py + 1)`, `v = (h₃px + h₄py + h₅)/(h₆px + h₇py + 1)` | 8 | ≥4 points pinning **both** coordinates, no 3 collinear | camera perspective without warping pixels |

`model="auto"` picks the richest determinate model: projective → affine → orthogonal. Each
solve is least-squares (`numpy.linalg.lstsq`) so extra points improve the fit; degenerate
systems raise `CalibrationError` with a `hint`.

**Why this is the biggest precision win.** Today a rotated or perspective photo must be
resampled by `unskew` before its numbers are trustworthy; resampling blurs ink and moves
seeds. With `affine`/`projective` calibration the *pixels stay untouched* and the geometry
lives in the transform. Unskew remains available as a convenience for visual straightening.

**Log axes.** Constraints are built in log10 space for log axes; adapters exponentiate on the
way out. Log axes require all pinned values `> 0` (existing rule).

**Adapters.**

- **cartesian:** `x = 10**u if scale_x == "log" else u`, likewise `y` from `v`.
- **polar:** axis points give `(θ, R)`; each is converted to a *full* pair of constraints
  `u = ρ(R)·cos θ̂`, `v = ρ(R)·sin θ̂` where `θ̂` is θ in radians and
  `ρ(R) = log10(R) if cal.y.scale == "log" else R - origin_radius` (the radial scale reuses
  the existing `Calibration.y.scale` field — there is no separate `scale_radius`).
  Inverse: `ρ = hypot(u, v)`, `θ = atan2(v, u)` converted to `theta_units`,
  `R = 10**ρ if log else ρ + origin_radius`. Polar therefore reuses the affine solver
  (3 polar axis points = 6 constraints = determined affine).
- **map:** a two-point scale bar plus a physical length `L`. `s = L / ‖p₂ − p₁‖`;
  `x = (px − p₁ₓ)·s`, `y = (p₁ᵧ − py)·s` (y up). Isotropic by construction.

### 5.2 Shared binary mask feeding every automatic tool

```
image ──▶ colour filter (per curve) ──▶ [optional grid removal + heal] ──▶ mask (uint8 0/255)
                                                                              │
                     ┌────────────────────────────────┬───────────────────────┼──────────────────┐
                     ▼                                ▼                       ▼                  ▼
              subpixel ink snap              segment builder            point match        improve v2
             (place / improve)               (segment fill)             (scatter)        (mask corridor)
```

No tool grows its own thresholding path. `cv/trace.py` stays for backward compatibility but
`improve` switches to the shared mask.

### 5.3 Canvas modes

`EditorCanvas` gains a single mode union, one active at a time (today: `place` on/off):

```ts
type CanvasMode = 'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'
```

### 5.4 File map

**Backend — new**

| File | Responsibility |
|---|---|
| `backend/app/calibration/transform.py` | `Constraint`, `Transform2D`, `solve_transform`, model selection |
| `backend/app/calibration/coords.py` | cartesian / polar / map adapters, `pixel_to_data`, `data_to_pixel`, `resolution_at` |
| `backend/app/cv/color_filter.py` | `build_filter_mask`, `suggest_filter_from_pixel` |
| `backend/app/cv/grid_removal.py` | `detect_grid`, `remove_grid` (erase + heal) |
| `backend/app/cv/snap.py` | `snap_to_ink` (intensity-weighted subpixel centroid) |
| `backend/app/cv/segments.py` | `build_segments`, `segment_at`, `fill_segment` |
| `backend/app/cv/point_match.py` | `match_points` (normalised cross-correlation candidates) |

**Backend — modified:** `models/schemas.py`, `calibration/calibration.py` (becomes a thin
facade over `transform.py` + `coords.py`), `cv/improve.py`, `pipeline/pipeline.py`,
`api/sessions.py`, `export/export.py`, `export/project_io.py`.

**Frontend — new:** `lib/transform2d.ts`, `lib/colorFilter.ts`, `components/FilterPanel.tsx`,
`components/AutoDigitizePanel.tsx`, `components/AxesCheckerOverlay.tsx`,
`components/CandidateOverlay.tsx`, `components/MaskOverlay.tsx`.

**Frontend — modified:** `types.ts`, `api/client.ts`, `App.tsx`,
`components/{CalibrationPanel,CurveList,EditorCanvas,ExportPanel,PreviewChart}.tsx`,
`lib/{transform,calibration,curves}.ts`, `package.json`, `vite.config.ts`.

**Tests — new**

```
backend/tests/synth/plotgen.py                  # analytic plot renderer + ground truth
backend/tests/metrics.py                        # rms/max/F1 + baseline compare
backend/tests/reference/refcorpus.py            # Engauge .xml/.dig parser
backend/tests/reference/conftest.py             # corpus fixtures + skip logic
backend/tests/reference/baselines/metrics.json  # recorded precision baselines
backend/tests/reference/test_*_reference.py     # per-capability corpus tests
frontend/src/lib/__tests__/*.test.ts            # vitest unit tests
frontend/src/lib/__fixtures__/transform-vectors.json  # parity vectors (synthetic)
```

## 6. Data model

Additions only; every new field is optional with a default that reproduces today's behaviour.

```python
CoordsType   = Literal["cartesian", "polar", "map"]
ThetaUnits   = Literal["degrees", "radians", "gradians", "turns"]
TransformModel = Literal["auto", "orthogonal", "affine", "projective"]
FilterMode   = Literal["intensity", "foreground", "hue", "saturation", "value"]
ConnectAs    = Literal["line", "scatter"]

class AxisPoint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    pixel: tuple[float, float]
    x_value: float | None = None   # cartesian X, or polar θ
    y_value: float | None = None   # cartesian Y, or polar R

class ScaleBar(BaseModel):
    pixel_a: tuple[float, float]
    pixel_b: tuple[float, float]
    length: float                  # physical length between the two pixels
    units: str = ""                # free-text label, export only

class Calibration(BaseModel):              # existing fields kept
    x: CalibrationAxis
    y: CalibrationAxis
    source: CalibrationSource = "manual"
    coords_type: CoordsType = "cartesian"
    model: TransformModel = "auto"
    axis_points: list[AxisPoint] = []      # full 2D points; enables affine/projective/polar
    theta_units: ThetaUnits = "degrees"
    origin_radius: float = 0.0             # polar only
    scale_bar: ScaleBar | None = None      # map only

class ColorFilter(BaseModel):
    mode: FilterMode = "intensity"
    low: float = 0.0                       # normalised 0..1 (hue: 0..1 of 360°)
    high: float = 0.4
    sample_color: str | None = None        # hex from the colour picker
    remove_grid: bool = False

class GridGeometrySettings(BaseModel):
    start_x: float = 0.0; step_x: float = 0.0; count_x: int = 0
    start_y: float = 0.0; step_y: float = 0.0; count_y: int = 0
    close_distance: int = 10

class Curve(BaseModel):                    # existing fields kept
    filter: ColorFilter | None = None
    connect_as: ConnectAs = "line"

class WorkspaceState(BaseModel):           # existing fields kept
    canvas_mode: Literal["select","place","axis","pick-color","segment-fill","point-match"] = "select"
    show_mask: bool = False
    show_axes_checker: bool = True
    point_separation: float = 25.0
    min_segment_length: float = 2.0
    fill_corners: bool = False
    max_point_size: int = 48
    grid: GridGeometrySettings | None = None
```

**Calibration precedence.** When `axis_points` is empty the solver builds constraints from
`x.ref_points`/`y.ref_points` exactly as today (→ `orthogonal`). When `axis_points` is
non-empty it is the sole source of constraints. Both may not be mixed.

## 7. Backend interfaces

```python
# calibration/transform.py
@dataclass(frozen=True)
class Transform2D:
    model: TransformModel
    matrix: np.ndarray                 # 3x3 homogeneous, pixel -> (u, v, w)
    def to_linear(self, pixel: tuple[float, float]) -> tuple[float, float]
    def from_linear(self, uv: tuple[float, float]) -> tuple[float, float]

def build_constraints(cal: Calibration) -> list[Constraint]
def solve_transform(constraints: list[Constraint],
                    model: TransformModel = "auto") -> Transform2D

# calibration/coords.py
def pixel_to_data(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]
def data_to_pixel(cal: Calibration, data: tuple[float, float]) -> tuple[float, float]
def validate_calibration(cal: Calibration) -> None            # raises CalibrationError
def resolution_at(cal: Calibration, pixel: tuple[float, float]) -> tuple[float, float]
def axes_checker_polyline(cal: Calibration,
                          image_size: tuple[int, int]) -> list[tuple[float, float]]

# cv/color_filter.py
def build_filter_mask(img_bgr: np.ndarray, flt: ColorFilter) -> np.ndarray      # uint8 {0,255}
def suggest_filter_from_pixel(img_bgr: np.ndarray,
                              pixel: tuple[float, float]) -> ColorFilter

# cv/grid_removal.py
@dataclass(frozen=True)
class GridGeometry:
    start_x: float; step_x: float; count_x: int
    start_y: float; step_y: float; count_y: int
def detect_grid(mask: np.ndarray) -> GridGeometry | None
def remove_grid(mask: np.ndarray, geom: GridGeometry,
                close_distance: int = 10) -> np.ndarray

# cv/snap.py
def snap_to_ink(mask: np.ndarray, pixel: tuple[float, float], window: int = 7,
                direction: tuple[float, float] | None = None) -> tuple[float, float]

# cv/segments.py
@dataclass
class Segment:
    points: list[tuple[float, float]]
    length: float
def build_segments(mask: np.ndarray, min_length: float = 2.0) -> list[Segment]
def segment_at(segments: list[Segment], pixel: tuple[float, float],
               max_distance: float = 12.0) -> Segment | None
def fill_segment(seg: Segment, separation: float = 25.0,
                 fill_corners: bool = False) -> list[tuple[float, float]]

# cv/point_match.py
@dataclass(frozen=True)
class MatchCandidate:
    pixel: tuple[float, float]
    score: float
def match_points(mask: np.ndarray, sample_center: tuple[float, float],
                 sample_radius: int, max_point_size: int = 48,
                 exclude: list[tuple[float, float]] | None = None,
                 limit: int = 200) -> list[MatchCandidate]
```

## 8. API surface

All routes hang off `/sessions/{session_id}` and return `SessionPublic` unless noted.
Mutating routes push undo history.

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/filter/suggest` | `{pixel, curve_id?}` | `ColorFilter` |
| PATCH | `/curves/{curve_id}/filter` | `ColorFilter` | `SessionPublic` |
| GET | `/mask?curve_id=&rev=` | – | `image/png` mask preview |
| POST | `/grid/detect` | `{curve_id?}` | `GridGeometry \| null` |
| POST | `/curves/{curve_id}/segments` | – | `{segments: [{index, length, points}]}` |
| POST | `/curves/{curve_id}/segment-fill` | `{pixel, separation?, fill_corners?}` | `SessionPublic` |
| POST | `/curves/{curve_id}/point-match` | `{pixel, sample_radius?, max_point_size?}` | `{candidates: MatchCandidate[]}` |
| POST | `/curves/{curve_id}/point-match/accept` | `{pixels: [[x,y], …]}` | `SessionPublic` |
| POST | `/snap` | `{curve_id, pixels: [[x,y], …]}` | `{pixels: [[x,y], …]}` |

Existing `POST /curves/{curve_id}/remove-from-plot` is unchanged and finally gets UI.

## 9. Frontend behaviour

- **CalibrationPanel:** coordinate-system selector (Cartesian / Polar / Map). Cartesian keeps
  today's four-bound flow; a "Precise (3+ points)" toggle switches to `axis_points` placement
  where each click asks for X and/or Y. Polar asks for origin, θ units, radius scale, origin
  radius. Map asks for two scale-bar pixels plus length and units. The panel shows the chosen
  transform model and the current resolution (graph units per pixel).
- **Axes checker:** after calibration changes, overlay the implied axis rectangle (cartesian)
  or annular arc (polar) for 3 s; a visibly skewed shape signals bad input. Toggleable.
- **FilterPanel:** filter mode, low/high range slider, colour-picker canvas mode, mask overlay
  toggle (none / image / mask), grid-removal checkbox with detected geometry summary.
- **AutoDigitizePanel:** point separation, minimum segment length, fill corners, point-match
  max size; buttons enter `segment-fill` / `point-match` canvas modes.
- **Point match UX:** candidates render as ranked rings; Enter/click accepts, Esc/right-click
  rejects, Shift+Enter accepts all above the current score.
- **PreviewChart:** polar sessions plot θ/R (Plotly `scatterpolar`); map sessions plot x/y in
  scale-bar units; `connect_as: "scatter"` curves render markers only.
- **Export:** column headers follow the coordinate system (`x,y` / `theta,R` / `x,y` + units
  line). Scatter curves export unchanged (raw points).

## 10. Test strategy

Three layers, all required.

### 10.1 Synthetic unit tests (deterministic, no external assets)

`backend/tests/synth/plotgen.py` renders analytic plots with NumPy/Pillow and returns both the
image and its exact ground truth:

```python
@dataclass
class SynthPlot:
    image: np.ndarray                     # BGR
    pixel_of: Callable[[float, float], tuple[float, float]]
    data_of: Callable[[float, float], tuple[float, float]]
    axis_points: list[AxisPoint]
    truth: list[tuple[float, float]]      # dense data-space samples of the drawn curve

def render_plot(func, *, x_range, y_range, size=(800, 600), log_x=False, log_y=False,
                grid=None, rotation_deg=0.0, perspective=None, line_width=2,
                line_color=(0, 0, 255), markers=None, noise=0.0,
                background=(255, 255, 255)) -> SynthPlot
```

Because the mapping is known exactly, every precision claim becomes a number: place points,
run a tool, compare against `truth`.

### 10.2 Reference-corpus tests (Engauge examples)

`backend/tests/reference/refcorpus.py` parses Engauge documents without importing any GPL
code — the files are data:

```python
@dataclass
class ReferenceAxisPoint:
    pixel: tuple[float, float]
    graph_x: float | None
    graph_y: float | None
    is_x_only: bool

@dataclass
class ReferenceDoc:
    name: str
    image: np.ndarray                                  # BGR, decoded from the embedded PNG
    coords_type: str                                   # "cartesian" | "polar"
    scale_x: str                                       # "linear" | "log"
    scale_y: str
    axis_points: list[ReferenceAxisPoint]
    curve_points: dict[str, list[tuple[float, float]]] # curve name -> screen pixels
    expected_csv: list[list[str]] | None
    color_filter: dict[str, float]
    segment_settings: dict[str, float]
    point_match_size: int | None

def load_doc(path: Path) -> ReferenceDoc
def iter_docs(ref_dir: Path) -> Iterator[ReferenceDoc]
def sample_image(ref_dir: Path, name: str) -> np.ndarray
```

Verified corpus facts (measured 2026-09-04, do not re-litigate):

- `test/` holds **85** documents (`*.xml` error reports, `*.dig` saved documents); **78** carry
  an extractable PNG.
- Coordinate type is the **last** `TypeString` in the file, not the first: an initial
  `<Coords TypeString="Cartesian">` is frequently overridden by a later
  `CmdSettingsCoords`. Reading the first occurrence misclassifies every polar document.
  Under the correct reading, exactly **4** documents are polar *and* carry axis points, and
  they are the only polar fixtures usable as calibration ground truth:
  `guidelines_polar.xml`, `guidelines_polar_log.xml`, `polar_linear_linear_3curve.xml`,
  `polar_linear_linear_nonzero_center.xml` (3 axis points each). Six further documents end
  up polar but have zero `CmdAddPointAxis` records — `settings_axes_checker.xml`,
  `settings_coordinates.xml`, `extract_image_only_2.dig`,
  `guidelines_polar_linear_shear.dig`, `guidelines_polar_log_rotated.dig`,
  `version8_2.dig` — so they cannot ground-truth a transform and are excluded.
- Images are base64 in `<Image>` CDATA as a Qt `QByteArray` (4-byte big-endian length prefix);
  decode by locating the `\x89PNG` magic and slicing to the end.
- Axis ground truth: `<Cmd Type="CmdAddPointAxis" ScreenX ScreenY GraphX GraphY IsXOnly …/>`.
- Curve ground truth: `CmdAddPointGraph` (84 single adds) and `CmdAddPointsGraph` (114 bulk
  adds). **9 documents** carry ≥3 axis points *and* graph points *and* an expected CSV:
  `extrapolate_functions_{smooth,straight}`, `extrapolate_relations_{smooth,straight}`,
  `guidelines_cartesian`, `guidelines_cartesian_log`, `guidelines_polar`,
  `guidelines_polar_log`, `points_along_axes`.
- Expected output: `*.csv_expected_1` (81 files; `_2`.. `_5` variants for multi-export cases).
  The literal `XXX` marks a value Engauge declined to extrapolate — treat as "skip this cell".
- Per-curve `<ColorFilter IntensityLow IntensityHigh Mode …>`, `<Segments MinLength
  PointSeparation FillCorners>` and `<PointMatch PointSize>` give the settings each expected
  output was produced with.
- `samples/` holds 50 PNG/JPG/BMP plots, including **9 pixel-aligned `*_grid.png` /
  `*_nogrid.png` pairs** (same dimensions, identical content minus gridlines) across
  cartesian, log and polar variants — these are the objective grid-removal oracle.
- Named samples worth targeting: `pointplot.bmp` (documented filter settings: intensity
  90–99 for triangles, 10–50 for diamonds), `pointmatch.jpg` (fuzzy markers), `corners.png`
  (sharp corners), `gridlines.gif` / `gridlines_log.gif`, `linlog.png`, `loglin.png`,
  `loglog.png`, `polarplot.png`, `polarplot_nonzero_center.png`, `map.png`, `usgs.png`,
  `floating_axes.png`, `huge.png` (performance).

### 10.3 Precision baselines

`backend/tests/metrics.py` provides `rms_error`, `max_abs_error`, `mask_f1`, `mask_recall`,
and `assert_not_worse(name, value, *, lower_is_better)` comparing against
`backend/tests/reference/baselines/metrics.json`. `pytest --update-baselines` rewrites the
file. This converts "we improved precision" into a tracked number and blocks silent
regressions.

### 10.4 Acceptance targets

Initial gates; the first implementation records the achieved value into the baseline. A target
that cannot be met is reported with evidence rather than loosened silently.

| Capability | Metric | Gate |
|---|---|---|
| Orthogonal regression | old vs new mapping on existing sessions | exact to 1e-12 |
| Affine calibration | synthetic plot rotated 5–20°, no image warp | max abs error ≤ 0.2 % of axis range |
| Projective calibration | synthetic perspective plot | max abs error ≤ 0.5 % of axis range |
| Reference calibration | 9 ground-truth docs vs expected CSV | ≤ 0.5 % relative (linear), ≤ 1 % (log) |
| Polar calibration | 4 polar docs + synthetic | θ ≤ 0.5°, R ≤ 1 % |
| Colour filter | `pointplot.bmp` with documented ranges | both marker classes separated, F1 ≥ 0.90 |
| Grid removal | 9 grid/nogrid pairs, mask vs nogrid mask | F1 ≥ 0.90 **and** curve-ink recall ≥ 0.95 |
| Subpixel snap | synthetic sub-pixel offsets | mean abs error ≤ 0.35 px |
| Segment fill | synthetic analytic curve | RMS ≤ 0.5 % of Y range |
| Segment fill | gnuplot line samples | RMS ≤ 2 % of Y range |
| Improve v2 | same fixtures as improve v1 | RMS strictly better than recorded v1 baseline |
| Point match | `pointplot.bmp` | recall ≥ 0.95, false positives ≤ 2 %, centroid ≤ 1.5 px |
| Frontend parity | TS vs Python on vector fixture | ≤ 1e-9 |

## 11. Phase index

Each phase is a separate plan document and produces working, shippable software.

| Phase | Plan file | Tasks | Delivers |
|---|---|---|---|
| 0 | `2026-09-04-precision-toolkit-phase0-test-foundation.md` | 4 | corpus parser, synthetic generator, metrics/baselines, vitest |
| 1 | `2026-09-04-precision-toolkit-phase1-calibration.md` | 8 | affine/projective/polar/map calibration, checker, resolution |
| 2 | `2026-09-04-precision-toolkit-phase2-conditioning.md` | 6 | colour filter, grid removal + heal, subpixel snap, filter UI |
| 3 | `2026-09-04-precision-toolkit-phase3-autodigitize.md` | 5 | segment builder, segment fill, improve v2, auto-digitize UI |
| 4 | `2026-09-04-precision-toolkit-phase4-scatter-polar.md` | 5 | point match, scatter curves, polar/map preview + export, docs |

Phase 0 gates everything. Phases 1 and 2 are independent of each other. Phase 3 needs 2.
Phase 4 needs 1, 2 and 3.

## 12. Risks

| Risk | Mitigation |
|---|---|
| GPL contamination | reference read-only, never vendored, algorithms from help docs + standard CV; enforced in every task brief and checked by reviewers |
| Rewriting calibration breaks existing projects | constraint 4: exact-equality regression test on the orthogonal path before any new model lands |
| Grid removal eats curve pixels | recall gate (≥0.95) alongside the F1 gate |
| Corpus absent on another machine | skip logic in constraint 2; synthetic layer covers the same behaviours |
| Frontend/backend geometry drift | committed parity vector fixture, checked in both suites |
| Scope creep toward a full Engauge clone | non-goals in §2 are binding; reviewers reject additions not in the spec |
