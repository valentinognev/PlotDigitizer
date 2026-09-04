# Precision Toolkit Phase 2: Image Conditioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared binary mask pipeline every later automatic tool consumes: per-curve colour filter, optional grid detection/removal/healing, subpixel ink snap, the composing `build_curve_mask` API, and the FilterPanel UI.

**Architecture:** New CV modules (`color_filter.py`, `grid_removal.py`, `snap.py`) produce a uint8 `{0,255}` mask. `pipeline.build_curve_mask(session, image_bytes, curve_id)` is the single compose point (filter → optional grid removal). `cv/trace.py` is left untouched. FastAPI routes expose suggest/patch/mask/detect/snap. The React FilterPanel drives per-curve `ColorFilter`, a `pick-color` canvas mode, a none/image/mask overlay, and a grid-removal checkbox.

**Tech Stack:** Python 3 + FastAPI + Pydantic + NumPy + OpenCV + Pillow + pytest (backend); React + TypeScript + Konva + vitest (frontend). No SciPy, no scikit-image, no FFTW (`numpy.fft.rfft` only).

**Spec:** `docs/superpowers/specs/2026-09-04-precision-toolkit-design.md`

**Context:** Execute on a feature branch / git worktree (create via superpowers:using-git-worktrees at execution time). Never commit to `master`. Phase 0 test foundation is assumed present (`tests/synth/plotgen.py`, `tests/metrics.py`, `tests/reference/refcorpus.py`, `tests/reference/conftest.py`, frontend vitest). Phase 1 is independent — do not import calibration/transform code.

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
| `backend/app/models/schemas.py` | Modify | `FilterMode`, `ColorFilter`, `GridGeometrySettings`; `Curve.filter`; `WorkspaceState.show_mask` / `grid`. Keep Phase 1 `canvas_mode` (full §5.3 Literal; do not narrow) |
| `backend/app/cv/color_filter.py` | Create | `build_filter_mask`, `suggest_filter_from_pixel` |
| `backend/tests/reference/refcorpus.py` | Modify | Phase 0 owns this file; Phase 2 appends test-only `color_filter_from_engauge` |
| `backend/app/cv/grid_removal.py` | Create | `GridGeometry`, `detect_grid`, `remove_grid` |
| `backend/app/cv/snap.py` | Create | `snap_to_ink` |
| `backend/app/pipeline/pipeline.py` | Modify | `build_curve_mask` (compose filter → optional grid removal) |
| `backend/app/api/sessions.py` | Modify | filter / mask / grid / snap routes |
| `backend/app/cv/trace.py` | Do not modify | Keep `build_trace_mask` / `trace_curve_path` working for existing improve |
| `backend/tests/test_color_filter.py` | Create | Synthetic filter + suggest tests |
| `backend/tests/test_grid_removal.py` | Create | Synthetic detect / remove / heal / log-grid tests |
| `backend/tests/test_snap.py` | Create | Subpixel snap tests |
| `backend/tests/test_filter_api.py` | Create | TestClient tests for the new routes |
| `backend/tests/test_pipeline_mask.py` | Create | `build_curve_mask` compose tests |
| `backend/tests/reference/test_color_filter_reference.py` | Create | Optional corpus filter test (`pointplot.bmp`) |
| `backend/tests/reference/test_grid_removal_reference.py` | Create | 9 grid/nogrid pairs + `gridlines.gif` / `gridlines_log.gif` |
| `frontend/src/types.ts` | Modify | `FilterMode`, `ColorFilter`, `GridGeometrySettings`, `Curve.filter`, `show_mask` / `grid`. Do not redeclare `CanvasMode` (Phase 1) |
| `frontend/src/api/client.ts` | Modify | `suggestFilter`, `patchCurveFilter`, `detectGrid`, `snapPixels`, `maskPreviewUrl` |
| `frontend/src/lib/colorFilter.ts` | Create | Pure range / hex / mask-URL helpers |
| `frontend/src/lib/__tests__/colorFilter.test.ts` | Create | vitest for those helpers |
| `frontend/src/components/FilterPanel.tsx` | Create | Mode, dual range, pick-colour, overlay toggle, grid checkbox |
| `frontend/src/components/MaskOverlay.tsx` | Create | Konva mask image overlay |
| `frontend/src/components/EditorCanvas.tsx` | Modify | Add `'pick-color'` to Phase 1 `canvasMode` union (no `addPointMode`); mask overlay |
| `frontend/src/App.tsx` | Modify | Wire FilterPanel, pick-color, mask view, grid detect |
| `README.md` / `UPDATES.md` | Modify | Architecture note + phase-2 subver bump (Task 6 only) |

---

### Task 1: Colour filter module

**Files:**
- Create: `backend/app/cv/color_filter.py`
- Modify: `backend/app/models/schemas.py` (insert `FilterMode` + `ColorFilter` after `CalibrationSource`; do not yet add `Curve.filter`)
- Modify: `backend/tests/reference/refcorpus.py` (Phase 0 owns this file; Phase 2 appends `color_filter_from_engauge`. Engauge's attribute vocabulary stays in test-only code — better licence hygiene.)
- Test: `backend/tests/test_color_filter.py`
- Test: `backend/tests/reference/test_color_filter_reference.py`

**Interfaces:**
- Consumes: BGR `np.ndarray` images. Corpus tests also consume Engauge `<ColorFilter>` attribute dicts from `ReferenceDoc.color_filter` (Phase 0) via the test helper below — production never sees that dict.
- Produces:
  - `FilterMode = Literal["intensity", "foreground", "hue", "saturation", "value"]`
  - `class ColorFilter(BaseModel): mode: FilterMode = "intensity"; low: float = 0.0; high: float = 0.4; sample_color: str | None = None; remove_grid: bool = False` with `low`/`high` normalised to `[0, 1]` (hue: fraction of 360°). `low > high` is legal only for `mode="hue"` (wrap-around).
  - `def build_filter_mask(img_bgr: np.ndarray, flt: ColorFilter) -> np.ndarray` — uint8 `{0,255}`, same H×W as `img_bgr`.
  - `def suggest_filter_from_pixel(img_bgr: np.ndarray, pixel: tuple[float, float]) -> ColorFilter`
  - In `backend/tests/reference/refcorpus.py` (test-only): `def color_filter_from_engauge(attrs: dict[str, object]) -> ColorFilter` — mapping below.

Spec §10.4's colour-filter `F1 >= 0.90` gate is verified in `backend/tests/test_color_filter.py` (`test_intensity_mask_f1_against_labelled_ink`), where labelled ground truth exists. The corpus test on `pointplot.bmp` verifies class separation only and does **not** discharge that gate.

**Engauge attribute mapping (our schema is 0..1):**

| Engauge attr | Engauge range | Our field | Convert |
|---|---|---|---|
| `ModeString` (`Intensity` / `Foreground` / `Hue` / `Saturation` / `Value`) | enum | `mode` | `.lower()` |
| `IntensityLow` / `IntensityHigh` | 0..100 | `low` / `high` when `mode="intensity"` | `/ 100` |
| `ForegroundLow` / `ForegroundHigh` | 0..100 | `low` / `high` when `mode="foreground"` | `/ 100` |
| `HueLow` / `HueHigh` | 0..360 | `low` / `high` when `mode="hue"` | `/ 360` |
| `SaturationLow` / `SaturationHigh` | 0..100 | `low` / `high` when `mode="saturation"` | `/ 100` |
| `ValueLow` / `ValueHigh` | 0..100 | `low` / `high` when `mode="value"` | `/ 100` |

If `ModeString` is missing, map integer `Mode`: `0=foreground`, `1=hue`, `2=intensity`, `3=saturation`, `4=value`. Prefer `ModeString`.

**Channel definitions (documented behaviour, not Engauge source):**

- **intensity:** Rec.601 luminance `Y = (0.114 B + 0.587 G + 0.299 R) / 255`, keep pixels with `low <= Y <= high`.
- **foreground:** modal background colour = most frequent BGR triple on a 4-stride subsample; score = Euclidean distance / `(255 * sqrt(3))`; keep `low <= score <= high`.
- **hue:** OpenCV HSV `H / 179` mapped to `[0,1]`. Inclusive circular band: if `low <= high` then `low <= h <= high`, else `h >= low or h <= high` (reds wrapping 0°/360°).
- **saturation:** OpenCV `S / 255`.
- **value:** OpenCV `V / 255`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_color_filter.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from app.models.schemas import ColorFilter


def _bgr(h: int, w: int, color: tuple[int, int, int]) -> np.ndarray:
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = color
    return img


def _paint(img: np.ndarray, sl_y: slice, sl_x: slice, color: tuple[int, int, int]) -> None:
    img[sl_y, sl_x] = color


def test_intensity_keeps_dark_ink_rejects_white():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 0))
    mask = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.2))
    assert mask.dtype == np.uint8
    assert mask.shape == (40, 60)
    assert set(np.unique(mask)).issubset({0, 255})
    assert mask[20, 30] == 255
    assert mask[2, 2] == 0


def test_value_differs_from_intensity_on_pure_blue():
    from app.cv.color_filter import build_filter_mask

    # BGR pure blue: V is high, Rec.601 luminance is low (~0.114).
    img = _bgr(20, 20, (255, 255, 255))
    _paint(img, slice(5, 15), slice(5, 15), (255, 0, 0))
    by_value = build_filter_mask(img, ColorFilter(mode="value", low=0.8, high=1.0))
    by_intensity = build_filter_mask(img, ColorFilter(mode="intensity", low=0.8, high=1.0))
    assert by_value[10, 10] == 255
    assert by_intensity[10, 10] == 0
    assert by_value[1, 1] == 255  # white also has V=1
    dark = _bgr(20, 20, (0, 0, 0))
    assert build_filter_mask(dark, ColorFilter(mode="value", low=0.8, high=1.0))[5, 5] == 0


def test_saturation_keeps_chroma_rejects_gray():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(20, 20, (128, 128, 128))
    _paint(img, slice(5, 15), slice(5, 15), (0, 0, 255))  # saturated red in BGR
    mask = build_filter_mask(img, ColorFilter(mode="saturation", low=0.5, high=1.0))
    assert mask[10, 10] == 255
    assert mask[1, 1] == 0


def test_foreground_uses_modal_background():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(30, 40, (255, 255, 255))
    _paint(img, slice(8, 22), slice(10, 30), (0, 0, 255))
    mask = build_filter_mask(img, ColorFilter(mode="foreground", low=0.2, high=1.0))
    assert mask[15, 20] == 255
    assert mask[1, 1] == 0


def test_hue_wraps_across_red():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(20, 30, (255, 255, 255))
    _paint(img, slice(2, 8), slice(2, 8), (0, 0, 255))      # OpenCV hue ~0 (red)
    _paint(img, slice(12, 18), slice(2, 8), (0, 0, 180))    # darker red, still near 0
    _paint(img, slice(2, 8), slice(20, 28), (255, 0, 0))    # blue, hue ~0.66
    flt = ColorFilter(mode="hue", low=0.90, high=0.10)
    mask = build_filter_mask(img, flt)
    assert mask[5, 5] == 255
    assert mask[15, 5] == 255
    assert mask[5, 24] == 0
    assert mask[1, 15] == 0


def test_hue_nonwrap_band_excludes_reds():
    from app.cv.color_filter import build_filter_mask

    img = _bgr(16, 16, (255, 255, 255))
    _paint(img, slice(4, 12), slice(4, 12), (255, 0, 0))  # blue
    mask = build_filter_mask(img, ColorFilter(mode="hue", low=0.50, high=0.80))
    assert mask[8, 8] == 255
    red = _bgr(16, 16, (0, 0, 255))
    assert build_filter_mask(red, ColorFilter(mode="hue", low=0.50, high=0.80))[8, 8] == 0


def test_suggest_filter_from_pixel_captures_ink_rejects_background():
    from app.cv.color_filter import build_filter_mask, suggest_filter_from_pixel

    img = _bgr(50, 80, (255, 255, 255))
    _paint(img, slice(10, 40), slice(20, 60), (255, 0, 0))  # blue ink
    flt = suggest_filter_from_pixel(img, (40.2, 25.7))
    assert flt.sample_color is not None
    hex_color = flt.sample_color.lstrip("#")
    assert len(hex_color) == 6
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    assert b >= 240 and r <= 15 and g <= 15
    mask = build_filter_mask(img, flt)
    assert mask[25, 40] == 255
    assert mask[2, 2] == 0


def test_intensity_mask_f1_against_labelled_ink():
    from app.cv.color_filter import build_filter_mask
    from tests.metrics import mask_f1

    img = _bgr(40, 60, (255, 255, 255))
    _paint(img, slice(10, 30), slice(20, 40), (0, 0, 0))
    truth = np.zeros((40, 60), dtype=np.uint8)
    truth[10:30, 20:40] = 255
    pred = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.2))
    assert mask_f1(pred, truth) >= 0.90


def test_color_filter_from_engauge_intensity_and_hue():
    from tests.reference.refcorpus import color_filter_from_engauge

    intensity = color_filter_from_engauge(
        {
            "ModeString": "Intensity",
            "IntensityLow": 10,
            "IntensityHigh": 50,
            "HueLow": 180,
            "HueHigh": 360,
        }
    )
    assert intensity.mode == "intensity"
    assert intensity.low == pytest.approx(0.10)
    assert intensity.high == pytest.approx(0.50)

    hue = color_filter_from_engauge(
        {"ModeString": "Hue", "HueLow": 330, "HueHigh": 30, "IntensityLow": 0, "IntensityHigh": 50}
    )
    assert hue.mode == "hue"
    assert hue.low == pytest.approx(330 / 360)
    assert hue.high == pytest.approx(30 / 360)
```

Create `backend/tests/reference/test_color_filter_reference.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.models.schemas import ColorFilter
from tests.metrics import mask_f1
from tests.reference.refcorpus import color_filter_from_engauge, iter_docs, sample_image

pytestmark = pytest.mark.reference


def test_pointplot_documented_ranges_separate_marker_classes(ref_dir):
    img = sample_image(ref_dir, "pointplot.bmp")
    h, w = img.shape[:2]
    area = h * w
    triangles = build_filter_mask(img, ColorFilter(mode="intensity", low=0.90, high=0.99))
    diamonds = build_filter_mask(img, ColorFilter(mode="intensity", low=0.10, high=0.50))
    n_tri = int(np.count_nonzero(triangles))
    n_dia = int(np.count_nonzero(diamonds))
    assert n_tri > 50
    assert n_dia > 50
    overlap = mask_f1(triangles, diamonds)
    assert overlap < 0.25
    intersection = int(np.count_nonzero((triangles > 0) & (diamonds > 0)))
    assert intersection < 0.10 * min(n_tri, n_dia)
    assert n_tri < 0.20 * area
    assert n_dia < 0.20 * area


def test_reference_doc_color_filter_converts(ref_dir):
    docs = list(iter_docs(ref_dir))
    assert docs
    converted = color_filter_from_engauge(docs[0].color_filter)
    assert converted.mode in {"intensity", "foreground", "hue", "saturation", "value"}
    assert 0.0 <= converted.low <= 1.0
    assert 0.0 <= converted.high <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_color_filter.py -v`

Expected: FAIL with `ImportError: cannot import name 'ColorFilter' from 'app.models.schemas'`.

- [ ] **Step 3: Add `FilterMode` and `ColorFilter` to schemas**

In `backend/app/models/schemas.py`, immediately after `CalibrationSource = Literal["manual"]`, insert:

```python
FilterMode = Literal["intensity", "foreground", "hue", "saturation", "value"]


class ColorFilter(BaseModel):
    mode: FilterMode = "intensity"
    low: float = Field(default=0.0, ge=0.0, le=1.0)
    high: float = Field(default=0.4, ge=0.0, le=1.0)
    sample_color: str | None = None
    remove_grid: bool = False
```

Do not add `Curve.filter` yet (Task 5). Do not add a `low <= high` validator — hue wrap requires `low > high`.

- [ ] **Step 4: Implement `backend/app/cv/color_filter.py`**

```python
from __future__ import annotations

import math

import cv2
import numpy as np

from app.models.schemas import ColorFilter


def _clip_pixel(img_bgr: np.ndarray, pixel: tuple[float, float]) -> tuple[int, int]:
    h, w = img_bgr.shape[:2]
    x = int(round(pixel[0]))
    y = int(round(pixel[1]))
    x = min(max(x, 0), w - 1)
    y = min(max(y, 0), h - 1)
    return x, y


def _bgr_to_hex(bgr: np.ndarray) -> str:
    b, g, r = (int(bgr[0]), int(bgr[1]), int(bgr[2]))
    return f"#{r:02x}{g:02x}{b:02x}"


def _luminance01(img_bgr: np.ndarray) -> np.ndarray:
    bgr = img_bgr.astype(np.float32)
    y = 0.114 * bgr[:, :, 0] + 0.587 * bgr[:, :, 1] + 0.299 * bgr[:, :, 2]
    return y / 255.0


def _modal_background_bgr(img_bgr: np.ndarray) -> np.ndarray:
    sampled = img_bgr[::4, ::4].reshape(-1, 3)
    if sampled.size == 0:
        sampled = img_bgr.reshape(-1, 3)
    packed = (
        sampled[:, 0].astype(np.uint32) << 16
        | sampled[:, 1].astype(np.uint32) << 8
        | sampled[:, 2].astype(np.uint32)
    )
    values, counts = np.unique(packed, return_counts=True)
    mode = int(values[int(np.argmax(counts))])
    return np.array([(mode >> 16) & 255, (mode >> 8) & 255, mode & 255], dtype=np.float32)


def _hue01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 0].astype(np.float32) / 179.0


def _sat01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 1].astype(np.float32) / 255.0


def _val01(img_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 2].astype(np.float32) / 255.0


def _in_linear_range(channel: np.ndarray, low: float, high: float) -> np.ndarray:
    lo, hi = (low, high) if low <= high else (high, low)
    return (channel >= lo) & (channel <= hi)


def _in_hue_range(hue: np.ndarray, low: float, high: float) -> np.ndarray:
    if low <= high:
        return (hue >= low) & (hue <= high)
    return (hue >= low) | (hue <= high)


def build_filter_mask(img_bgr: np.ndarray, flt: ColorFilter) -> np.ndarray:
    if flt.mode == "intensity":
        keep = _in_linear_range(_luminance01(img_bgr), flt.low, flt.high)
    elif flt.mode == "foreground":
        bg = _modal_background_bgr(img_bgr)
        delta = img_bgr.astype(np.float32) - bg.reshape(1, 1, 3)
        dist = np.sqrt(np.sum(delta * delta, axis=2)) / (255.0 * math.sqrt(3.0))
        keep = _in_linear_range(dist, flt.low, flt.high)
    elif flt.mode == "hue":
        keep = _in_hue_range(_hue01(img_bgr), flt.low, flt.high)
    elif flt.mode == "saturation":
        keep = _in_linear_range(_sat01(img_bgr), flt.low, flt.high)
    else:
        keep = _in_linear_range(_val01(img_bgr), flt.low, flt.high)
    return keep.astype(np.uint8) * 255


def suggest_filter_from_pixel(img_bgr: np.ndarray, pixel: tuple[float, float]) -> ColorFilter:
    x, y = _clip_pixel(img_bgr, pixel)
    bgr = img_bgr[y, x]
    hex_color = _bgr_to_hex(bgr)
    hsv = cv2.cvtColor(bgr.reshape(1, 1, 3), cv2.COLOR_BGR2HSV)[0, 0]
    hue = float(hsv[0]) / 179.0
    sat = float(hsv[1]) / 255.0
    intensity = float(0.114 * bgr[0] + 0.587 * bgr[1] + 0.299 * bgr[2]) / 255.0
    if sat >= 0.25:
        half = 0.04
        low = (hue - half) % 1.0
        high = (hue + half) % 1.0
        return ColorFilter(mode="hue", low=low, high=high, sample_color=hex_color)
    low = max(0.0, intensity - 0.15)
    high = min(1.0, intensity + 0.15)
    return ColorFilter(mode="intensity", low=low, high=high, sample_color=hex_color)
```

Append this test-only helper to Phase 0's `backend/tests/reference/refcorpus.py` (do not put it in `color_filter.py`):

```python
from app.models.schemas import ColorFilter, FilterMode

_ENGAUGE_MODE_INT: dict[int, FilterMode] = {
    0: "foreground",
    1: "hue",
    2: "intensity",
    3: "saturation",
    4: "value",
}


def color_filter_from_engauge(attrs: dict[str, object]) -> ColorFilter:
    mode_str = attrs.get("ModeString")
    if isinstance(mode_str, str) and mode_str.lower() in {
        "intensity",
        "foreground",
        "hue",
        "saturation",
        "value",
    }:
        mode: FilterMode = mode_str.lower()  # type: ignore[assignment]
    else:
        mode = _ENGAUGE_MODE_INT.get(int(attrs.get("Mode", 2)), "intensity")

    def _num(key: str, default: float) -> float:
        val = attrs.get(key, default)
        return float(val)

    if mode == "hue":
        low = _num("HueLow", 180.0) / 360.0
        high = _num("HueHigh", 360.0) / 360.0
    elif mode == "foreground":
        low = _num("ForegroundLow", 0.0) / 100.0
        high = _num("ForegroundHigh", 10.0) / 100.0
    elif mode == "saturation":
        low = _num("SaturationLow", 50.0) / 100.0
        high = _num("SaturationHigh", 100.0) / 100.0
    elif mode == "value":
        low = _num("ValueLow", 0.0) / 100.0
        high = _num("ValueHigh", 50.0) / 100.0
    else:
        low = _num("IntensityLow", 0.0) / 100.0
        high = _num("IntensityHigh", 50.0) / 100.0
    low = min(max(low, 0.0), 1.0)
    high = min(max(high, 0.0), 1.0)
    return ColorFilter(mode=mode, low=low, high=high)
```

Merge the `ColorFilter` / `FilterMode` import with whatever Phase 0 already imports from `app.models.schemas` — do not duplicate the import line.

- [ ] **Step 5: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_color_filter.py -v`

Expected: PASS (all tests in that file).

Run: `cd backend && .venv/bin/pytest tests/reference/test_color_filter_reference.py -v`

Expected: SKIPPED if `PLOTDIG_REF_DIR` is absent; PASS if the corpus is present. `sample_image` takes the file name including extension and resolves it against `$PLOTDIG_REF_DIR/samples/` — this test uses `"pointplot.bmp"`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/app/cv/color_filter.py backend/tests/reference/refcorpus.py backend/tests/test_color_filter.py backend/tests/reference/test_color_filter_reference.py
git commit -m "$(cat <<'EOF'
feat: add per-curve colour filter masks

Shared discretize path (intensity/foreground/hue/saturation/value) so later tools stop growing ad-hoc thresholds.
EOF
)"
```

---

### Task 2: Grid detection

**Files:**
- Create: `backend/app/cv/grid_removal.py`
- Test: `backend/tests/test_grid_removal.py`

**Interfaces:**
- Consumes: uint8 `{0,255}` mask from `build_filter_mask` (Task 1).
- Produces:
  - `@dataclass(frozen=True) class GridGeometry: start_x: float; step_x: float; count_x: int; start_y: float; step_y: float; count_y: int`
  - `def detect_grid(mask: np.ndarray) -> GridGeometry | None`
  - Technique: column/row ink-count projections, then `numpy.fft.rfft` periodicity per axis. Return `None` when neither axis has a uniform period. An axis without a period uses `count_*=0` and `step_*=0` if the other axis is periodic. No SciPy.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_grid_removal.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from tests.synth.plotgen import render_plot


def _grid_mask(
    h: int,
    w: int,
    *,
    start_x: float,
    step_x: float,
    count_x: int,
    start_y: float,
    step_y: float,
    count_y: int,
    thickness: int = 1,
) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    for i in range(count_x):
        x = int(round(start_x + i * step_x))
        if 0 <= x < w:
            x0 = max(0, x - thickness + 1)
            x1 = min(w, x + thickness)
            mask[:, x0:x1] = 255
    for j in range(count_y):
        y = int(round(start_y + j * step_y))
        if 0 <= y < h:
            y0 = max(0, y - thickness + 1)
            y1 = min(h, y + thickness)
            mask[y0:y1, :] = 255
    return mask


def test_detect_grid_recovers_step_and_offset():
    from app.cv.grid_removal import detect_grid

    cases = [
        (12.0, 25.0, 14, 8.0, 30.0, 10),
        (5.0, 40.0, 9, 20.0, 18.0, 16),
        (0.0, 50.0, 8, 1.0, 45.0, 8),
    ]
    for start_x, step_x, count_x, start_y, step_y, count_y in cases:
        mask = _grid_mask(
            240,
            400,
            start_x=start_x,
            step_x=step_x,
            count_x=count_x,
            start_y=start_y,
            step_y=step_y,
            count_y=count_y,
        )
        geom = detect_grid(mask)
        assert geom is not None, (start_x, step_x)
        assert geom.step_x == pytest.approx(step_x, abs=0.5)
        assert geom.step_y == pytest.approx(step_y, abs=0.5)
        assert geom.start_x == pytest.approx(start_x, abs=1.0)
        assert geom.start_y == pytest.approx(start_y, abs=1.0)
        assert geom.count_x >= count_x - 1
        assert geom.count_y >= count_y - 1


def test_detect_grid_returns_none_on_grid_free_plot():
    from app.cv.color_filter import build_filter_mask
    from app.cv.grid_removal import detect_grid
    from app.models.schemas import ColorFilter

    plot = render_plot(lambda x: 0.3 * x + 1.0, x_range=(0.0, 10.0), y_range=(0.0, 5.0), grid=None)
    mask = build_filter_mask(plot.image, ColorFilter(mode="intensity", low=0.0, high=0.4))
    assert detect_grid(mask) is None


def test_detect_grid_rejects_log_spaced_lines():
    from app.cv.grid_removal import detect_grid

    mask = np.zeros((200, 400), dtype=np.uint8)
    for x in (10, 20, 40, 80, 160, 320):
        mask[:, x] = 255
    for y in (8, 16, 32, 64, 128):
        mask[y, :] = 255
    assert detect_grid(mask) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_grid_removal.py::test_detect_grid_recovers_step_and_offset -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.cv.grid_removal'` (or `ImportError: cannot import name 'detect_grid'`).

- [ ] **Step 3: Implement detection in `backend/app/cv/grid_removal.py`**

```python
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class GridGeometry:
    start_x: float
    step_x: float
    count_x: int
    start_y: float
    step_y: float
    count_y: int


def _dominant_period(proj: np.ndarray) -> float | None:
    n = int(proj.size)
    if n < 16:
        return None
    x = proj.astype(np.float64) - float(proj.mean())
    mag = np.abs(np.fft.rfft(x))
    mag[0] = 0.0
    if mag.size < 4:
        return None
    k_min = 3
    k_max = max(k_min + 1, n // 4)
    band = mag[k_min : k_max + 1]
    if band.size == 0:
        return None
    noise = float(np.median(mag[1:])) + 1e-9
    hits = np.where(band > 4.0 * noise)[0]
    if hits.size == 0:
        return None
    k = int(hits[0]) + k_min
    step = n / k
    if step < 4.0 or step > n / 3.0:
        return None
    return float(step)


def _start_and_count(proj: np.ndarray, step: float) -> tuple[float, int] | None:
    n = int(proj.size)
    window = proj[: max(1, int(round(step)))]
    if float(window.max()) <= 0:
        return None
    start = float(np.argmax(window))
    xs: list[float] = []
    pos = start
    while pos < n:
        lo = max(0, int(round(pos - step * 0.25)))
        hi = min(n, int(round(pos + step * 0.25)) + 1)
        if hi <= lo:
            break
        local = proj[lo:hi]
        if float(local.max()) <= 0:
            break
        peak = float(lo + int(np.argmax(local)))
        xs.append(peak)
        pos = peak + step
    if len(xs) < 3:
        return None
    return start, len(xs)


def _axis_geometry(proj: np.ndarray) -> tuple[float, float, int] | None:
    step = _dominant_period(proj)
    if step is None:
        return None
    found = _start_and_count(proj, step)
    if found is None:
        return None
    start, count = found
    return start, step, count


def detect_grid(mask: np.ndarray) -> GridGeometry | None:
    ink = (mask > 0).astype(np.float64)
    col = ink.sum(axis=0)
    row = ink.sum(axis=1)
    gx = _axis_geometry(col)
    gy = _axis_geometry(row)
    if gx is None and gy is None:
        return None
    start_x, step_x, count_x = gx if gx is not None else (0.0, 0.0, 0)
    start_y, step_y, count_y = gy if gy is not None else (0.0, 0.0, 0)
    return GridGeometry(
        start_x=start_x,
        step_x=step_x,
        count_x=count_x,
        start_y=start_y,
        step_y=step_y,
        count_y=count_y,
    )
```

Do not add `remove_grid` yet.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_grid_removal.py -v`

Expected: PASS. If a synthetic case misses start by >1 px, tighten `_start_and_count` (do not loosen the assertion). If the log-spaced case is reported as uniform, raise the `4.0 * noise` threshold — do not special-case log spacing with a list of forbidden periods.

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/grid_removal.py backend/tests/test_grid_removal.py
git commit -m "$(cat <<'EOF'
feat: detect uniform plot grid from mask projections

Recover start/step/count per axis with rfft so grid removal has geometry without SciPy.
EOF
)"
```

---

### Task 3: Grid removal and healing

**Files:**
- Modify: `backend/app/cv/grid_removal.py` (add `remove_grid`)
- Modify: `backend/tests/test_grid_removal.py` (synthetic erase + heal)
- Test: `backend/tests/reference/test_grid_removal_reference.py`

**Interfaces:**
- Consumes: `detect_grid` / `GridGeometry` from Task 2; `build_filter_mask` from Task 1; `mask_f1` / `mask_recall` / `assert_not_worse` from Phase 0; `sample_image` from Phase 0.
- Produces:
  - `def remove_grid(mask: np.ndarray, geom: GridGeometry, close_distance: int = 10) -> np.ndarray`
  - Erase ink on the detected lines, then heal: pair mutually-nearest boundary runs on either side of each removed line within `close_distance` and fill between them. Must not assume the remaining ink is a function of x (three of the nine corpus pairs are polar).

**Objective gate (spec §10.4):** for each of the 9 pairs, after filter + remove vs filtered `_nogrid` mask: `mask_f1 >= 0.90` AND `mask_recall >= 0.95`. Record achieved numbers via `assert_not_worse`. Base names: `gnuplot_theta_r_lines`, `gnuplot_theta_r_linespoints`, `gnuplot_theta_r_points`, `gnuplot_x_log_y_lines`, `gnuplot_x_log_y_linespoints`, `gnuplot_x_log_y_points`, `gnuplot_x_y_lines`, `gnuplot_x_y_linespoints`, `gnuplot_x_y_points`. Also `gridlines.gif` and `gridlines_log.gif`: must not crash; must remove most grid ink.

- [ ] **Step 1: Write the failing synthetic tests (append to `backend/tests/test_grid_removal.py`)**

```python
def test_remove_grid_erases_lines_and_heals_crossing():
    from app.cv.grid_removal import GridGeometry, remove_grid

    h, w = 80, 120
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[30, 10:110] = 255  # horizontal curve
    for x in (20, 50, 80):
        mask[:, x] = 255  # vertical grid
    geom = GridGeometry(start_x=20.0, step_x=30.0, count_x=3, start_y=0.0, step_y=0.0, count_y=0)
    out = remove_grid(mask, geom, close_distance=10)
    assert out.dtype == np.uint8
    assert out[10, 50] == 0
    assert out[30, 50] == 255
    assert out[30, 40] == 255


def test_remove_grid_heals_vertical_curve_across_horizontal_grid():
    from app.cv.grid_removal import GridGeometry, remove_grid

    mask = np.zeros((90, 70), dtype=np.uint8)
    mask[5:85, 35] = 255
    for y in (20, 45, 70):
        mask[y, :] = 255
    geom = GridGeometry(start_x=0.0, step_x=0.0, count_x=0, start_y=20.0, step_y=25.0, count_y=3)
    out = remove_grid(mask, geom, close_distance=10)
    assert out[45, 10] == 0
    assert out[45, 35] == 255


def test_remove_grid_does_not_assume_function_of_x():
    from app.cv.grid_removal import GridGeometry, remove_grid

    # Closed ring crossing a vertical grid line twice — polar-like, not y=f(x).
    mask = np.zeros((100, 100), dtype=np.uint8)
    yy, xx = np.ogrid[:100, :100]
    ring = np.abs(np.hypot(xx - 50, yy - 50) - 25) < 1.5
    mask[ring] = 255
    mask[:, 50] = 255
    geom = GridGeometry(start_x=50.0, step_x=0.0, count_x=1, start_y=0.0, step_y=0.0, count_y=0)
    out = remove_grid(mask, geom, close_distance=10)
    assert out[50, 50] == 0
    assert out[25, 50] == 255
    assert out[75, 50] == 255
```

- [ ] **Step 2: Run synthetic tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_grid_removal.py::test_remove_grid_erases_lines_and_heals_crossing -v`

Expected: FAIL with `ImportError: cannot import name 'remove_grid' from 'app.cv.grid_removal'`.

- [ ] **Step 3: Implement `remove_grid` (append to `backend/app/cv/grid_removal.py`)**

```python
def _runs(column: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = 0
    inside = False
    for i, val in enumerate(column):
        if val > 0 and not inside:
            inside = True
            start = i
        elif val == 0 and inside:
            runs.append((start, i - 1))
            inside = False
    if inside:
        runs.append((start, int(column.size) - 1))
    return runs


def _centroid(run: tuple[int, int]) -> float:
    return 0.5 * (run[0] + run[1])


def _mutual_pairs(
    left: list[tuple[int, int]],
    right: list[tuple[int, int]],
    close_distance: int,
) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    if not left or not right:
        return []
    pairs: list[tuple[tuple[int, int], tuple[int, int]]] = []
    used_r: set[int] = set()
    for i, lr in enumerate(left):
        lc = _centroid(lr)
        j = min(range(len(right)), key=lambda k: abs(_centroid(right[k]) - lc))
        if j in used_r:
            continue
        rc = _centroid(right[j])
        i2 = min(range(len(left)), key=lambda k: abs(_centroid(left[k]) - rc))
        if i2 != i:
            continue
        if abs(lc - rc) > close_distance:
            continue
        pairs.append((lr, right[j]))
        used_r.add(j)
    return pairs


def _heal_vertical(out: np.ndarray, x: int, close_distance: int) -> None:
    h, w = out.shape
    if x <= 0 or x >= w - 1:
        return
    pairs = _mutual_pairs(_runs(out[:, x - 1]), _runs(out[:, x + 1]), close_distance)
    for (l0, l1), (r0, r1) in pairs:
        y0 = min(l0, r0)
        y1 = max(l1, r1)
        out[y0 : y1 + 1, x] = 255


def _heal_horizontal(out: np.ndarray, y: int, close_distance: int) -> None:
    h, w = out.shape
    if y <= 0 or y >= h - 1:
        return
    pairs = _mutual_pairs(_runs(out[y - 1, :]), _runs(out[y + 1, :]), close_distance)
    for (l0, l1), (r0, r1) in pairs:
        x0 = min(l0, r0)
        x1 = max(l1, r1)
        out[y, x0 : x1 + 1] = 255


def remove_grid(
    mask: np.ndarray,
    geom: GridGeometry,
    close_distance: int = 10,
) -> np.ndarray:
    out = mask.copy()
    h, w = out.shape
    xs = [
        int(round(geom.start_x + i * geom.step_x))
        for i in range(geom.count_x)
        if geom.count_x > 0
    ]
    ys = [
        int(round(geom.start_y + j * geom.step_y))
        for j in range(geom.count_y)
        if geom.count_y > 0
    ]
    for x in xs:
        if 0 <= x < w:
            x0 = max(0, x - 1)
            x1 = min(w, x + 2)
            out[:, x0:x1] = 0
    for y in ys:
        if 0 <= y < h:
            y0 = max(0, y - 1)
            y1 = min(h, y + 2)
            out[y0:y1, :] = 0
    for x in xs:
        if 0 <= x < w:
            _heal_vertical(out, x, close_distance)
    for y in ys:
        if 0 <= y < h:
            _heal_horizontal(out, y, close_distance)
    return out
```

- [ ] **Step 4: Run synthetic tests**

Run: `cd backend && .venv/bin/pytest tests/test_grid_removal.py -v`

Expected: PASS.

- [ ] **Step 5: Write the reference tests**

Create `backend/tests/reference/test_grid_removal_reference.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.cv.grid_removal import detect_grid, remove_grid
from app.models.schemas import ColorFilter
from tests.metrics import assert_not_worse, mask_f1, mask_recall
from tests.reference.refcorpus import sample_image

pytestmark = pytest.mark.reference

PAIRS = [
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

FILTER = ColorFilter(mode="intensity", low=0.0, high=0.45)


def _filtered(ref_dir, name: str) -> np.ndarray:
    return build_filter_mask(sample_image(ref_dir, name), FILTER)


@pytest.mark.parametrize("base", PAIRS)
def test_grid_nogrid_mask_gate(ref_dir, base: str):
    grid_mask = _filtered(ref_dir, f"{base}_grid.png")
    truth = _filtered(ref_dir, f"{base}_nogrid.png")
    geom = detect_grid(grid_mask)
    assert geom is not None
    pred = remove_grid(grid_mask, geom, close_distance=10)
    f1 = mask_f1(pred, truth)
    recall = mask_recall(pred, truth)
    assert f1 >= 0.90, f"{base} f1={f1:.4f}"
    assert recall >= 0.95, f"{base} recall={recall:.4f} (curve ink eaten?)"
    assert_not_worse(f"grid_removal/{base}/f1", f1, lower_is_better=False)
    assert_not_worse(f"grid_removal/{base}/recall", recall, lower_is_better=False)


@pytest.mark.parametrize("name", ["gridlines.gif", "gridlines_log.gif"])
def test_gridlines_samples_remove_most_grid_ink(ref_dir, name: str):
    img = sample_image(ref_dir, name)
    mask = build_filter_mask(img, FILTER)
    before = int(np.count_nonzero(mask))
    geom = detect_grid(mask)
    if geom is None:
        pytest.skip(f"no uniform grid detected on {name}")
    after_mask = remove_grid(mask, geom, close_distance=10)
    after = int(np.count_nonzero(after_mask))
    assert after < 0.55 * before
```

`sample_image(ref_dir, name)` takes the file name including extension and resolves it against `$PLOTDIG_REF_DIR/samples/`. The calls above are the exact names: `f"{base}_grid.png"`, `f"{base}_nogrid.png"`, `"gridlines.gif"`, `"gridlines_log.gif"`.

- [ ] **Step 6: Run reference tests**

Run: `cd backend && .venv/bin/pytest tests/reference/test_grid_removal_reference.py -v`

Expected: SKIPPED without the corpus; with the corpus, all 9 pairs PASS the F1/recall gates. If a pair fails the gate, record the achieved metric in the task report and do **not** silently loosen 0.90 / 0.95. After gates pass, record baselines:

Run: `cd backend && .venv/bin/pytest tests/reference/test_grid_removal_reference.py -v --update-baselines`

- [ ] **Step 7: Commit**

```bash
git add backend/app/cv/grid_removal.py backend/tests/test_grid_removal.py backend/tests/reference/test_grid_removal_reference.py backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
feat: remove detected grid lines and heal curve crossings

Erase periodic grid ink then reconnect stumps so polar and cartesian curves survive as one stroke.
EOF
)"
```

---

### Task 4: Subpixel ink snap

**Files:**
- Create: `backend/app/cv/snap.py`
- Test: `backend/tests/test_snap.py`

**Interfaces:**
- Consumes: uint8 `{0,255}` mask (typically from `build_curve_mask` / `build_filter_mask`).
- Produces:
  - `def snap_to_ink(mask: np.ndarray, pixel: tuple[float, float], window: int = 7, direction: tuple[float, float] | None = None) -> tuple[float, float]`
  - Intensity-weighted centroid of ink in the window. When `direction` is set (local curve tangent), replace only the coordinate perpendicular to that direction so the snap moves across the stroke, not along it. Empty window → return `pixel` unchanged.
  - Spec §10.4 gate: mean abs error ≤ 0.35 px on synthetic sub-pixel offsets.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_snap.py`:

```python
from __future__ import annotations

import math

import numpy as np
import pytest


def _stroke_mask(h: int, w: int, y_center: float, x0: int, x1: int, half_width: float = 1.2) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        if abs((y + 0.5) - y_center) <= half_width:
            mask[y, x0:x1] = 255
    return mask


def test_snap_recovers_subpixel_centerline():
    from app.cv.snap import snap_to_ink

    errors: list[float] = []
    for true_y in (20.15, 20.35, 20.50, 21.20, 30.80):
        mask = _stroke_mask(60, 80, true_y, 10, 70, half_width=1.5)
        snapped = snap_to_ink(mask, (40.0, 18.0), window=7)
        errors.append(abs(snapped[1] - true_y))
        assert snapped[0] == pytest.approx(40.0, abs=2.0)
    assert float(np.mean(errors)) <= 0.35


def test_snap_with_direction_beats_isotropic_on_diagonal():
    from app.cv.snap import snap_to_ink

    mask = np.zeros((80, 80), dtype=np.uint8)
    for t in range(10, 70):
        x = t
        y = t
        mask[max(0, y - 1) : y + 2, max(0, x - 1) : x + 2] = 255
    seed = (40.0, 36.0)
    isotropic = snap_to_ink(mask, seed, window=7, direction=None)
    directed = snap_to_ink(mask, seed, window=7, direction=(1.0, 1.0))
    true = (40.0, 40.0)
    err_iso = math.hypot(isotropic[0] - true[0], isotropic[1] - true[1])
    err_dir = math.hypot(directed[0] - true[0], directed[1] - true[1])
    assert err_dir < err_iso


def test_snap_empty_window_is_noop():
    from app.cv.snap import snap_to_ink

    mask = np.zeros((40, 40), dtype=np.uint8)
    assert snap_to_ink(mask, (12.5, 8.25), window=7) == (12.5, 8.25)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_snap.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.cv.snap'`.

- [ ] **Step 3: Implement `backend/app/cv/snap.py`**

```python
from __future__ import annotations

import math

import numpy as np


def snap_to_ink(
    mask: np.ndarray,
    pixel: tuple[float, float],
    window: int = 7,
    direction: tuple[float, float] | None = None,
) -> tuple[float, float]:
    h, w = mask.shape[:2]
    px, py = float(pixel[0]), float(pixel[1])
    half = max(1, int(window) // 2)
    x0 = max(0, int(math.floor(px)) - half)
    x1 = min(w, int(math.floor(px)) + half + 1)
    y0 = max(0, int(math.floor(py)) - half)
    y1 = min(h, int(math.floor(py)) + half + 1)
    patch = mask[y0:y1, x0:x1]
    ys, xs = np.nonzero(patch > 0)
    if xs.size == 0:
        return (px, py)
    weights = patch[ys, xs].astype(np.float64)
    xs_f = xs.astype(np.float64) + x0
    ys_f = ys.astype(np.float64) + y0
    wsum = float(weights.sum())
    cx = float((xs_f * weights).sum() / wsum)
    cy = float((ys_f * weights).sum() / wsum)
    if direction is None:
        return (cx, cy)
    dx, dy = float(direction[0]), float(direction[1])
    norm = math.hypot(dx, dy)
    if norm < 1e-9:
        return (cx, cy)
    tx, ty = dx / norm, dy / norm
    nx, ny = -ty, tx
    along = px * tx + py * ty
    across = cx * nx + cy * ny
    return (along * tx + across * nx, along * ty + across * ny)
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_snap.py -v`

Expected: PASS, including mean abs error ≤ 0.35. If the isotropic-vs-directed assertion is flaky on this mask, thicken the diagonal by 1 px — do not drop the direction test.

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/snap.py backend/tests/test_snap.py
git commit -m "$(cat <<'EOF'
feat: snap pixels to ink with a subpixel centroid

Across-stroke snap (optional tangent) so place/improve land on the stroke centre, not along it.
EOF
)"
```

---

### Task 5: Filter and grid API

**Files:**
- Modify: `backend/app/models/schemas.py` (`Curve.filter`, `GridGeometrySettings`, `WorkspaceState` fields, request models)
- Modify: `backend/app/pipeline/pipeline.py` (`build_curve_mask`)
- Modify: `backend/app/api/sessions.py` (routes)
- Test: `backend/tests/test_pipeline_mask.py`
- Test: `backend/tests/test_filter_api.py`

**Interfaces:**
- Consumes: `build_filter_mask` (Task 1), `detect_grid` / `remove_grid` / `GridGeometry` (Tasks 2–3), `snap_to_ink` (Task 4), `session_store`, existing `_error` / `_to_public` / `_require`.
- Produces (later phases import these names):
  - `def build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray`
  - `Curve.filter: ColorFilter | None = None`
  - `class GridGeometrySettings(BaseModel): start_x: float = 0.0; step_x: float = 0.0; count_x: int = 0; start_y: float = 0.0; step_y: float = 0.0; count_y: int = 0; close_distance: int = 10`
  - `WorkspaceState.show_mask: bool = False`, `WorkspaceState.grid: GridGeometrySettings | None = None`. Phase 1 already added `WorkspaceState.canvas_mode: Literal["select","place","axis","pick-color","segment-fill","point-match"] = "select"` (full spec §5.3). Keep that field; do not redeclare or narrow the Literal. Keep existing `active_curve_id` / `resample_count` / `unskew_mode` / `mesh`.
  - Routes, all under `/sessions/{session_id}`:
    - `POST /filter/suggest` body `{pixel, curve_id?}` → `ColorFilter`
    - `PATCH /curves/{curve_id}/filter` body `ColorFilter` → `SessionPublic` (push undo)
    - `GET /mask?curve_id=&rev=` → `image/png`
    - `POST /grid/detect` body `{curve_id?}` → `GridGeometrySettings | null` (push undo when geometry is stored on `workspace.grid`)
    - `POST /snap` body `{curve_id, pixels: [[x,y], …]}` → `{pixels: [[x,y], …]}` (no undo; not a session mutation)
  - Error shapes: unknown session → 404 `{"detail": "Session not found"}` (existing). Business errors → 400 `{"detail": {"error": {"code", "message", "hint"}}}` via `_error`. Malformed body → 422 FastAPI/Pydantic `{"detail": [...]}`.

**`build_curve_mask` contract:** decode `image_bytes` to BGR; load `curve = session.curves` by id (`ValueError` if missing); `flt = curve.filter or ColorFilter()`; `mask = build_filter_mask(img, flt)`; if `flt.remove_grid`, convert `session.workspace.grid` to `GridGeometry` when present otherwise `detect_grid(mask)`; if geometry is not `None`, `mask = remove_grid(mask, geom, close_distance)`. Return uint8 `{0,255}`.

`image_bytes` is required because `Session` does not hold pixels (they live on `StoredSession.image_bytes`). Argument order is `session, image_bytes, curve_id` — the same convention as every public function in `backend/app/pipeline/pipeline.py` (`run_cv_improve`, `run_resample`, `run_remove_curve_from_plot`, `run_unskew_apply`). Phases 3–4 call this same signature.

- [ ] **Step 1: Write failing pipeline tests**

Create `backend/tests/test_pipeline_mask.py`:

```python
from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import ColorFilter, Curve, ImageMeta, Session


def _png_from_bgr(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_build_curve_mask_applies_filter_then_optional_grid():
    from app.pipeline.pipeline import build_curve_mask

    img = np.full((40, 60, 3), 255, dtype=np.uint8)
    img[20, :, :] = (0, 0, 0)
    img[:, 30, :] = (0, 0, 0)
    session = Session(
        image_meta=ImageMeta(width=60, height=40),
        curves=[
            Curve(
                id="c1",
                label="c",
                filter=ColorFilter(mode="intensity", low=0.0, high=0.3, remove_grid=False),
            )
        ],
    )
    mask = build_curve_mask(session, _png_from_bgr(img), "c1")
    assert mask.shape == (40, 60)
    assert mask[20, 10] == 255
    assert mask[20, 30] == 255

    session.curves[0].filter = ColorFilter(
        mode="intensity", low=0.0, high=0.3, remove_grid=True
    )
    from app.models.schemas import GridGeometrySettings, WorkspaceState

    session.workspace = WorkspaceState(
        grid=GridGeometrySettings(start_x=30.0, step_x=0.0, count_x=1, close_distance=10)
    )
    cleared = build_curve_mask(session, _png_from_bgr(img), "c1")
    assert cleared[5, 30] == 0
    assert cleared[20, 10] == 255


def test_build_curve_mask_unknown_curve_raises():
    from app.pipeline.pipeline import build_curve_mask

    session = Session(image_meta=ImageMeta(width=8, height=8), curves=[])
    png = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(png, format="PNG")
    try:
        build_curve_mask(session, png.getvalue(), "missing")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "missing" in str(exc)
```

- [ ] **Step 2: Run pipeline test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_pipeline_mask.py::test_build_curve_mask_applies_filter_then_optional_grid -v`

Expected: FAIL with `ImportError: cannot import name 'build_curve_mask'` and/or `ValidationError` on `Curve.filter` / `WorkspaceState.grid`.

- [ ] **Step 3: Extend schemas**

In `backend/app/models/schemas.py`:

Add after `ColorFilter`:

```python
class GridGeometrySettings(BaseModel):
    start_x: float = 0.0
    step_x: float = 0.0
    count_x: int = 0
    start_y: float = 0.0
    step_y: float = 0.0
    count_y: int = 0
    close_distance: int = 10
```

On `class Curve`, after `points`, add:

```python
    filter: ColorFilter | None = None
```

Replace `class WorkspaceState` with the existing Phase 1 fields plus `show_mask` / `grid`. Keep Phase 1's `canvas_mode` exactly as the full six-value Literal (do not drop or rename any member):

```python
class WorkspaceState(BaseModel):
    active_curve_id: str | None = None
    resample_count: int = Field(default=DEFAULT_POINT_COUNT, ge=2, le=200)
    unskew_mode: Literal["perspective", "mesh"] | None = None
    mesh: MeshGridPayload | None = None
    canvas_mode: Literal[
        "select", "place", "axis", "pick-color", "segment-fill", "point-match"
    ] = "select"
    show_mask: bool = False
    grid: GridGeometrySettings | None = None
```

At the end of the file, add request/response models:

```python
class FilterSuggestRequest(BaseModel):
    pixel: tuple[float, float]
    curve_id: str | None = None


class GridDetectRequest(BaseModel):
    curve_id: str | None = None


class SnapRequest(BaseModel):
    curve_id: str
    pixels: list[tuple[float, float]]
    window: int = 7
    direction: tuple[float, float] | None = None


class SnapResponse(BaseModel):
    pixels: list[tuple[float, float]]
```

- [ ] **Step 4: Implement `build_curve_mask` in `backend/app/pipeline/pipeline.py`**

Add imports:

```python
from app.cv.color_filter import build_filter_mask
from app.cv.grid_removal import GridGeometry, detect_grid, remove_grid
from app.models.schemas import ColorFilter, Curve, GridGeometrySettings, Point, Session, UnskewApplyRequest
```

(`ColorFilter` is new; keep existing `UnskewApplyRequest` import — merge with the current `from app.models.schemas import Curve, Point, Session, UnskewApplyRequest` line.)

Append:

```python
def _decode_bgr(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode plot image")
    return img


def _geometry_from_settings(settings: GridGeometrySettings) -> GridGeometry:
    return GridGeometry(
        start_x=settings.start_x,
        step_x=settings.step_x,
        count_x=settings.count_x,
        start_y=settings.start_y,
        step_y=settings.step_y,
        count_y=settings.count_y,
    )


def build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray:
    curve = _require_curve(session, curve_id)
    img = _decode_bgr(image_bytes)
    flt = curve.filter or ColorFilter()
    mask = build_filter_mask(img, flt)
    if not flt.remove_grid:
        return mask
    geom = None
    close_distance = 10
    if session.workspace is not None and session.workspace.grid is not None:
        settings = session.workspace.grid
        close_distance = settings.close_distance
        if settings.count_x > 0 or settings.count_y > 0:
            geom = _geometry_from_settings(settings)
    if geom is None:
        geom = detect_grid(mask)
    if geom is None:
        return mask
    return remove_grid(mask, geom, close_distance=close_distance)
```

- [ ] **Step 5: Run pipeline tests**

Run: `cd backend && .venv/bin/pytest tests/test_pipeline_mask.py -v`

Expected: PASS.

- [ ] **Step 6: Write failing API tests**

Create `backend/tests/test_filter_api.py`:

```python
from __future__ import annotations

import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app

client = TestClient(app)


def _png_bytes() -> bytes:
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 40), (110, 40)], fill=(0, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _session_with_curve() -> tuple[str, str]:
    res = client.post("/sessions", files={"file": ("plot.png", _png_bytes(), "image/png")})
    assert res.status_code == 200
    sid = res.json()["id"]
    curve_id = "curve-1"
    patch = client.patch(
        f"/sessions/{sid}/curves",
        json={
            "curves": [
                {
                    "id": curve_id,
                    "label": "Curve 1",
                    "color": "#111111",
                    "style": "unknown",
                    "visible": True,
                    "points": [],
                }
            ]
        },
    )
    assert patch.status_code == 200
    return sid, curve_id


def test_filter_patch_persists_and_round_trips():
    sid, curve_id = _session_with_curve()
    body = {
        "mode": "hue",
        "low": 0.9,
        "high": 0.1,
        "sample_color": "#ff0000",
        "remove_grid": True,
    }
    res = client.patch(f"/sessions/{sid}/curves/{curve_id}/filter", json=body)
    assert res.status_code == 200
    stored = res.json()["curves"][0]["filter"]
    assert stored["mode"] == "hue"
    assert stored["low"] == 0.9
    assert stored["high"] == 0.1
    assert stored["remove_grid"] is True
    again = client.get(f"/sessions/{sid}")
    assert again.json()["curves"][0]["filter"]["sample_color"] == "#ff0000"


def test_mask_png_is_binary_and_correct_size():
    sid, curve_id = _session_with_curve()
    client.patch(
        f"/sessions/{sid}/curves/{curve_id}/filter",
        json={"mode": "intensity", "low": 0.0, "high": 0.4},
    )
    res = client.get(f"/sessions/{sid}/mask", params={"curve_id": curve_id, "rev": 0})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/png")
    img = Image.open(io.BytesIO(res.content))
    assert img.size == (120, 80)
    arr = np.array(img.convert("L"))
    assert set(np.unique(arr)).issubset({0, 255})


def test_suggest_and_snap_and_detect():
    sid, curve_id = _session_with_curve()
    sug = client.post(
        f"/sessions/{sid}/filter/suggest",
        json={"pixel": [40.0, 40.0], "curve_id": curve_id},
    )
    assert sug.status_code == 200
    assert sug.json()["mode"] in {"intensity", "foreground", "hue", "saturation", "value"}
    client.patch(f"/sessions/{sid}/curves/{curve_id}/filter", json=sug.json())

    snap = client.post(
        f"/sessions/{sid}/snap",
        json={"curve_id": curve_id, "pixels": [[40.0, 36.0]]},
    )
    assert snap.status_code == 200
    snapped = snap.json()["pixels"][0]
    assert abs(snapped[1] - 40.0) < 3.0

    det = client.post(f"/sessions/{sid}/grid/detect", json={"curve_id": curve_id})
    assert det.status_code == 200


def test_filter_routes_error_shapes():
    sid, curve_id = _session_with_curve()
    missing = client.get("/sessions/no-such/mask")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Session not found"

    bad_curve = client.patch(
        f"/sessions/{sid}/curves/nope/filter",
        json={"mode": "intensity", "low": 0.0, "high": 0.4},
    )
    assert bad_curve.status_code == 400
    err = bad_curve.json()["detail"]["error"]
    assert "code" in err and "message" in err and "hint" in err

    invalid = client.patch(
        f"/sessions/{sid}/curves/{curve_id}/filter",
        json={"mode": "not-a-mode", "low": 0.0, "high": 0.4},
    )
    assert invalid.status_code == 422
    assert "detail" in invalid.json()
```

- [ ] **Step 7: Run API tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_filter_api.py -v`

Expected: FAIL with 404 on `/filter/suggest` / `/mask` / `/snap` (FastAPI `Not Found`) until routes exist.

- [ ] **Step 8: Wire routes in `backend/app/api/sessions.py`**

Add `import cv2` and `import numpy as np` next to the existing `import io`. Replace the FastAPI / schema / pipeline import blocks with:

```python
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from PIL import Image

from app.calibration.calibration import CalibrationError, validate_calibration
from app.cv.color_filter import build_filter_mask, suggest_filter_from_pixel
from app.cv.grid_removal import GridGeometry, detect_grid
from app.cv.snap import snap_to_ink
from app.cv.unskew import UnskewError
from app.export.export import export_csv, export_json
from app.export.import_curves import ImportError as CurveImportError
from app.export.import_curves import import_curves_replace_session
from app.export.project_io import ProjectError, load_project_from_bytes, project_export_filename
from app.models.schemas import (
    ApiError,
    ApiErrorDetail,
    CalibrationUpdate,
    ColorFilter,
    CurvesEditRequest,
    FilterSuggestRequest,
    GridDetectRequest,
    GridGeometrySettings,
    ImageSource,
    ResampleRequest,
    Session,
    SessionPreferencesPatch,
    SessionPublic,
    SnapRequest,
    SnapResponse,
    UnskewApplyRequest,
    WorkspaceState,
)
from app.pipeline.pipeline import (
    build_curve_mask,
    run_cv_improve,
    run_remove_curve_from_plot,
    run_resample,
    run_unskew_apply,
)
from app.store.session_store import session_store
```

(Keep the existing `from app.cv.unskew import UnskewError` only once — the current file already imports it; merge, do not duplicate.)

Add helpers after `_to_public`:

```python
def _decode_session_bgr(image_bytes: bytes):
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode plot image")
    return img


def _active_curve_id(session: Session, curve_id: str | None) -> str:
    if curve_id:
        return curve_id
    if session.workspace and session.workspace.active_curve_id:
        return session.workspace.active_curve_id
    if session.curves:
        return session.curves[0].id
    raise ValueError("No curve available")


def _settings_from_geom(geom: GridGeometry, close_distance: int = 10) -> GridGeometrySettings:
    return GridGeometrySettings(
        start_x=geom.start_x,
        step_x=geom.step_x,
        count_x=geom.count_x,
        start_y=geom.start_y,
        step_y=geom.step_y,
        count_y=geom.count_y,
        close_distance=close_distance,
    )
```

Add routes (grid detect uses `build_filter_mask`, not `build_curve_mask`, so an already-enabled `remove_grid` cannot hide the grid from the detector):

```python
@router.post("/{session_id}/filter/suggest", response_model=ColorFilter)
def suggest_filter(session_id: str, body: FilterSuggestRequest) -> ColorFilter:
    stored = _require(session_id)
    try:
        img = _decode_session_bgr(stored.image_bytes)
    except ValueError as exc:
        raise _error(exc, "invalid_image") from exc
    return suggest_filter_from_pixel(img, body.pixel)


@router.patch("/{session_id}/curves/{curve_id}/filter", response_model=SessionPublic)
def patch_curve_filter(session_id: str, curve_id: str, body: ColorFilter) -> SessionPublic:
    stored = _require(session_id)
    curve = next((c for c in stored.session.curves if c.id == curve_id), None)
    if curve is None:
        raise _error(ValueError(f"Curve {curve_id} not found"), "curve_not_found")
    session_store.push_history(stored, "curve_filter")
    curve.filter = body
    session_store.update(session_id, stored.session)
    return _to_public(stored)


@router.get("/{session_id}/mask")
def get_curve_mask(
    session_id: str,
    curve_id: str | None = Query(default=None),
    rev: int | None = Query(default=None),
) -> Response:
    stored = _require(session_id)
    try:
        cid = _active_curve_id(stored.session, curve_id)
        mask = build_curve_mask(stored.session, stored.image_bytes, cid)
    except ValueError as exc:
        raise _error(exc, "mask_input", str(exc)) from exc
    ok, buf = cv2.imencode(".png", mask)
    if not ok:
        raise _error(ValueError("Failed to encode mask"), "mask_encode")
    headers = {"Cache-Control": "no-store"}
    if rev is not None:
        headers["X-Mask-Rev"] = str(rev)
    return Response(content=buf.tobytes(), media_type="image/png", headers=headers)


@router.post("/{session_id}/grid/detect", response_model=GridGeometrySettings | None)
def detect_session_grid(
    session_id: str, body: GridDetectRequest | None = None
) -> GridGeometrySettings | None:
    stored = _require(session_id)
    req = body or GridDetectRequest()
    try:
        cid = _active_curve_id(stored.session, req.curve_id)
        curve = next((c for c in stored.session.curves if c.id == cid), None)
        if curve is None:
            raise ValueError(f"Curve {cid} not found")
        img = _decode_session_bgr(stored.image_bytes)
        mask = build_filter_mask(img, curve.filter or ColorFilter())
    except ValueError as exc:
        raise _error(exc, "grid_detect_input", str(exc)) from exc
    geom = detect_grid(mask)
    session_store.push_history(stored, "grid_detect")
    current = stored.session.workspace or WorkspaceState()
    stored.session.workspace = current.model_copy(
        update={"grid": None if geom is None else _settings_from_geom(geom)}
    )
    session_store.update(session_id, stored.session)
    if geom is None:
        return None
    return stored.session.workspace.grid


@router.post("/{session_id}/snap", response_model=SnapResponse)
def snap_session_pixels(session_id: str, body: SnapRequest) -> SnapResponse:
    stored = _require(session_id)
    try:
        mask = build_curve_mask(stored.session, stored.image_bytes, body.curve_id)
    except ValueError as exc:
        raise _error(exc, "snap_input", str(exc)) from exc
    snapped = [
        snap_to_ink(mask, tuple(p), window=body.window, direction=body.direction)
        for p in body.pixels
    ]
    return SnapResponse(pixels=snapped)
```

- [ ] **Step 9: Run API + existing tests**

Run: `cd backend && .venv/bin/pytest tests/test_filter_api.py tests/test_pipeline_mask.py tests/test_api.py tests/test_preferences.py tests/test_cv.py -v`

Expected: PASS. Existing sessions still load (`filter` default `None`, new workspace fields defaulted). `cv/trace.py` still imported by improve.

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/schemas.py backend/app/pipeline/pipeline.py backend/app/api/sessions.py backend/tests/test_pipeline_mask.py backend/tests/test_filter_api.py
git commit -m "$(cat <<'EOF'
feat: expose colour filter, mask, grid detect, and snap APIs

build_curve_mask is the compose point later auto-digitize tools will consume.
EOF
)"
```

---

### Task 6: Filter UI

**Files:**
- Create: `frontend/src/lib/colorFilter.ts`
- Create: `frontend/src/lib/__tests__/colorFilter.test.ts`
- Create: `frontend/src/components/FilterPanel.tsx`
- Create: `frontend/src/components/MaskOverlay.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/EditorCanvas.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `README.md` (architecture: FilterPanel + `cv/color_filter` · `grid_removal` · `snap`)
- Modify: `UPDATES.md` (new top entry, feature `subver` bump)

**Interfaces:**
- Consumes: Task 5 JSON shapes (`ColorFilter`, `GridGeometrySettings`, mask PNG URL, snap `{pixels}`). Phase 1 already migrated the canvas to a single `canvasMode: CanvasMode` / `onCanvasModeChange` (no `addPointMode`, no `onAddPointModeChange`). The union already contains `'select' | 'place' | 'axis'` wired in `EditorCanvas`, `App.tsx`, and `CurveList.tsx`. Place-points is `canvasMode === 'place'`. `axisPlaceStep` stays as the calibration bound-placing state and is not part of the mode union. Phase 2 adds exactly one implemented value: `'pick-color'`.
- Produces:
  - `export type FilterMode = 'intensity' | 'foreground' | 'hue' | 'saturation' | 'value'`
  - `CanvasMode` is **not** produced here. Phase 1 introduced it once as `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'` (full spec §5.3). Do not redefine or narrow it. `'segment-fill'` and `'point-match'` stay unused until later phases.
  - `export interface ColorFilter { mode: FilterMode; low: number; high: number; sample_color?: string | null; remove_grid?: boolean }`
  - `export interface GridGeometrySettings { start_x: number; step_x: number; count_x: number; start_y: number; step_y: number; count_y: number; close_distance?: number }`
  - `normToDisplay` / `displayToNorm` / `maskPreviewUrl` / `previewFilterFromHex` in `colorFilter.ts`
  - Client: `suggestFilter`, `patchCurveFilter`, `detectGrid`, `snapPixels`
  - No component rendering tests (no testing-library). Pure functions only.

Phase 0 already added vitest. Do not add a second test runner. Run `cd frontend && npm test`.

- [ ] **Step 1: Write failing vitest tests**

Create `frontend/src/lib/__tests__/colorFilter.test.ts` (do not create `colorFilter.ts` yet):

```typescript
import { describe, expect, it } from 'vitest'
import {
  displayMax,
  displayToNorm,
  maskPreviewUrl,
  normToDisplay,
  previewFilterFromHex,
} from '../colorFilter'

describe('colorFilter helpers', () => {
  it('maps intensity 0..1 to 0..100 display', () => {
    expect(displayMax('intensity')).toBe(100)
    expect(normToDisplay('intensity', 0.4)).toBeCloseTo(40)
    expect(displayToNorm('intensity', 50)).toBeCloseTo(0.5)
  })

  it('maps hue 0..1 to 0..360 display', () => {
    expect(displayMax('hue')).toBe(360)
    expect(normToDisplay('hue', 0.5)).toBeCloseTo(180)
    expect(displayToNorm('hue', 36)).toBeCloseTo(0.1)
  })

  it('builds a cache-busted mask URL', () => {
    expect(maskPreviewUrl('abc', 'curve-1', 4)).toBe(
      '/sessions/abc/mask?curve_id=curve-1&rev=4',
    )
  })

  it('previews hue mode for saturated hex and intensity for gray', () => {
    expect(previewFilterFromHex('#0000ff').mode).toBe('hue')
    expect(previewFilterFromHex('#0000ff').sample_color).toBe('#0000ff')
    expect(previewFilterFromHex('#777777').mode).toBe('intensity')
  })
})
```

- [ ] **Step 2: Run frontend tests to verify they fail**

Run: `cd frontend && npm test -- src/lib/__tests__/colorFilter.test.ts`

Expected: FAIL with `Cannot find module '../colorFilter'` or `Failed to resolve import`.

- [ ] **Step 3: Implement `frontend/src/lib/colorFilter.ts`**

```typescript
export type FilterMode = 'intensity' | 'foreground' | 'hue' | 'saturation' | 'value'

export interface ColorFilter {
  mode: FilterMode
  low: number
  high: number
  sample_color?: string | null
  remove_grid?: boolean
}

export function displayMax(mode: FilterMode): number {
  return mode === 'hue' ? 360 : 100
}

export function normToDisplay(mode: FilterMode, norm: number): number {
  return norm * displayMax(mode)
}

export function displayToNorm(mode: FilterMode, display: number): number {
  const max = displayMax(mode)
  if (max === 0) return 0
  return display / max
}

export function maskPreviewUrl(sessionId: string, curveId: string, rev: number): string {
  return `/sessions/${sessionId}/mask?curve_id=${encodeURIComponent(curveId)}&rev=${rev}`
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return [r, g, b]
}

export function previewFilterFromHex(hex: string): Pick<ColorFilter, 'mode' | 'sample_color'> {
  const rgb = hexToRgb(hex)
  if (!rgb) return { mode: 'intensity', sample_color: hex }
  const [r, g, b] = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  return { mode: sat >= 0.25 ? 'hue' : 'intensity', sample_color: hex }
}
```

- [ ] **Step 4: Run frontend unit tests**

Run: `cd frontend && npm test -- src/lib/__tests__/colorFilter.test.ts`

Expected: PASS.

- [ ] **Step 5: Add types and client methods**

In `frontend/src/types.ts` add (after `CurveStyle`). Phase 1 already exported `CanvasMode` as `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'` and `WorkspaceState.canvas_mode?: CanvasMode`. Do **not** add a second `CanvasMode` alias and do **not** narrow the union.

```typescript
export type FilterMode = 'intensity' | 'foreground' | 'hue' | 'saturation' | 'value'

export interface ColorFilter {
  mode: FilterMode
  low: number
  high: number
  sample_color?: string | null
  remove_grid?: boolean
}

export interface GridGeometrySettings {
  start_x: number
  step_x: number
  count_x: number
  start_y: number
  step_y: number
  count_y: number
  close_distance?: number
}
```

On `export interface Curve`, after `points: Point[]`, add:

```typescript
  filter?: ColorFilter | null
```

On `export interface WorkspaceState`, add only the Phase 2 fields (`canvas_mode` already exists from Phase 1):

```typescript
  show_mask?: boolean
  grid?: GridGeometrySettings | null
```

In `frontend/src/api/client.ts`, extend the types import and append:

```typescript
import type {
  Calibration,
  ColorFilter,
  Curve,
  GridGeometrySettings,
  Session,
  WorkspaceState,
} from '../types'
import { maskPreviewUrl } from '../lib/colorFilter'

export async function suggestFilter(
  id: string,
  pixel: [number, number],
  curveId?: string,
): Promise<ColorFilter> {
  return request<ColorFilter>(`/sessions/${id}/filter/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pixel, curve_id: curveId ?? null }),
  })
}

export async function patchCurveFilter(
  id: string,
  curveId: string,
  filter: ColorFilter,
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/filter`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter),
  })
}

export async function detectGrid(id: string, curveId?: string): Promise<GridGeometrySettings | null> {
  return request<GridGeometrySettings | null>(`/sessions/${id}/grid/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curve_id: curveId ?? null }),
  })
}

export async function snapPixels(
  id: string,
  curveId: string,
  pixels: [number, number][],
): Promise<[number, number][]> {
  const body = await request<{ pixels: [number, number][] }>(`/sessions/${id}/snap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curve_id: curveId, pixels }),
  })
  return body.pixels
}

export function sessionMaskUrl(sessionId: string, curveId: string, rev: number): string {
  return maskPreviewUrl(sessionId, curveId, rev)
}
```

- [ ] **Step 6: Create `FilterPanel.tsx` and `MaskOverlay.tsx`**

`frontend/src/components/MaskOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'

interface Props {
  url: string
  width: number
  height: number
  opacity: number
}

export function MaskOverlay({ url, width, height, opacity }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = url
    return () => {
      img.onload = null
    }
  }, [url])

  if (!image) return null
  return (
    <KonvaImage image={image} width={width} height={height} opacity={opacity} listening={false} />
  )
}
```

`frontend/src/components/FilterPanel.tsx`:

```tsx
import type { ColorFilter, FilterMode, GridGeometrySettings } from '../types'
import { displayMax, displayToNorm, normToDisplay } from '../lib/colorFilter'

export type MaskView = 'none' | 'image' | 'mask'

const MODES: FilterMode[] = ['intensity', 'foreground', 'hue', 'saturation', 'value']

interface Props {
  filter: ColorFilter | null
  disabled: boolean
  busy: boolean
  picking: boolean
  maskView: MaskView
  grid: GridGeometrySettings | null
  onFilterChange: (next: ColorFilter) => void
  onPickColor: () => void
  onMaskViewChange: (view: MaskView) => void
  onToggleGrid: (enabled: boolean) => void
}

function defaultFilter(): ColorFilter {
  return { mode: 'intensity', low: 0, high: 0.4, sample_color: null, remove_grid: false }
}

export function FilterPanel({
  filter,
  disabled,
  busy,
  picking,
  maskView,
  grid,
  onFilterChange,
  onPickColor,
  onMaskViewChange,
  onToggleGrid,
}: Props) {
  const flt = filter ?? defaultFilter()
  const max = displayMax(flt.mode)
  const lowDisp = Math.round(normToDisplay(flt.mode, flt.low))
  const highDisp = Math.round(normToDisplay(flt.mode, flt.high))
  const gridSummary = grid
    ? `x ${grid.count_x}×${grid.step_x.toFixed(1)}px @ ${grid.start_x.toFixed(0)} · y ${grid.count_y}×${grid.step_y.toFixed(1)}px @ ${grid.start_y.toFixed(0)}`
    : 'no grid detected'

  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Filter</h3>
        <select
          disabled={disabled || busy}
          value={flt.mode}
          onChange={(e) => onFilterChange({ ...flt, mode: e.target.value as FilterMode })}
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-200"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onPickColor}
          className={`shrink-0 rounded px-2 py-0.5 font-medium disabled:opacity-50 ${
            picking ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {picking ? 'Click plot…' : 'Pick colour'}
        </button>
        <div className="flex shrink-0 rounded border border-slate-600 text-[10px]">
          {(['none', 'image', 'mask'] as MaskView[]).map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onMaskViewChange(v)}
              className={`px-2 py-0.5 ${
                maskView === v ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-300">
          <input
            type="checkbox"
            disabled={disabled || busy}
            checked={!!flt.remove_grid}
            onChange={(e) => onToggleGrid(e.target.checked)}
          />
          Remove grid
        </label>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-slate-300">
        <span className="tabular-nums">
          {lowDisp}–{highDisp} / {max}
        </span>
        <input
          type="range"
          min={0}
          max={max}
          value={lowDisp}
          disabled={disabled || busy}
          onChange={(e) =>
            onFilterChange({ ...flt, low: displayToNorm(flt.mode, Number(e.target.value)) })
          }
        />
        <input
          type="range"
          min={0}
          max={max}
          value={highDisp}
          disabled={disabled || busy}
          onChange={(e) =>
            onFilterChange({ ...flt, high: displayToNorm(flt.mode, Number(e.target.value)) })
          }
        />
        {flt.sample_color && (
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-slate-500" style={{ background: flt.sample_color }} />
            {flt.sample_color}
          </span>
        )}
      </div>
      <p className="text-slate-400">{flt.remove_grid ? gridSummary : 'Grid removal off'}</p>
    </section>
  )
}
```

- [ ] **Step 7: Add `pick-color` to `EditorCanvas.tsx`**

Phase 1 already owns `canvasMode: CanvasMode` and `onCanvasModeChange` on `EditorCanvas`, `App.tsx`, and `CurveList.tsx`. The type is the full spec §5.3 union `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'` (defined once in `frontend/src/types.ts`). `'select' | 'place' | 'axis'` are already wired; place-points is `canvasMode === 'place'`. `addPointMode` and `onAddPointModeChange` no longer exist — do not reintroduce them. `axisPlaceStep` stays as the calibration bound-placing state and is not part of the mode union. This step adds exactly one implemented value: `'pick-color'`. Do not redeclare or narrow `CanvasMode`. Prefer a positive test on the union (`canvasMode === 'select'`) over a growing `&& canvasMode !== 'x'` chain.

1. Import `MaskOverlay` and `MaskView`. Phase 1 already imports `CanvasMode` from `../types` — keep that import; do not add a second alias.

```tsx
import { MaskOverlay } from './MaskOverlay'
import type { MaskView } from './FilterPanel'
```

(`MaskView` is exported from `FilterPanel.tsx` as `'none' | 'image' | 'mask'`.)

2. `canvasMode` is already on `interface Props` as `canvasMode: CanvasMode` (required). Do **not** add another `canvasMode` prop and do **not** narrow it to a subset of the union. Add only:

```tsx
  onPickColor?: (pixel: [number, number]) => void
  maskUrl?: string | null
  maskView?: MaskView
```

Default `maskView` to `'none'`.

3. Destructure the new props (do not re-declare `canvasMode` in the parameter list; Phase 1 already destructures it):

```tsx
  onPickColor,
  maskUrl = null,
  maskView = 'none',
```

4. Phase 1's stage-drag `useEffect` already keys on `canvasMode`. Replace that effect so drag is a **positive** test on `'select'` (plus Space-pan). Do not enumerate `canvasMode !== 'place' && canvasMode !== 'pick-color' && …`.

```tsx
  useEffect(() => {
    setStageDraggable(canvasMode === 'select' || spaceDownRef.current)
  }, [canvasMode])
```

5. In `handleStageMouseDown`, after the existing `axisPlaceStep` block (leave that block unchanged), handle pick-color. Phase 1 already handles `canvasMode === 'place'` — insert this next to that union branch, not next to a removed boolean:

```tsx
    if (canvasMode === 'pick-color' && onPickColor) {
      onPickColor(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
```

6. In `handleStageClick`, Phase 1 already returns early when not selecting. Keep that as a positive union test plus `axisPlaceStep`:

```tsx
    if (axisPlaceStep || canvasMode !== 'select') return
```

7. In `handleMouseUp`, restore drag only when select + Space + not placing an axis bound:

```tsx
    setStageDraggable(canvasMode === 'select' && !axisPlaceStep && spaceDownRef.current)
```

8. On the `Stage`, `draggable` is enabled only for select (or Space-pan) and not while `axisPlaceStep` is set:

```tsx
        draggable={stageDraggable && (canvasMode === 'select' || spacePan) && !axisPlaceStep}
```

9. After the plot `KonvaImage` (keep rendering the plot only when `maskView !== 'mask'`), add:

```tsx
          {imageSource && maskView !== 'mask' && (
            <KonvaImage
              ref={konvaImageRef}
              key={previewImageKey}
              image={imageSource}
              width={displayWidth}
              height={displayHeight}
            />
          )}
          {maskUrl && maskView !== 'none' && (
            <MaskOverlay
              url={maskUrl}
              width={displayWidth}
              height={displayHeight}
              opacity={maskView === 'mask' ? 1 : 0.45}
            />
          )}
```

Replace the existing `{imageSource && (` `KonvaImage` block with that pair so the colour plot is hidden in `'mask'` view.

10. Phase 1 already passes `canvasMode` into `PlotInteractionHint`. Do not re-add that prop. Insert, after the `axisPlaceStep` branch:

```tsx
  } else if (canvasMode === 'pick-color') {
    text = `Click the plot to sample a curve colour. ${panHint}`
```

- [ ] **Step 8: Wire `App.tsx`**

Phase 1 already has `canvasMode` / `setCanvasMode` in `App.tsx` and already passes `canvasMode` and `onCanvasModeChange` to `EditorCanvas` and `CurveList`. Place and axis are already mapped through that union. Do **not** reintroduce `addPointMode`, `setAddPointMode`, or `onAddPointModeChange`. Do **not** add a second `useState<CanvasMode>`. `CurveList` already owns place-points as `canvasMode === 'place'` — do not add a `Place points` toggle or thread a boolean through `App.tsx`. This step only adds mask-view state and `'pick-color'` entry/exit.

Imports — add (Phase 1 already imports `CanvasMode`; keep that import):

```tsx
import { detectGrid, patchCurveFilter, suggestFilter } from './api/client'
import { FilterPanel, type MaskView } from './components/FilterPanel'
import { maskPreviewUrl } from './lib/colorFilter'
import type { ColorFilter, Session } from './types'
```

State — add only `maskView` next to the existing Phase 1 `canvasMode` state (do not declare `canvasMode` again):

```tsx
  const [maskView, setMaskView] = useState<MaskView>('none')
```

Active curve helper inside the component (after `session` exists):

```tsx
  const activeCurve = session?.curves.find((c) => c.id === activeCurveId) ?? null
```

Handlers:

```tsx
  const commitFilter = (next: ColorFilter) => {
    if (!session || !activeCurveId) return
    run(() => patchCurveFilter(session.id, activeCurveId, next), 'Saving filter…')
  }

  const handlePickColor = () => {
    setAxisPlaceStep(null)
    setCanvasMode('pick-color')
  }

  const handlePickedPixel = (pixel: [number, number]) => {
    if (!session || !activeCurveId) return
    run(async () => {
      const suggested = await suggestFilter(session.id, pixel, activeCurveId)
      const merged: ColorFilter = {
        ...suggested,
        remove_grid: activeCurve?.filter?.remove_grid ?? false,
      }
      const saved = await patchCurveFilter(session.id, activeCurveId, merged)
      setCanvasMode('select')
      return saved
    }, 'Sampling colour…')
  }

  const handleToggleGrid = (enabled: boolean) => {
    if (!session || !activeCurveId) return
    run(async () => {
      if (enabled && !session.workspace?.grid) {
        await detectGrid(session.id, activeCurveId)
      }
      const base = activeCurve?.filter ?? {
        mode: 'intensity' as const,
        low: 0,
        high: 0.4,
        remove_grid: false,
      }
      return patchCurveFilter(session.id, activeCurveId, {
        ...base,
        remove_grid: enabled,
      })
    }, enabled ? 'Detecting grid…' : 'Updating filter…')
  }
```

Do not wrap or replace Phase 1's `onCanvasModeChange` / `startAxisPlacement` wiring. Those already set `'place'` / `'axis'` / `'select'`. FilterPanel enters pick-color via `handlePickColor` (`setCanvasMode('pick-color')`) and leaves via `handlePickedPixel` (`setCanvasMode('select')`).

Insert `<FilterPanel … />` in the top bar immediately after `<UnskewPanel … />`.

```tsx
        <FilterPanel
          filter={activeCurve?.filter ?? null}
          disabled={!session || !activeCurve}
          busy={busy}
          picking={canvasMode === 'pick-color'}
          maskView={maskView}
          grid={session?.workspace?.grid ?? null}
          onFilterChange={commitFilter}
          onPickColor={handlePickColor}
          onMaskViewChange={(view) => {
            setMaskView(view)
            if (session) {
              patchSessionPreferences(session.id, {
                workspace: {
                  ...(session.workspace ?? {}),
                  show_mask: view !== 'none',
                  canvas_mode: canvasMode,
                },
              }).catch(() => {})
            }
          }}
          onToggleGrid={handleToggleGrid}
        />
```

Phase 1 already passes `canvasMode={canvasMode}` and `onCanvasModeChange={setCanvasMode}` (or equivalent) into `EditorCanvas`. Add only the three new props:

```tsx
              onPickColor={handlePickedPixel}
              maskUrl={
                session && activeCurveId && maskView !== 'none'
                  ? maskPreviewUrl(session.id, activeCurveId, session.image_meta.revision ?? 0)
                  : null
              }
              maskView={maskView}
```

- [ ] **Step 9: Docs**

`UPDATES.md` — new top changelog entry `2.4.0` (feature `subver` bump from Phase 1's `2.3.0`; newest entry on top). Title: "Colour filter, grid removal and subpixel snap".

```markdown
## [2.4.0] — 2026-09-04 — Colour filter, grid removal and subpixel snap
### Added
- Precision toolkit phase 2: per-curve colour filter (intensity / foreground / hue / saturation / value), optional grid detection + removal with stump healing, subpixel ink snap, FilterPanel with pick-colour mode and mask overlay. Shared compose point `build_curve_mask` for later auto-digitize tools.
```

`README.md` — Architecture diagram: add `FilterPanel` next to `UnskewPanel`; backend `cv/` line becomes `trace · improve · resample · erase · unskew · color_filter · grid_removal · snap`. Mention **[`UPDATES.md`](UPDATES.md)** remains mandatory. Do not create any other markdown file.

- [ ] **Step 10: Verify**

Run: `cd backend && .venv/bin/pytest tests/test_color_filter.py tests/test_grid_removal.py tests/test_snap.py tests/test_pipeline_mask.py tests/test_filter_api.py tests/test_cv.py tests/test_api.py -v`

Expected: PASS.

Run: `cd frontend && npm test`

Expected: PASS.

Run: `cd frontend && npx tsc -b --pretty false`

Expected: no new errors.

Exercise in the browser (user verification workflow): upload a plot, open FilterPanel, pick a colour on the curve, toggle mask view none/image/mask, enable Remove grid on a gridded figure, confirm the overlay matches the PNG from `GET /mask`. If browser tools are unavailable, say so in the task report.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/colorFilter.ts frontend/src/lib/__tests__/colorFilter.test.ts frontend/src/types.ts frontend/src/api/client.ts frontend/src/components/FilterPanel.tsx frontend/src/components/MaskOverlay.tsx frontend/src/components/EditorCanvas.tsx frontend/src/App.tsx README.md UPDATES.md
git commit -m "$(cat <<'EOF'
feat: add FilterPanel, pick-colour mode, and mask overlay

Wire the shared mask pipeline into the editor so users can discretize a curve and preview grid removal.
EOF
)"
```

---

## Self-Review

**1. Spec coverage.** §5.2 shared mask pipeline → Tasks 1–3 compose in Task 5 `build_curve_mask`. §6 `ColorFilter` / `FilterMode` → Task 1; `GridGeometrySettings`, `Curve.filter`, `WorkspaceState.show_mask` / `grid` → Task 5. Phase 1 owns §5.3 `CanvasMode` / `WorkspaceState.canvas_mode` (full six-value union); Task 6 implements `'pick-color'` only. §7 `build_filter_mask`, `suggest_filter_from_pixel`, `GridGeometry`, `detect_grid`, `remove_grid`, `snap_to_ink` → Tasks 1–4 with those exact names. §8 filter/mask/grid/snap routes → Task 5 (segment-fill and point-match are Phase 3/4, not this plan). §9 FilterPanel behaviour → Task 6. §10.4 colour-filter `F1 >= 0.90` → synthetic `test_intensity_mask_f1_against_labelled_ink` only; `pointplot.bmp` verifies class separation, not that gate. Grid F1/recall 0.90/0.95 → Task 3; snap MAE ≤ 0.35 → Task 4. `cv/trace.py` kept. Phase 3 workspace keys (`point_separation`, `min_segment_length`, `fill_corners`, `max_point_size`, `show_axes_checker`) are **not** added here (YAGNI; Phase 3). `Curve.connect_as` is Phase 4.

**2. Placeholder scan.** No TBD / TODO / “add error handling” / “similar to Task N” / “write tests for the above”. Code steps contain full modules. `color_filter_from_engauge` lives in `backend/tests/reference/refcorpus.py` (test-only; Engauge attribute vocabulary never enters `app/`). Task 5 routes import `cv2`/`numpy` at module level.

**3. Type consistency.** `ColorFilter.low`/`high` are `float` in `[0,1]` everywhere. `GridGeometry` (dataclass, CV) vs `GridGeometrySettings` (Pydantic/JSON, includes `close_distance`) is mapped only at the API/pipeline boundary. `detect_grid` → `GridGeometry | None`. `remove_grid(mask, geom, close_distance=10)`. `snap_to_ink(mask, pixel, window=7, direction=None)`. `build_curve_mask(session, image_bytes, curve_id)`. Frontend `ColorFilter` / `GridGeometrySettings` match the backend literals. `CanvasMode` is defined **once** (Phase 1, `frontend/src/types.ts`) as `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`; backend `WorkspaceState.canvas_mode` is the same six-value Literal. Phase 2 does not redeclare or narrow either. Mask overlay views are `'none' | 'image' | 'mask'` (UI-only; workspace stores `show_mask: bool`). `color_filter_from_engauge(attrs) -> ColorFilter` is imported from `tests.reference.refcorpus`, not from `app.cv.color_filter`. Task 6 stage drag uses the positive test `canvasMode === 'select'` (plus `spaceDownRef` / `axisPlaceStep`); `addPointMode` is gone.
