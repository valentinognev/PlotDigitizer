# Precision Toolkit Phase 4: Scatter, Polar and Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Engauge-informed point-match for scatter plots, `connect_as` scatter rendering/export, polar and map preview plus CSV/project/import end-to-end, then lock the toolkit behind a reference integration suite and docs.

**Architecture:** Point match is a pure OpenCV normalised-correlation pass over the shared curve mask (`cv2.matchTemplate` + `TM_CCORR_NORMED`), not FFTW and not Engauge source. Candidates are non-mutating; accept is a single undoable append of refined pixels. `Curve.connect_as` defaults to `"line"` so existing sessions keep today's polyline/preview. Polar/map already live in `calibration/coords.py` (Phase 1); this phase only teaches PreviewChart, CSV headers, project JSON, and import to honour `coords_type`.

**Tech Stack:** Python 3 + FastAPI + Pydantic + NumPy + OpenCV + Pillow + pytest (backend); React + TypeScript + Konva + Plotly + vitest (frontend). No SciPy, no scikit-image, no FFTW, no new runtime dependencies.

**Spec:** docs/superpowers/specs/2026-09-04-precision-toolkit-design.md

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

Work on the existing precision-toolkit feature branch (never `master`). Never copy Engauge source; never vendor `samples/` or `test/` assets into this repo.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/cv/point_match.py` | Create | `MatchCandidate`, `match_points` |
| `backend/tests/test_point_match.py` | Create | Synthetic unit + API tests |
| `backend/tests/reference/test_point_match_reference.py` | Create | `pointplot.bmp` / `pointmatch.jpg` corpus tests |
| `backend/app/models/schemas.py` | Modify | `ConnectAs`, `Curve.connect_as`, `WorkspaceState.max_point_size`, point-match request/response models |
| `backend/app/pipeline/pipeline.py` | Modify | `run_point_match`, `run_point_match_accept`; reject Improve/Densify on scatter |
| `backend/app/api/sessions.py` | Modify | `POST .../point-match`, `POST .../point-match/accept` |
| `backend/app/export/export.py` | Modify | Coordinate-system CSV headers + units line |
| `backend/app/export/project_io.py` | Unchanged | `model_dump()` already persists new Calibration/Curve fields |
| `backend/app/export/import_curves.py` | Modify | Accept `theta,R` and `# units:` |
| `backend/tests/test_export.py` | Modify | Cartesian header freeze + polar/map/scatter ordering |
| `backend/tests/test_import.py` | Modify | Polar CSV + map units-line import |
| `backend/tests/test_project.py` | Modify | Project round-trip of new fields |
| `backend/tests/reference/test_pipeline_reference.py` | Create | End-to-end regression + `huge.png` budget |
| `frontend/src/lib/pointMatch.ts` | Create | Ranking, ring radius, keyboard reducer |
| `frontend/src/lib/__tests__/pointMatch.test.ts` | Create | Vitest for the reducer/helpers |
| `frontend/src/lib/previewChart.ts` | Create | `connectAsToPlotlyMode`, `buildPreviewConfig` |
| `frontend/src/lib/__tests__/previewChart.test.ts` | Create | Vitest for trace mode + polar/map layout |
| `frontend/src/components/CandidateOverlay.tsx` | Create | Ranked candidate rings |
| `frontend/src/components/AutoDigitizePanel.tsx` | Modify | Point-match max size + mode button + apply |
| `frontend/src/components/EditorCanvas.tsx` | Modify | `point-match` mode, overlay, skip scatter polyline |
| `frontend/src/components/PreviewChart.tsx` | Modify | Polar `scatterpolar`, map axes, scatter markers |
| `frontend/src/components/CurveList.tsx` | Modify | `connect_as` selector; disable Improve/Densify on scatter |
| `frontend/src/types.ts` | Modify | `MatchCandidate`, `ConnectAs`, `max_point_size` |
| `frontend/src/api/client.ts` | Modify | `pointMatch`, `pointMatchAccept` |
| `frontend/src/App.tsx` | Modify | Point-match state machine + keyboard |
| `UPDATES.md` | Modify | Phases 1–4 changelog entries |
| `README.md` | Modify | How It Works / Architecture / Status |

## Prior-phase contracts this plan consumes (do not reimplement)

- Phase 0: `tests.synth.plotgen.render_plot` → `SynthPlot` with `.image` (BGR), `.pixel_of`, `.data_of`, `.axis_points`, `.truth`. `markers` is a list of dicts `{"xy": (x, y), "shape": "circle"|"triangle"|"diamond"|"square", "size": int, "color": (B, G, R)}`.
- Phase 0: `tests.metrics.rms_error`, `max_abs_error`, `mask_f1`, `mask_recall`, `assert_not_worse(name, value, *, lower_is_better)` vs `backend/tests/reference/baselines/metrics.json`. `pytest --update-baselines` rewrites that file. Phase 0 `conftest.py` defines `@pytest.mark.reference` and skips when `PLOTDIG_REF_DIR` is missing.
- Phase 0: `tests.reference.refcorpus.load_doc`, `iter_docs`, `sample_image(ref_dir, name)`; `ReferenceDoc` fields `name, image, coords_type, scale_x, scale_y, axis_points, curve_points, expected_csv, color_filter, segment_settings, point_match_size`.
- Phase 1: `app.calibration.coords.pixel_to_data(cal, pixel)`, `data_to_pixel(cal, data)`, `validate_calibration(cal)`. `Calibration.coords_type` is `"cartesian"|"polar"|"map"`; polar returns `(theta, R)` in `theta_units`; map returns `(x, y)` in scale-bar units. Frontend mirror: `frontend/src/lib/transform2d.ts`. `CanvasMode` is already defined once in `frontend/src/types.ts` as the full six-value union `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`; backend `WorkspaceState.canvas_mode` is the same six-value Literal. Phase 4 must not redeclare or narrow either; it only implements the `'point-match'` handler.
- Phase 2: `app.cv.color_filter.build_filter_mask(img_bgr, flt) -> np.ndarray`; `app.cv.snap.snap_to_ink(mask, pixel, window=7, direction=None)`; `app.pipeline.pipeline.build_curve_mask(session, image_bytes, curve_id) -> np.ndarray` (`image_bytes` is encoded PNG/JPEG bytes; decoding is inside the function); `Curve.filter: ColorFilter | None`.
- Phase 3: `app.cv.segments.build_segments`, `segment_at`, `fill_segment`; `frontend/src/components/AutoDigitizePanel.tsx` already mounted from `App.tsx`.

Engauge intensity ranges in `samples/README` are 0..100. Our `ColorFilter.low`/`high` are normalised 0..1, so 90–99 → `0.90`–`0.99` and 10–50 → `0.10`–`0.50`.

---

### Task 1: Point match core

**Files:**
- Create: `backend/app/cv/point_match.py`
- Create: `backend/tests/test_point_match.py`
- Create: `backend/tests/reference/test_point_match_reference.py`
- Modify: `backend/tests/reference/baselines/metrics.json` (via `pytest --update-baselines` after gates pass)

**Interfaces:**
- Consumes: `snap_to_ink(mask: np.ndarray, pixel: tuple[float, float], window: int = 7, direction: tuple[float, float] | None = None) -> tuple[float, float]`; `render_plot(...)` → `SynthPlot`; `build_filter_mask(img_bgr, flt) -> np.ndarray`; `ColorFilter`; `sample_image(ref_dir, name) -> np.ndarray`; `assert_not_worse(name, value, *, lower_is_better)`
- Produces:
  - `MatchCandidate(pixel: tuple[float, float], score: float)` — frozen dataclass
  - `match_points(mask: np.ndarray, sample_center: tuple[float, float], sample_radius: int, max_point_size: int = 48, exclude: list[tuple[float, float]] | None = None, limit: int = 200) -> list[MatchCandidate]` — ranked best-first (score descending), length ≤ `limit`

- [ ] **Step 1: Write the failing synthetic tests**

Create `backend/tests/test_point_match.py`:

```python
from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.cv.point_match import match_points


def _blank(w: int = 200, h: int = 160) -> np.ndarray:
    return np.zeros((h, w), dtype=np.uint8)


def _draw_circle(mask: np.ndarray, xy: tuple[float, float], radius: int = 5) -> None:
    cv2.circle(mask, (int(round(xy[0])), int(round(xy[1]))), radius, 255, thickness=-1)


def _draw_diamond(mask: np.ndarray, xy: tuple[float, float], radius: int = 6) -> None:
    x, y = int(round(xy[0])), int(round(xy[1]))
    pts = np.array(
        [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(mask, pts, 255)


def _greedy_match(
    candidates: list, truth: list[tuple[float, float]], cutoff: float
) -> tuple[int, int, float]:
    used = [False] * len(truth)
    tp = 0
    distances: list[float] = []
    for cand in candidates:
        cx, cy = cand.pixel
        best_i = -1
        best_d = cutoff + 1.0
        for i, (tx, ty) in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cx - tx, cy - ty)
            if d < best_d:
                best_d = d
                best_i = i
        if best_i >= 0 and best_d <= cutoff:
            used[best_i] = True
            tp += 1
            distances.append(best_d)
    fp = len(candidates) - tp
    mean_d = float(sum(distances) / len(distances)) if distances else 999.0
    return tp, fp, mean_d


def test_empty_mask_returns_empty():
    out = match_points(_blank(), (40.0, 40.0), sample_radius=6)
    assert out == []


def test_ranked_best_first():
    mask = _blank()
    _draw_circle(mask, (40.0, 50.0), 5)
    _draw_circle(mask, (140.0, 50.0), 5)
    out = match_points(mask, (40.0, 50.0), sample_radius=6, max_point_size=24)
    assert len(out) >= 2
    scores = [c.score for c in out]
    assert scores == sorted(scores, reverse=True)
    assert out[0].score >= 0.95
    assert math.hypot(out[0].pixel[0] - 40.0, out[0].pixel[1] - 50.0) <= 1.5


def test_limit_caps_results():
    mask = _blank(w=400, h=80)
    centres = [(20.0 + 30.0 * i, 40.0) for i in range(10)]
    for c in centres:
        _draw_circle(mask, c, 4)
    out = match_points(mask, centres[0], sample_radius=5, max_point_size=20, limit=3)
    assert len(out) == 3


def test_exclude_suppresses_placed_points():
    mask = _blank()
    a, b = (40.0, 50.0), (140.0, 50.0)
    _draw_circle(mask, a, 5)
    _draw_circle(mask, b, 5)
    first = match_points(mask, a, sample_radius=6, max_point_size=24)
    assert len(first) >= 2
    excluded = [c.pixel for c in first]
    again = match_points(
        mask, a, sample_radius=6, max_point_size=24, exclude=excluded
    )
    for cand in again:
        for ex in excluded:
            assert math.hypot(cand.pixel[0] - ex[0], cand.pixel[1] - ex[1]) > 6.0


def test_max_point_size_rejects_gridline():
    mask = _blank(w=300, h=120)
    cv2.line(mask, (10, 60), (290, 60), 255, thickness=2)
    _draw_circle(mask, (60.0, 30.0), 5)
    out = match_points(mask, (60.0, 30.0), sample_radius=6, max_point_size=16)
    assert len(out) >= 1
    for cand in out:
        assert abs(cand.pixel[1] - 60.0) > 8.0
    line_only = _blank(w=300, h=80)
    cv2.line(line_only, (10, 40), (290, 40), 255, thickness=2)
    none = match_points(line_only, (80.0, 40.0), sample_radius=8, max_point_size=12)
    assert none == []


def test_two_shapes_separable_by_sample():
    mask = _blank(w=240, h=160)
    circles = [(40.0, 40.0), (90.0, 40.0), (140.0, 40.0)]
    diamonds = [(40.0, 110.0), (90.0, 110.0), (140.0, 110.0)]
    for c in circles:
        _draw_circle(mask, c, 5)
    for d in diamonds:
        _draw_diamond(mask, d, 7)
    circ = match_points(mask, circles[0], sample_radius=7, max_point_size=24)
    tp, fp, _ = _greedy_match(circ, circles, cutoff=3.0)
    assert tp == 3
    near_diamond = 0
    for cand in circ[:3]:
        if min(math.hypot(cand.pixel[0] - d[0], cand.pixel[1] - d[1]) for d in diamonds) <= 4.0:
            near_diamond += 1
    assert near_diamond == 0
    dia = match_points(mask, diamonds[0], sample_radius=7, max_point_size=24)
    tp_d, _, _ = _greedy_match(dia, diamonds, cutoff=3.0)
    assert tp_d == 3


def test_synthetic_scatter_precision_gates():
    from tests.metrics import assert_not_worse
    from tests.synth.plotgen import render_plot

    centres = [(1.5, 2.0), (3.0, 7.5), (5.0, 4.0), (7.2, 8.0), (8.5, 1.8)]
    plot = render_plot(
        lambda x: 5.0,
        x_range=(0.0, 10.0),
        y_range=(0.0, 10.0),
        size=(400, 400),
        line_width=1,
        line_color=(255, 255, 255),
        markers=[
            {"xy": (x, y), "shape": "circle", "size": 9, "color": (0, 0, 255)}
            for x, y in centres
        ],
    )
    ink = np.any(plot.image != np.array([255, 255, 255], dtype=np.uint8), axis=2)
    mask = np.where(ink, 255, 0).astype(np.uint8)
    truth = [plot.pixel_of(x, y) for x, y in centres]
    sample = truth[0]
    out = match_points(mask, sample, sample_radius=7, max_point_size=24)
    tp, fp, mean_d = _greedy_match(out, truth, cutoff=1.5)
    n = len(truth)
    recall = tp / n
    fp_rate = fp / max(tp + fp, 1)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    assert mean_d <= 1.5
    assert_not_worse("point_match.synthetic_scatter.recall", recall, lower_is_better=False)
    assert_not_worse("point_match.synthetic_scatter.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse("point_match.synthetic_scatter.centroid_px", mean_d, lower_is_better=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.cv.point_match'` or `ImportError: cannot import name 'match_points' from 'app.cv.point_match'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/cv/point_match.py`:

```python
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.cv.snap import snap_to_ink

__all__ = ["MatchCandidate", "match_points"]


@dataclass(frozen=True)
class MatchCandidate:
    pixel: tuple[float, float]
    score: float


def _as_mask(mask: np.ndarray) -> np.ndarray:
    if mask.ndim == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    out = mask.astype(np.uint8, copy=False)
    if out.max() == 1:
        out = (out * 255).astype(np.uint8)
    return out


def _template_side(sample_radius: int, max_point_size: int) -> int:
    side = 2 * max(int(sample_radius), 1) + 1
    side = min(side, max(int(max_point_size), 3))
    if side % 2 == 0:
        side -= 1
    return max(side, 3)


def _extract_patch(
    mask: np.ndarray, center: tuple[float, float], side: int
) -> np.ndarray | None:
    h, w = mask.shape[:2]
    cx, cy = int(round(center[0])), int(round(center[1]))
    if not (0 <= cx < w and 0 <= cy < h):
        return None
    half = side // 2
    patch = np.zeros((side, side), dtype=np.uint8)
    x0, y0 = cx - half, cy - half
    src_x0, src_y0 = max(x0, 0), max(y0, 0)
    src_x1, src_y1 = min(x0 + side, w), min(y0 + side, h)
    dst_x0, dst_y0 = src_x0 - x0, src_y0 - y0
    dst_x1 = dst_x0 + (src_x1 - src_x0)
    dst_y1 = dst_y0 + (src_y1 - src_y0)
    patch[dst_y0:dst_y1, dst_x0:dst_x1] = mask[src_y0:src_y1, src_x0:src_x1]
    if int(patch.max()) == 0:
        return None
    return patch


def _blob_too_big(mask: np.ndarray, pixel: tuple[float, float], max_point_size: int) -> bool:
    h, w = mask.shape[:2]
    x, y = int(round(pixel[0])), int(round(pixel[1]))
    if not (0 <= x < w and 0 <= y < h):
        return True
    binary = (mask > 0).astype(np.uint8)
    _n, labels, stats, _centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    label = int(labels[y, x])
    if label == 0:
        return True
    bw = int(stats[label, cv2.CC_STAT_WIDTH])
    bh = int(stats[label, cv2.CC_STAT_HEIGHT])
    return bw > max_point_size or bh > max_point_size


def _too_close(
    pixel: tuple[float, float],
    others: list[tuple[float, float]],
    radius: float,
) -> bool:
    px, py = pixel
    r2 = radius * radius
    for ox, oy in others:
        dx = px - ox
        dy = py - oy
        if dx * dx + dy * dy <= r2:
            return True
    return False


def match_points(
    mask: np.ndarray,
    sample_center: tuple[float, float],
    sample_radius: int,
    max_point_size: int = 48,
    exclude: list[tuple[float, float]] | None = None,
    limit: int = 200,
) -> list[MatchCandidate]:
    mask_u8 = _as_mask(mask)
    if mask_u8.size == 0 or int(limit) <= 0:
        return []
    side = _template_side(sample_radius, max_point_size)
    patch = _extract_patch(mask_u8, sample_center, side)
    if patch is None:
        return []
    mh, mw = mask_u8.shape[:2]
    if patch.shape[0] >= mh or patch.shape[1] >= mw:
        return []
    scores = cv2.matchTemplate(mask_u8, patch, cv2.TM_CCORR_NORMED)
    peak = float(np.nanmax(scores)) if scores.size else 0.0
    if not np.isfinite(peak) or peak < 0.45:
        return []
    threshold = max(0.55, 0.60 * peak)
    kernel = max(side // 2, 3)
    if kernel % 2 == 0:
        kernel += 1
    dilated = cv2.dilate(scores, np.ones((kernel, kernel), dtype=np.uint8))
    maxima = (scores >= dilated) & (scores >= threshold) & np.isfinite(scores)
    ys, xs = np.where(maxima)
    raw: list[MatchCandidate] = []
    half = side / 2.0
    for y, x, score in zip(ys.tolist(), xs.tolist(), scores[ys, xs].tolist(), strict=True):
        raw.append(MatchCandidate(pixel=(float(x) + half, float(y) + half), score=float(score)))
    raw.sort(key=lambda c: c.score, reverse=True)
    exclusion_r = max(side / 2.0, 3.0)
    blocked = list(exclude or [])
    accepted: list[MatchCandidate] = []
    for cand in raw:
        if _too_close(cand.pixel, blocked, exclusion_r):
            continue
        if _blob_too_big(mask_u8, cand.pixel, max_point_size):
            continue
        window = min(7, max(3, side))
        if window % 2 == 0:
            window -= 1
        refined = snap_to_ink(mask_u8, cand.pixel, window=window)
        accepted.append(MatchCandidate(pixel=(float(refined[0]), float(refined[1])), score=cand.score))
        blocked.append(accepted[-1].pixel)
        if len(accepted) >= int(limit):
            break
    return accepted
```

- [ ] **Step 4: Run synthetic tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py -v`

Expected: hard gates PASS (`recall >= 0.95`, `fp_rate <= 0.02`, `mean_d <= 1.5`). Then run `cd backend && .venv/bin/pytest tests/test_point_match.py -v --update-baselines` to record those values, then re-run without the flag. Expected: PASS. Do not weaken the 0.95 / 2% / 1.5 px gates.

- [ ] **Step 5: Write the failing reference tests**

Create `backend/tests/reference/test_point_match_reference.py`:

```python
from __future__ import annotations

import math
import os

import cv2
import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.cv.point_match import match_points
from app.models.schemas import ColorFilter
from tests.metrics import assert_not_worse
from tests.reference.refcorpus import sample_image

pytestmark = pytest.mark.reference

# Engauge samples/README documents Discretize intensity on a 0..100 scale:
# triangles 90–99, diamonds 10–50. Our ColorFilter.low/high are 0..1.
TRIANGLE_FILTER = ColorFilter(mode="intensity", low=0.90, high=0.99)
DIAMOND_FILTER = ColorFilter(mode="intensity", low=0.10, high=0.50)


def _centroids(mask: np.ndarray, min_area: int = 8) -> list[tuple[float, float]]:
    binary = (mask > 0).astype(np.uint8)
    n, _labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    out: list[tuple[float, float]] = []
    for i in range(1, n):
        if int(stats[i, cv2.CC_STAT_AREA]) < min_area:
            continue
        out.append((float(centroids[i][0]), float(centroids[i][1])))
    return out


def _greedy_match(candidates, truth, cutoff: float) -> tuple[float, float, float]:
    used = [False] * len(truth)
    tp = 0
    distances: list[float] = []
    for cand in candidates:
        cx, cy = cand.pixel
        best_i = -1
        best_d = cutoff + 1.0
        for i, (tx, ty) in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cx - tx, cy - ty)
            if d < best_d:
                best_d = d
                best_i = i
        if best_i >= 0 and best_d <= cutoff:
            used[best_i] = True
            tp += 1
            distances.append(best_d)
    fp = len(candidates) - tp
    recall = tp / max(len(truth), 1)
    fp_rate = fp / max(tp + fp, 1)
    mean_d = float(sum(distances) / len(distances)) if distances else 999.0
    return recall, fp_rate, mean_d


def _run_class(img_bgr: np.ndarray, flt: ColorFilter, key: str) -> None:
    mask = build_filter_mask(img_bgr, flt)
    truth = _centroids(mask)
    assert len(truth) >= 3
    sample = truth[0]
    size = int(os.environ.get("PLOTDIG_POINT_MATCH_SIZE", "24"))
    out = match_points(mask, sample, sample_radius=max(4, size // 2), max_point_size=size)
    recall, fp_rate, mean_d = _greedy_match(out, truth, cutoff=1.5)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    assert mean_d <= 1.5
    assert_not_worse(f"point_match.{key}.recall", recall, lower_is_better=False)
    assert_not_worse(f"point_match.{key}.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse(f"point_match.{key}.centroid_px", mean_d, lower_is_better=True)


def test_pointplot_bmp_triangles_and_diamonds(ref_dir):
    img = sample_image(ref_dir, "pointplot.bmp")
    _run_class(img, TRIANGLE_FILTER, "pointplot.triangles")
    _run_class(img, DIAMOND_FILTER, "pointplot.diamonds")


def test_pointmatch_jpg_fuzzy_markers(ref_dir):
    img = sample_image(ref_dir, "pointmatch.jpg")
    mask = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.45))
    truth = _centroids(mask, min_area=4)
    assert len(truth) >= 3
    out = match_points(mask, truth[0], sample_radius=8, max_point_size=32)
    assert len(out) >= 1
    recall, fp_rate, mean_d = _greedy_match(out, truth, cutoff=2.5)
    assert recall > 0.0
    assert mean_d <= 2.5
    assert_not_worse("point_match.pointmatch_jpg.recall", recall, lower_is_better=False)
    assert_not_worse("point_match.pointmatch_jpg.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse("point_match.pointmatch_jpg.centroid_px", mean_d, lower_is_better=True)
```

- [ ] **Step 6: Run reference tests**

Run: `cd backend && .venv/bin/pytest tests/reference/test_point_match_reference.py -v`

Expected (corpus present): FAIL first on missing baseline keys or on a gate; after implementation from Step 3, hard gates on `pointplot.bmp` PASS (recall ≥ 0.95, fp_rate ≤ 0.02, centroid ≤ 1.5 px). Then run `cd backend && .venv/bin/pytest tests/reference/test_point_match_reference.py tests/test_point_match.py -v --update-baselines` to record achieved values. Re-run without `--update-baselines` and expect PASS.

Expected (corpus absent): SKIP via `@pytest.mark.reference` / Phase 0 conftest. Synthetic tests in `tests/test_point_match.py` still cover the same behaviours.

If a `pointplot.bmp` gate cannot be met, stop and report evidence (filter mask F1, n_truth, n_candidates, a few sample distances). Do not silently loosen 0.95 / 2% / 1.5 px.

- [ ] **Step 7: Commit**

```bash
git add backend/app/cv/point_match.py backend/tests/test_point_match.py backend/tests/reference/test_point_match_reference.py backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
feat: add OpenCV template point-match for scatter markers

EOF
)"
```

---

### Task 2: Point match API and accept/reject UI

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/pipeline/pipeline.py`
- Modify: `backend/app/api/sessions.py`
- Modify: `backend/tests/test_point_match.py` (append API tests)
- Create: `frontend/src/lib/pointMatch.ts`
- Create: `frontend/src/lib/__tests__/pointMatch.test.ts`
- Create: `frontend/src/components/CandidateOverlay.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/EditorCanvas.tsx`
- Modify: `frontend/src/components/AutoDigitizePanel.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `match_points(...)` from Task 1; `build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray`; `session_store.push_history(stored, action)`; Phase 1 `CanvasMode` (already the six-value union including `'point-match'`; implement the handler, do not redeclare or narrow the type or the backend `canvas_mode` Literal); Phase 3 `AutoDigitizePanel`
- Produces:
  - `WorkspaceState.max_point_size: int = 48`
  - `PointMatchRequest(pixel: tuple[float, float], sample_radius: int | None = None, max_point_size: int | None = None)`
  - `MatchCandidateOut(pixel: tuple[float, float], score: float)`
  - `PointMatchResponse(candidates: list[MatchCandidateOut])`
  - `PointMatchAcceptRequest(pixels: list[tuple[float, float]])`
  - `POST /sessions/{session_id}/curves/{curve_id}/point-match` → `{candidates: MatchCandidate[]}` (non-mutating, no undo)
  - `POST /sessions/{session_id}/curves/{curve_id}/point-match/accept` → `SessionPublic` (undo action `"point_match_accept"`)
  - `run_point_match(session, image_bytes, curve_id, sample_center, sample_radius, max_point_size, exclude=None, limit=200) -> list[MatchCandidate]`
  - `run_point_match_accept(session, curve_id, pixels) -> Session`
  - `reducePointMatch(state, action) -> PointMatchState`
  - `partitionByScore(candidates, threshold) -> {atOrAbove, below}`
  - `ringRadiusFromScore(score, isCurrent) -> number`
  - Client: `pointMatch(id, curveId, body) -> {candidates: MatchCandidate[]}`, `pointMatchAccept(id, curveId, pixels) -> Session`

When `sample_radius` is omitted, the API uses `max(2, max_point_size // 2)`. When `max_point_size` is omitted, it uses `session.workspace.max_point_size` if set, else `48`. Exclude pixels are the curve's already-placed `Point.pixel` values.

- [ ] **Step 1: Write the failing API tests**

Append to `backend/tests/test_point_match.py`:

```python
import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.models.schemas import WorkspaceState

client = TestClient(app)


def _session_with_dots() -> str:
    img = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(img)
    for xy in [(40, 40), (100, 40), (160, 40)]:
        draw.ellipse((xy[0] - 5, xy[1] - 5, xy[0] + 5, xy[1] + 5), fill=(0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("dots.png", buf.getvalue(), "image/png")})
    assert res.status_code == 200
    sid = res.json()["id"]
    patch = client.patch(
        f"/sessions/{sid}/curves",
        json={"curves": [{"label": "Scatter", "color": "#2563eb", "style": "unknown", "visible": True, "points": []}]},
    )
    assert patch.status_code == 200
    return sid, patch.json()["curves"][0]["id"]


def test_point_match_is_non_mutating():
    sid, cid = _session_with_dots()
    before = client.get(f"/sessions/{sid}").json()
    res = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match",
        json={"pixel": [40.0, 40.0], "sample_radius": 6, "max_point_size": 24},
    )
    assert res.status_code == 200
    body = res.json()
    assert "candidates" in body
    assert len(body["candidates"]) >= 2
    assert "pixel" in body["candidates"][0]
    assert "score" in body["candidates"][0]
    scores = [c["score"] for c in body["candidates"]]
    assert scores == sorted(scores, reverse=True)
    after = client.get(f"/sessions/{sid}").json()
    assert after["curves"][0]["points"] == before["curves"][0]["points"]
    assert after["history"] == before["history"]


def test_point_match_accept_appends_and_undoes():
    sid, cid = _session_with_dots()
    found = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match",
        json={"pixel": [40.0, 40.0], "max_point_size": 24},
    )
    pixels = [c["pixel"] for c in found.json()["candidates"][:2]]
    acc = client.post(
        f"/sessions/{sid}/curves/{cid}/point-match/accept",
        json={"pixels": pixels},
    )
    assert acc.status_code == 200
    points = acc.json()["curves"][0]["points"]
    assert len(points) == 2
    assert all(p["origin"] == "ai" for p in points)
    assert acc.json()["history"][-1]["action"] == "point_match_accept"
    undone = client.post(f"/sessions/{sid}/undo")
    assert undone.status_code == 200
    assert undone.json()["curves"][0]["points"] == []


def test_workspace_max_point_size_default():
    ws = WorkspaceState()
    assert ws.max_point_size == 48


def test_point_match_unknown_curve_is_400():
    sid, _cid = _session_with_dots()
    res = client.post(
        f"/sessions/{sid}/curves/not-a-curve/point-match",
        json={"pixel": [40.0, 40.0]},
    )
    assert res.status_code == 400
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py -v`

Expected: FAIL with `Failed: assert 404 == 200` (route missing) or `pydantic_core.ValidationError` (`WorkspaceState` has no `max_point_size`), and `ImportError` is gone from Task 1 tests.

- [ ] **Step 3: Write backend schema, pipeline, and routes**

In `backend/app/models/schemas.py`, add the models and the workspace field (keep every existing `WorkspaceState` field; only add `max_point_size`). Do not restate or narrow `canvas_mode` — Phase 1 already shipped the six-value Literal matching frontend `CanvasMode`.

```python
class MatchCandidateOut(BaseModel):
    pixel: tuple[float, float]
    score: float


class PointMatchRequest(BaseModel):
    pixel: tuple[float, float]
    sample_radius: int | None = None
    max_point_size: int | None = None


class PointMatchResponse(BaseModel):
    candidates: list[MatchCandidateOut]


class PointMatchAcceptRequest(BaseModel):
    pixels: list[tuple[float, float]]
```

On `WorkspaceState`:

```python
max_point_size: int = Field(default=48, ge=3, le=256)
```

In `backend/app/pipeline/pipeline.py` add:

```python
from app.cv.point_match import MatchCandidate, match_points


def run_point_match(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    sample_center: tuple[float, float],
    sample_radius: int,
    max_point_size: int = 48,
    exclude: list[tuple[float, float]] | None = None,
    limit: int = 200,
) -> list[MatchCandidate]:
    curve = _require_curve(session, curve_id)
    mask = build_curve_mask(session, image_bytes, curve_id)
    blocked = list(exclude) if exclude is not None else [tuple(p.pixel) for p in curve.points]
    return match_points(
        mask,
        sample_center,
        sample_radius,
        max_point_size=max_point_size,
        exclude=blocked,
        limit=limit,
    )


def run_point_match_accept(
    session: Session,
    curve_id: str,
    pixels: list[tuple[float, float]],
) -> Session:
    curve = _require_curve(session, curve_id)
    new_points = list(curve.points)
    seen = {(round(p.pixel[0], 3), round(p.pixel[1], 3)) for p in curve.points}
    for xy in pixels:
        key = (round(float(xy[0]), 3), round(float(xy[1]), 3))
        if key in seen:
            continue
        new_points.append(Point(pixel=(float(xy[0]), float(xy[1])), origin="ai"))
        seen.add(key)
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session
```

Do not reimplement colour filtering inside `run_point_match`. Pass the route's encoded `image_bytes` straight into `build_curve_mask`; do not `cv2.imdecode` first.

In `backend/app/api/sessions.py` import the new models and pipeline functions, then add:

```python
@router.post("/{session_id}/curves/{curve_id}/point-match", response_model=PointMatchResponse)
def point_match_curve(session_id: str, curve_id: str, body: PointMatchRequest) -> PointMatchResponse:
    stored = _require(session_id)
    try:
        ws = stored.session.workspace
        max_point_size = body.max_point_size if body.max_point_size is not None else (
            ws.max_point_size if ws is not None else 48
        )
        sample_radius = (
            body.sample_radius
            if body.sample_radius is not None
            else max(2, int(max_point_size) // 2)
        )
        candidates = run_point_match(
            stored.session,
            stored.image_bytes,
            curve_id,
            (float(body.pixel[0]), float(body.pixel[1])),
            sample_radius,
            max_point_size=int(max_point_size),
        )
    except ValueError as exc:
        raise _error(exc, "point_match_input", str(exc)) from exc
    return PointMatchResponse(
        candidates=[MatchCandidateOut(pixel=c.pixel, score=c.score) for c in candidates]
    )


@router.post(
    "/{session_id}/curves/{curve_id}/point-match/accept",
    response_model=SessionPublic,
)
def point_match_accept(
    session_id: str, curve_id: str, body: PointMatchAcceptRequest
) -> SessionPublic:
    stored = _require(session_id)
    try:
        session_store.push_history(stored, "point_match_accept")
        stored.session = run_point_match_accept(stored.session, curve_id, body.pixels)
        session_store.update(session_id, stored.session)
    except ValueError as exc:
        raise _error(exc, "point_match_accept", str(exc)) from exc
    return _to_public(stored)
```

- [ ] **Step 4: Run API tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py -v`

Expected: PASS. `test_point_match_is_non_mutating` must show unchanged `points` and `history` after GET-style POST.

- [ ] **Step 5: Write the failing frontend helper tests**

Create `frontend/src/lib/pointMatch.ts`:

```ts
export type MatchCandidate = { pixel: [number, number]; score: number }

export type PointMatchState = {
  candidates: MatchCandidate[]
  accepted: MatchCandidate[]
  rejected: MatchCandidate[]
}

export type PointMatchAction =
  | { type: 'set-candidates'; candidates: MatchCandidate[] }
  | { type: 'accept-current' }
  | { type: 'reject-current' }
  | { type: 'accept-at-or-above' }
  | { type: 'clear' }

export const emptyPointMatch: PointMatchState = {
  candidates: [],
  accepted: [],
  rejected: [],
}

export function partitionByScore(
  candidates: MatchCandidate[],
  threshold: number,
): { atOrAbove: MatchCandidate[]; below: MatchCandidate[] } {
  const atOrAbove: MatchCandidate[] = []
  const below: MatchCandidate[] = []
  for (const c of candidates) {
    if (c.score >= threshold) atOrAbove.push(c)
    else below.push(c)
  }
  return { atOrAbove, below }
}

export function ringRadiusFromScore(score: number, isCurrent: boolean): number {
  const clamped = Math.min(1, Math.max(0, score))
  const base = 6 + (1 - clamped) * 10
  return isCurrent ? base + 4 : base
}

export function reducePointMatch(
  state: PointMatchState,
  action: PointMatchAction,
): PointMatchState {
  if (action.type === 'clear') return emptyPointMatch
  if (action.type === 'set-candidates') {
    const ranked = [...action.candidates].sort((a, b) => b.score - a.score)
    return { ...state, candidates: ranked }
  }
  const current = state.candidates[0]
  if (!current) return state
  if (action.type === 'accept-current') {
    return {
      accepted: [...state.accepted, current],
      rejected: state.rejected,
      candidates: state.candidates.slice(1),
    }
  }
  if (action.type === 'reject-current') {
    return {
      accepted: state.accepted,
      rejected: [...state.rejected, current],
      candidates: state.candidates.slice(1),
    }
  }
  const { atOrAbove, below } = partitionByScore(state.candidates, current.score)
  return {
    accepted: [...state.accepted, ...atOrAbove],
    rejected: state.rejected,
    candidates: below,
  }
}

export function pointMatchKeyAction(
  key: string,
  shiftKey: boolean,
): PointMatchAction | null {
  if (key === 'Enter' && shiftKey) return { type: 'accept-at-or-above' }
  if (key === 'Enter') return { type: 'accept-current' }
  if (key === 'Escape') return { type: 'reject-current' }
  return null
}
```

Create `frontend/src/lib/__tests__/pointMatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  emptyPointMatch,
  partitionByScore,
  pointMatchKeyAction,
  reducePointMatch,
  ringRadiusFromScore,
  type MatchCandidate,
} from '../pointMatch'

const A: MatchCandidate = { pixel: [1, 1], score: 0.95 }
const B: MatchCandidate = { pixel: [2, 2], score: 0.80 }
const C: MatchCandidate = { pixel: [3, 3], score: 0.40 }

describe('partitionByScore', () => {
  it('splits on the current score', () => {
    const { atOrAbove, below } = partitionByScore([A, B, C], 0.8)
    expect(atOrAbove).toEqual([A, B])
    expect(below).toEqual([C])
  })
})

describe('ringRadiusFromScore', () => {
  it('gives the current candidate a larger ring and high scores a tighter ring', () => {
    const high = ringRadiusFromScore(0.99, false)
    const low = ringRadiusFromScore(0.2, false)
    const current = ringRadiusFromScore(0.99, true)
    expect(high).toBeLessThan(low)
    expect(current).toBeGreaterThan(high)
  })
})

describe('reducePointMatch', () => {
  it('accepts, rejects, and shift-accepts from the ranked list', () => {
    let s = reducePointMatch(emptyPointMatch, { type: 'set-candidates', candidates: [C, A, B] })
    expect(s.candidates.map((c) => c.score)).toEqual([0.95, 0.8, 0.4])
    s = reducePointMatch(s, { type: 'accept-current' })
    expect(s.accepted).toEqual([A])
    expect(s.candidates[0]).toEqual(B)
    s = reducePointMatch(s, { type: 'reject-current' })
    expect(s.rejected).toEqual([B])
    s = reducePointMatch(s, {
      type: 'set-candidates',
      candidates: [A, B, C],
    })
    s = reducePointMatch(s, { type: 'accept-at-or-above' })
    expect(s.accepted.map((c) => c.score)).toContain(0.95)
    expect(s.candidates.every((c) => c.score < 0.95)).toBe(true)
  })
})

describe('pointMatchKeyAction', () => {
  it('maps Enter / Esc / Shift+Enter', () => {
    expect(pointMatchKeyAction('Enter', false)).toEqual({ type: 'accept-current' })
    expect(pointMatchKeyAction('Enter', true)).toEqual({ type: 'accept-at-or-above' })
    expect(pointMatchKeyAction('Escape', false)).toEqual({ type: 'reject-current' })
    expect(pointMatchKeyAction('a', false)).toBeNull()
  })
})
```

- [ ] **Step 6: Run frontend tests to verify they fail**

Run: `cd frontend && npm test`

Expected: FAIL with `Cannot find module '../pointMatch'`. Then add `pointMatch.ts` (Step 5's implementation already listed above — write the test file first, run, then save the implementation). Re-run: PASS.

- [ ] **Step 7: Add types, client, overlay, canvas mode, panel, and App wiring**

In `frontend/src/types.ts` add (do not remove existing fields):

`CanvasMode` is already defined once in `frontend/src/types.ts` by Phase 1 as the full six-value union `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`, and the backend `WorkspaceState.canvas_mode` is the same six-value Literal. Phase 4 must not redeclare or narrow either; it only implements the `'point-match'` value (which is already present in the union but has no handler yet).

```ts
export interface MatchCandidate {
  pixel: [number, number]
  score: number
}

export interface WorkspaceState {
  active_curve_id?: string | null
  resample_count?: number
  unskew_mode?: 'perspective' | 'mesh'
  mesh?: MeshGridPayload | null
  canvas_mode?: CanvasMode
  show_mask?: boolean
  show_axes_checker?: boolean
  point_separation?: number
  min_segment_length?: number
  fill_corners?: boolean
  max_point_size?: number
  grid?: unknown
}
```

Keep other `WorkspaceState` keys Phase 1–3 already added; the required new key for this task is `max_point_size`. Do not restate or narrow `canvas_mode` — Phase 1 already typed it as the six-value `CanvasMode` union (backend: the matching Literal).

In `frontend/src/api/client.ts` add:

```ts
import type { MatchCandidate, Session } from '../types'

export async function pointMatch(
  id: string,
  curveId: string,
  body: { pixel: [number, number]; sample_radius?: number; max_point_size?: number },
): Promise<{ candidates: MatchCandidate[] }> {
  return request<{ candidates: MatchCandidate[] }>(
    `/sessions/${id}/curves/${curveId}/point-match`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export async function pointMatchAccept(
  id: string,
  curveId: string,
  pixels: [number, number][],
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/point-match/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pixels }),
  })
}
```

Create `frontend/src/components/CandidateOverlay.tsx`:

```tsx
import { Circle, Group, Text } from 'react-konva'
import type { MatchCandidate } from '../types'
import { ringRadiusFromScore } from '../lib/pointMatch'

interface Props {
  candidates: MatchCandidate[]
  scale: number
  toDisplay: (pixel: [number, number]) => [number, number]
}

export function CandidateOverlay({ candidates, scale, toDisplay }: Props) {
  return (
    <>
      {candidates.map((cand, i) => {
        const [x, y] = toDisplay(cand.pixel)
        const isCurrent = i === 0
        const r = ringRadiusFromScore(cand.score, isCurrent) / scale
        return (
          <Group key={`${cand.pixel[0]}-${cand.pixel[1]}-${i}`} x={x} y={y} listening={false}>
            <Circle
              radius={r}
              stroke={isCurrent ? '#fbbf24' : '#38bdf8'}
              strokeWidth={(isCurrent ? 3 : 1.5) / scale}
              fill={isCurrent ? 'rgba(251, 191, 36, 0.12)' : 'transparent'}
            />
            {isCurrent && (
              <Text
                x={r + 2 / scale}
                y={-6 / scale}
                text={`${cand.score.toFixed(2)}`}
                fontSize={11 / scale}
                fill="#fbbf24"
              />
            )}
          </Group>
        )
      })}
    </>
  )
}
```

Modify `frontend/src/components/EditorCanvas.tsx`:

1. Import `CandidateOverlay` and the existing Phase 1 `CanvasMode` plus `MatchCandidate`. Do not redeclare `CanvasMode`. Phase 1 already typed `EditorCanvas` with `canvasMode: CanvasMode`.
2. Add props:

```ts
canvasMode: CanvasMode
candidates?: MatchCandidate[]
onPointMatchSample: (pixel: [number, number]) => void
onPointMatchAcceptCurrent: () => void
onPointMatchRejectCurrent: () => void
```

4. In `handleStageMouseDown`, after the axis-place branch:

```ts
    if (canvasMode === 'point-match') {
      const original = toOriginalCoords([x, y])
      if (e.evt.button === 2) {
        onPointMatchRejectCurrent()
        setStageDraggable(false)
        return
      }
      if ((candidates?.length ?? 0) > 0) {
        onPointMatchAcceptCurrent()
      } else {
        onPointMatchSample(original)
      }
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'place' && placementCurveId) {
      onAddPoint(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
```

5. On `Stage`, prevent the browser menu and reject on right-click:

```tsx
        onContextMenu={(e) => {
          e.evt.preventDefault()
          if (canvasMode === 'point-match') onPointMatchRejectCurrent()
        }}
```

6. Inside the `Layer`, after curve points, render:

```tsx
          {canvasMode === 'point-match' && (candidates?.length ?? 0) > 0 && (
            <CandidateOverlay
              candidates={candidates!}
              scale={totalScale}
              toDisplay={toDisplayCoords}
            />
          )}
```

7. Extend `PlotInteractionHint` with `canvasMode === 'point-match'`:

```ts
  } else if (canvasMode === 'point-match') {
    text = `Click a sample marker, then Enter/click accept · Esc/right-click reject · Shift+Enter accept all at/above current score · ${panHint}`
```

Modify `frontend/src/components/AutoDigitizePanel.tsx` — add these props and controls without removing Phase 3 segment-fill controls:

```tsx
  maxPointSize: number
  onMaxPointSizeChange: (n: number) => void
  canvasMode: CanvasMode
  onCanvasModeChange: (mode: CanvasMode) => void
  acceptedCount: number
  onApplyAccepted: () => void
  onClearCandidates: () => void
```

Insert this block after the existing fill-corners checkbox:

```tsx
      <label className="mt-2 flex items-center gap-1 text-[11px] text-slate-300">
        Max point size
        <input
          type="number"
          min={3}
          max={256}
          value={maxPointSize}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onMaxPointSizeChange(Math.min(256, Math.max(3, Math.round(n))))
          }}
          className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
        />
        px
      </label>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onCanvasModeChange(canvasMode === 'point-match' ? 'select' : 'point-match')
          }
          className={`rounded px-2 py-1 text-[11px] ${
            canvasMode === 'point-match' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          Point match
        </button>
        <button
          type="button"
          disabled={busy || acceptedCount === 0}
          onClick={onApplyAccepted}
          className="rounded bg-emerald-700 px-2 py-1 text-[11px] hover:bg-emerald-600 disabled:opacity-50"
        >
          Apply accepted ({acceptedCount})
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClearCandidates}
          className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500"
        >
          New sample
        </button>
      </div>
```

Modify `frontend/src/App.tsx`:

1. Import `pointMatch`, `pointMatchAccept`, `reducePointMatch`, `emptyPointMatch`, `pointMatchKeyAction`.
2. Add state:

Reuse the existing Phase 1 `canvasMode` / `setCanvasMode` state (already the six-value union, including `'point-match'`). Do not redeclare `CanvasMode`. Add only:

```tsx
  const [pointMatchState, setPointMatchState] = useState(emptyPointMatch)
```

3. Handlers (`handlePointMatchSample` calls `pointMatch` directly because it does not return a new `Session`):

```tsx
  const activePointMatchCurveId = activeCurveId ?? placementCurveId

  const handlePointMatchSample = (pixel: [number, number]) => {
    if (!session || !activePointMatchCurveId) return
    const maxSize = session.workspace?.max_point_size ?? 48
    setBusy(true)
    setBusyMessage('Matching points…')
    pointMatch(session.id, activePointMatchCurveId, { pixel, max_point_size: maxSize })
      .then(({ candidates }) => {
        setPointMatchState((s) => reducePointMatch(s, { type: 'set-candidates', candidates }))
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Point match failed'))
      .finally(() => {
        setBusy(false)
        setBusyMessage(null)
      })
  }

  const handlePointMatchApply = () => {
    if (!session || !activePointMatchCurveId || pointMatchState.accepted.length === 0) return
    const pixels = pointMatchState.accepted.map((c) => c.pixel)
    void run(async () => {
      const s = await pointMatchAccept(session.id, activePointMatchCurveId, pixels)
      setPointMatchState(emptyPointMatch)
      setCanvasMode('select')
      return s
    }, 'Accepting points…')
  }
```

4. Keyboard (spec §9):

```tsx
  useEffect(() => {
    if (canvasMode !== 'point-match') return
    const onKey = (e: KeyboardEvent) => {
      const action = pointMatchKeyAction(e.key, e.shiftKey)
      if (!action) return
      e.preventDefault()
      setPointMatchState((s) => reducePointMatch(s, action))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvasMode])
```

5. Pass `canvasMode`, `candidates={pointMatchState.candidates}`, and the three callbacks into `EditorCanvas`. Pass the new props into `AutoDigitizePanel`. Include `max_point_size` in the workspace object inside `saveWorkspaceQuiet`:

```ts
        max_point_size: session?.workspace?.max_point_size ?? 48,
```

and when the panel changes max size, `savePreferencesQuiet({ workspace: { ...(session.workspace ?? {}), max_point_size: n } })`.

6. Leaving point-match mode (`onCanvasModeChange('select')`) must call `setPointMatchState(emptyPointMatch)` without POSTing accept (user must click Apply).

- [ ] **Step 8: Run backend + frontend tests**

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py -v`

Expected: PASS.

Run: `cd frontend && npm test`

Expected: PASS for `pointMatch.test.ts`. No component/render tests.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/schemas.py backend/app/pipeline/pipeline.py backend/app/api/sessions.py backend/tests/test_point_match.py frontend/src/lib/pointMatch.ts frontend/src/lib/__tests__/pointMatch.test.ts frontend/src/components/CandidateOverlay.tsx frontend/src/components/EditorCanvas.tsx frontend/src/components/AutoDigitizePanel.tsx frontend/src/types.ts frontend/src/api/client.ts frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add point-match API and accept/reject canvas UX

EOF
)"
```

---

### Task 3: Scatter curves

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/pipeline/pipeline.py`
- Modify: `backend/app/export/export.py`
- Modify: `backend/tests/test_export.py`
- Modify: `backend/tests/test_project.py`
- Create: `frontend/src/lib/previewChart.ts`
- Create: `frontend/src/lib/__tests__/previewChart.test.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/PreviewChart.tsx`
- Modify: `frontend/src/components/EditorCanvas.tsx`
- Modify: `frontend/src/components/CurveList.tsx`

**Interfaces:**
- Consumes: `Curve` as it exists after Phase 2 (`filter` optional); `SessionPublic`; `export_project_json` / `load_project_from_text`; `export_csv`
- Produces:
  - `ConnectAs = Literal["line", "scatter"]`
  - `Curve.connect_as: ConnectAs = "line"`
  - `connectAsToPlotlyMode(connectAs: ConnectAs | undefined): 'lines+markers' | 'markers'`
  - Improve (`run_cv_improve`) and Densify (`run_resample`) raise `ValueError` matching `scatter` when `curve.connect_as == "scatter"`
  - `export_csv` writes scatter points in list/placement order (never x-sorted)

- [ ] **Step 1: Write the failing schema, export-order, and improve tests**

Append to `backend/tests/test_export.py`:

```python
from app.models.schemas import Curve, Point, SessionPublic
from app.export.project_io import load_project_from_text
from app.export.export import export_csv, export_json
from app.pipeline.pipeline import run_cv_improve, run_resample


def test_connect_as_defaults_to_line():
    c = Curve(label="A")
    assert c.connect_as == "line"


def test_connect_as_roundtrip_session_public_and_project():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    public = SessionPublic(
        id="s",
        image_meta=session.image_meta,
        image_source=session.image_source,
        calibration=session.calibration,
        manual_calibration=True,
        curves=session.curves,
        workspace=session.workspace,
        history=[],
        image_url="/x",
    )
    assert public.curves[0].connect_as == "scatter"
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.curves[0].connect_as == "scatter"


def test_scatter_export_keeps_placement_order():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    session.curves[0].points = [
        Point(pixel=(80.0, 50.0), origin="user"),
        Point(pixel=(20.0, 50.0), origin="user"),
        Point(pixel=(50.0, 50.0), origin="user"),
    ]
    rows = [ln for ln in export_csv(session).splitlines() if ln and not ln.startswith("#")]
    data = rows[1:]
    xs = [float(r.split(",")[2]) for r in data]
    assert xs[0] > xs[1]
    assert xs[1] < xs[2]


def test_improve_and_resample_reject_scatter():
    session = _session_ready()
    session.curves[0].connect_as = "scatter"
    session.curves[0].points = [
        Point(pixel=(20.0, 50.0), origin="user"),
        Point(pixel=(80.0, 50.0), origin="user"),
    ]
    with pytest.raises(ValueError, match="scatter"):
        run_cv_improve(session, TINY_PNG_BYTES, session.curves[0].id)
    with pytest.raises(ValueError, match="scatter"):
        run_resample(session, TINY_PNG_BYTES, session.curves[0].id, 12)
```

Create `frontend/src/lib/__tests__/previewChart.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { connectAsToPlotlyMode } from '../previewChart'

describe('connectAsToPlotlyMode', () => {
  it('uses markers only for scatter and lines+markers for line/default', () => {
    expect(connectAsToPlotlyMode('scatter')).toBe('markers')
    expect(connectAsToPlotlyMode('line')).toBe('lines+markers')
    expect(connectAsToPlotlyMode(undefined)).toBe('lines+markers')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_export.py::test_connect_as_defaults_to_line tests/test_export.py::test_connect_as_roundtrip_session_public_and_project tests/test_export.py::test_scatter_export_keeps_placement_order tests/test_export.py::test_improve_and_resample_reject_scatter -v`

Expected: FAIL with `AttributeError: 'Curve' object has no attribute 'connect_as'`.

Run: `cd frontend && npm test`

Expected: FAIL with `Cannot find module '../previewChart'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/models/schemas.py`:

```python
ConnectAs = Literal["line", "scatter"]
```

On `Curve`, after existing fields:

```python
    connect_as: ConnectAs = "line"
```

In `backend/app/pipeline/pipeline.py`, at the top of `run_cv_improve` and `run_resample` after `_require_curve`:

```python
    if curve.connect_as == "scatter":
        raise ValueError("Improve is not applicable to scatter curves")
```

and for resample:

```python
    if curve.connect_as == "scatter":
        raise ValueError("Densify is not applicable to scatter curves")
```

`export_csv` already walks `curve.points` in list order. Do **not** sort by x. Leave the writer loop as:

```python
    writer.writerow(["curve_id", "curve_label", "x", "y"])
    for curve in session.curves:
        if not curve.visible:
            continue
        for p in curve.points:
            x, y = pixel_to_data(session.calibration, p.pixel)
            writer.writerow([curve.id, curve.label, x, y])
```

(`pixel_to_data` must remain the Phase 1 coords adapter.) Task 4 will change the header row; this task must not x-sort.

Create `frontend/src/lib/previewChart.ts`:

```ts
import type { ConnectAs } from '../types'

export function connectAsToPlotlyMode(
  connectAs: ConnectAs | undefined,
): 'lines+markers' | 'markers' {
  return connectAs === 'scatter' ? 'markers' : 'lines+markers'
}
```

In `frontend/src/types.ts`:

```ts
export type ConnectAs = 'line' | 'scatter'

export interface Curve {
  id: string
  label: string
  color: string
  trace_color?: string | null
  style: CurveStyle
  visible: boolean
  target_point_count?: number
  points: Point[]
  filter?: ColorFilter | null
  connect_as?: ConnectAs
}
```

Phase 2 already declared `ColorFilter` on `Curve`. Add `connect_as` only.

In `frontend/src/components/PreviewChart.tsx`, import `connectAsToPlotlyMode` and in `buildTraces` set:

```ts
        mode: connectAsToPlotlyMode(curve.connect_as),
```

instead of `'lines+markers'`.

In `frontend/src/components/EditorCanvas.tsx`, import `Line` from `react-konva`. Immediately before each curve's points map, draw a polyline only for line curves:

```tsx
          {curves.map((curve) => {
            if (!curve.visible) return null
            const pts = curve.points.map((pt) => displayPixel(pt)).flat()
            const isScatter = curve.connect_as === 'scatter'
            return (
              <Group key={curve.id}>
                {!isScatter && pts.length >= 4 && (
                  <Line
                    points={pts}
                    stroke={curve.color}
                    strokeWidth={1.5 / totalScale}
                    lineJoin="round"
                    lineCap="round"
                    listening={false}
                  />
                )}
                {curve.points.map((pt) => {
                  const [px, py] = displayPixel(pt)
                  return (
                    <DraggablePoint
                      key={pt.id}
                      x={px}
                      y={py}
                      point={pt}
                      color={curve.color}
                      selected={selectedSet.has(pt.id)}
                      scale={totalScale}
                      onPointerDown={(e) => handlePointPointerDown(pt, e)}
                      onDragStart={() => {
                        setStageDraggable(false)
                        prepareGroupDrag(pt)
                      }}
                      onDragMove={(e) => movePointDrag(pt, e)}
                      onDragEnd={(e) => endPointDrag(pt, e)}
                      onDelete={() => onDeletePoint(pt.id)}
                    />
                  )
                })}
              </Group>
            )
          })}
```

Replace the current `curves.map` that only returns `DraggablePoint`s with this block. `displayPixel` stays the existing helper.

In `frontend/src/components/CurveList.tsx`, new curves get `connect_as: 'line'`. Add a selector and disable Improve/Densify:

```tsx
              <label className="flex items-center gap-1 text-slate-300">
                Draw
                <select
                  value={curve.connect_as ?? 'line'}
                  onChange={(e) =>
                    updateCurve(curve.id, {
                      connect_as: e.target.value === 'scatter' ? 'scatter' : 'line',
                    })
                  }
                  className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                >
                  <option value="line">Line</option>
                  <option value="scatter">Scatter</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy || curve.points.length < 2 || curve.connect_as === 'scatter'}
                title={
                  curve.connect_as === 'scatter'
                    ? 'Densify is not applicable to scatter curves'
                    : 'Interpolate evenly spaced points along the curve'
                }
                className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onResample(curve.id)}
              >
                Densify
              </button>
              <button
                type="button"
                disabled={busy || !canImprove(curve) || curve.connect_as === 'scatter'}
                title={
                  curve.connect_as === 'scatter'
                    ? 'Improve is not applicable to scatter curves'
                    : canImprove(curve)
                      ? 'Trace the line in the corridor defined by your points (OpenCV)'
                      : 'Place at least 2 points on this curve first'
                }
                className="rounded bg-sky-700 px-2 py-1 text-[11px] hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onImprove(curve.id)}
              >
                Improve
              </button>
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_export.py tests/test_project.py -v`

Expected: PASS, including the original cartesian CSV test (`curve_label` still present).

Run: `cd frontend && npm test`

Expected: PASS including `previewChart.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/app/pipeline/pipeline.py backend/app/export/export.py backend/tests/test_export.py backend/tests/test_project.py frontend/src/lib/previewChart.ts frontend/src/lib/__tests__/previewChart.test.ts frontend/src/types.ts frontend/src/components/PreviewChart.tsx frontend/src/components/EditorCanvas.tsx frontend/src/components/CurveList.tsx
git commit -m "$(cat <<'EOF'
feat: add scatter connect_as for preview, canvas, and export

EOF
)"
```

---

### Task 4: Polar and map preview and export

**Files:**
- Modify: `backend/app/export/export.py`
- Modify: `backend/app/export/import_curves.py`
- Do not modify: `backend/app/export/project_io.py` (`model_dump()` already persists new Calibration/Curve fields)
- Modify: `backend/tests/test_export.py`
- Modify: `backend/tests/test_import.py`
- Modify: `backend/tests/test_project.py`
- Modify: `frontend/src/lib/previewChart.ts`
- Modify: `frontend/src/lib/__tests__/previewChart.test.ts`
- Modify: `frontend/src/components/PreviewChart.tsx`

**Interfaces:**
- Consumes: Phase 1 `pixel_to_data(cal, pixel) -> tuple[float, float]`; `Calibration.coords_type`, `theta_units`, `origin_radius`, `scale_bar`; Task 3 `connectAsToPlotlyMode`, `Curve.connect_as`
- Produces:
  - `csv_coordinate_columns(cal: Calibration) -> tuple[str, str]` — `("x", "y")` cartesian/map, `("theta", "R")` polar
  - `csv_units_line(cal: Calibration) -> str | None` — `"# units: {units}"` when `coords_type == "map"` and `scale_bar.units` is non-empty, else `None`
  - Cartesian CSV first data header remains exactly `curve_id,curve_label,x,y`
  - Polar CSV first data header exactly `curve_id,curve_label,theta,R`
  - Map CSV: optional units comment then `curve_id,curve_label,x,y`
  - `import_curves_from_text` accepts polar columns `theta`,`R` (any case) and skips lines starting with `#`
  - `buildPreviewConfig(curves, calibration, height) -> { traces, layout }`
    - cartesian/map: Plotly `scatter` traces, x/y titles (map title includes units)
    - polar: Plotly `scatterpolar` traces; theta in `theta_units` (gradians/turns converted to degrees for Plotly); radial axis `log` when `calibration.y.scale === 'log'`; `radialaxis.range[0] === origin_radius` when `origin_radius !== 0`

- [ ] **Step 1: Write the failing export/import/project/preview tests**

Append to `backend/tests/test_export.py`:

```python
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    ScaleBar,
)


def _polar_cal() -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(180.0, 100.0), x_value=0.0, y_value=10.0),
            AxisPoint(pixel=(100.0, 20.0), x_value=90.0, y_value=10.0),
        ],
    )


def _map_cal() -> Calibration:
    return Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=ScaleBar(pixel_a=(0.0, 100.0), pixel_b=(100.0, 100.0), length=50.0, units="km"),
    )


def test_csv_headers_cartesian_unchanged():
    out = export_csv(_session_ready())
    header = [ln for ln in out.splitlines() if ln and not ln.startswith("#")][0]
    assert header == "curve_id,curve_label,x,y"


def test_csv_headers_and_values_polar():
    from app.calibration.coords import pixel_to_data

    session = _session_ready()
    session.calibration = _polar_cal()
    session.curves[0].points = [Point(pixel=(180.0, 100.0), origin="user")]
    out = export_csv(session)
    lines = [ln for ln in out.splitlines() if ln]
    assert lines[0] == "curve_id,curve_label,theta,R"
    theta, radius = pixel_to_data(session.calibration, (180.0, 100.0))
    parts = lines[1].split(",")
    assert abs(float(parts[2]) - theta) < 1e-9
    assert abs(float(parts[3]) - radius) < 1e-9


def test_csv_headers_and_values_map_includes_units():
    from app.calibration.coords import pixel_to_data

    session = _session_ready()
    session.calibration = _map_cal()
    session.curves[0].points = [Point(pixel=(50.0, 50.0), origin="user")]
    out = export_csv(session)
    lines = out.splitlines()
    assert lines[0] == "# units: km"
    assert lines[1] == "curve_id,curve_label,x,y"
    x, y = pixel_to_data(session.calibration, (50.0, 50.0))
    parts = lines[2].split(",")
    assert abs(float(parts[2]) - x) < 1e-9
    assert abs(float(parts[3]) - y) < 1e-9
```

Import `AxisPoint` and `ScaleBar` from `app.models.schemas` (Phase 1 names).

Append to `backend/tests/test_project.py`:

```python
def test_project_roundtrip_precision_fields():
    session = _session_ready()
    session.calibration.coords_type = "polar"
    session.calibration.theta_units = "radians"
    session.calibration.origin_radius = 1.5
    session.calibration.scale_bar = None
    session.curves[0].connect_as = "scatter"
    if session.curves[0].filter is None:
        from app.models.schemas import ColorFilter

        session.curves[0].filter = ColorFilter(mode="intensity", low=0.1, high=0.4)
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "polar"
    assert restored.calibration.theta_units == "radians"
    assert restored.calibration.origin_radius == 1.5
    assert restored.curves[0].connect_as == "scatter"
    assert restored.curves[0].filter is not None
    assert restored.curves[0].filter.low == 0.1
```

Also add a map variant in the same file:

```python
def test_project_roundtrip_map_scale_bar():
    from app.models.schemas import ScaleBar

    session = _session_ready()
    session.calibration.coords_type = "map"
    session.calibration.scale_bar = ScaleBar(
        pixel_a=(0.0, 10.0), pixel_b=(10.0, 10.0), length=5.0, units="m"
    )
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "map"
    assert restored.calibration.scale_bar is not None
    assert restored.calibration.scale_bar.length == 5.0
    assert restored.calibration.scale_bar.units == "m"
```

Append to `backend/tests/test_import.py`:

```python
_POLAR_CSV = """curve_id,curve_label,theta,R
c1,A,0.0,10.0
c1,A,90.0,10.0
"""

_MAP_CSV = """# units: km
curve_id,curve_label,x,y
c1,A,2.5,2.5
"""


def test_import_polar_csv_columns():
    import math

    from app.calibration.coords import data_to_pixel
    from app.models.schemas import AxisPoint

    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(180.0, 100.0), x_value=0.0, y_value=10.0),
            AxisPoint(pixel=(100.0, 20.0), x_value=90.0, y_value=10.0),
        ],
    )
    curves = import_curves_from_text(_POLAR_CSV, calibration=cal, filename="p.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 2
    exp0 = data_to_pixel(cal, (0.0, 10.0))
    exp1 = data_to_pixel(cal, (90.0, 10.0))
    p0, p1 = curves[0].points[0].pixel, curves[0].points[1].pixel
    assert math.hypot(p0[0] - exp0[0], p0[1] - exp0[1]) < 2.0
    assert math.hypot(p1[0] - exp1[0], p1[1] - exp1[1]) < 2.0


def test_import_map_csv_skips_units_comment():
    session = _session_ready()
    curves = import_curves_from_text(_MAP_CSV, calibration=session.calibration, filename="m.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 1


def test_import_legacy_xy_csv_still_works():
    session = _session_ready()
    curves = import_curves_from_text(_LEGACY_CSV, calibration=session.calibration, filename="plot.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 2
```

Repeat the polar `Calibration` constructor in this file (do not import `_polar_cal` from `test_export.py`). `data_to_pixel` accepts `(theta, R)`.

Append to `frontend/src/lib/__tests__/previewChart.test.ts`:

```ts
import { buildPreviewConfig, connectAsToPlotlyMode } from '../previewChart'
import type { Calibration, Curve } from '../../types'

function cartesianCal(): Calibration {
  return {
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 0], value: 0 },
        { pixel: [100, 0], value: 10 },
      ],
    },
    y: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 100], value: 0 },
        { pixel: [0, 0], value: 10 },
      ],
    },
    source: 'manual',
    coords_type: 'cartesian',
  }
}

function polarCal(over: Partial<Calibration> = {}): Calibration {
  return {
    ...cartesianCal(),
    coords_type: 'polar',
    theta_units: 'degrees',
    origin_radius: 0,
    axis_points: [
      { id: 'a', pixel: [100, 100], x_value: 0, y_value: 0 },
      { id: 'b', pixel: [180, 100], x_value: 0, y_value: 10 },
      { id: 'c', pixel: [100, 20], x_value: 90, y_value: 10 },
    ],
    ...over,
  }
}

const curve: Curve = {
  id: 'c1',
  label: 'A',
  color: '#f00',
  style: 'unknown',
  visible: true,
  points: [{ id: 'p1', pixel: [180, 100], origin: 'user' }],
}

describe('buildPreviewConfig', () => {
  it('uses cartesian scatter traces by default', () => {
    const cfg = buildPreviewConfig([curve], cartesianCal(), 200)
    expect(cfg.traces[0].type).toBe('scatter')
    expect(cfg.traces[0].mode).toBe('lines+markers')
    expect(cfg.layout.xaxis.type).toBe('linear')
  })

  it('uses scatterpolar for polar sessions and respects origin_radius and log radius', () => {
    const cfg = buildPreviewConfig(
      [{ ...curve, connect_as: 'scatter' }],
      polarCal({ origin_radius: 2, y: { ...polarCal().y, scale: 'log' } }),
      200,
    )
    expect(cfg.traces[0].type).toBe('scatterpolar')
    expect(cfg.traces[0].mode).toBe('markers')
    expect(cfg.layout.polar.radialaxis.type).toBe('log')
    expect(cfg.layout.polar.radialaxis.range[0]).toBe(2)
  })

  it('labels map axes with scale-bar units', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      coords_type: 'map',
      scale_bar: {
        pixel_a: [0, 100],
        pixel_b: [100, 100],
        length: 50,
        units: 'km',
      },
    }
    const cfg = buildPreviewConfig([curve], cal, 200)
    expect(cfg.traces[0].type).toBe('scatter')
    expect(String(cfg.layout.xaxis.title)).toContain('km')
    expect(String(cfg.layout.yaxis.title)).toContain('km')
  })
})
```

Phase 1 already added `coords_type`, `theta_units`, `origin_radius`, `scale_bar`, and `axis_points` on the TypeScript `Calibration` type. Use those field names.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_export.py::test_csv_headers_cartesian_unchanged tests/test_export.py::test_csv_headers_and_values_polar tests/test_export.py::test_csv_headers_and_values_map_includes_units tests/test_project.py::test_project_roundtrip_precision_fields tests/test_project.py::test_project_roundtrip_map_scale_bar tests/test_import.py::test_import_polar_csv_columns tests/test_import.py::test_import_map_csv_skips_units_comment tests/test_import.py::test_import_legacy_xy_csv_still_works -v`

Expected: FAIL on polar header (`curve_id,curve_label,x,y` != `curve_id,curve_label,theta,R`) and/or missing `# units: km`.

Run: `cd frontend && npm test`

Expected: FAIL with `buildPreviewConfig is not a function` / cannot export.

- [ ] **Step 3: Write export, import, and preview-config implementation**

Replace `backend/app/export/export.py` with:

```python
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
```

Import `pixel_to_data` from `app.calibration.coords`.

Do not change `project_io.py`. `export_project_json` already persists via `calibration.model_dump()` and `curve.model_dump()`.

In `backend/app/export/import_curves.py`, change `_data_rows_from_csv` to:

```python
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
```

`_points_from_data` already calls `data_to_pixel(calibration, (pt["x"], pt["y"]))`. For polar, those numbers are `(theta, R)` — Phase 1's adapter handles that. Keep list order; do not special-case scatter beyond not inventing an x-sort (the existing `order_points_along_curve` may reorder import pixels along geometry — leave it; scatter export, not import, is what must stay placement-ordered).

Replace `frontend/src/lib/previewChart.ts` with this complete file (keep `connectAsToPlotlyMode` defined here so Task 3's vitest import still works):

```ts
import type { Calibration, ConnectAs, Curve, ThetaUnits } from '../types'
import { pixelToData } from './transform2d'

export function connectAsToPlotlyMode(
  connectAs: ConnectAs | undefined,
): 'lines+markers' | 'markers' {
  return connectAs === 'scatter' ? 'markers' : 'lines+markers'
}

export function thetaToPlotly(
  theta: number,
  units: ThetaUnits | undefined,
): { value: number; thetaunit: 'degrees' | 'radians' } {
  const u = units ?? 'degrees'
  if (u === 'radians') return { value: theta, thetaunit: 'radians' }
  if (u === 'gradians') return { value: theta * 0.9, thetaunit: 'degrees' }
  if (u === 'turns') return { value: theta * 360, thetaunit: 'degrees' }
  return { value: theta, thetaunit: 'degrees' }
}

const PLOT_LAYOUT_BASE = {
  autosize: true,
  paper_bgcolor: '#0f172a',
  plot_bgcolor: '#1e293b',
  font: { color: '#e2e8f0', size: 11 },
  margin: { l: 48, r: 12, t: 24, b: 36 },
  uirevision: 'plot-preview',
} as const

function isPlottable(calibration: Calibration, a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const coords = calibration.coords_type ?? 'cartesian'
  if (coords === 'polar') {
    if (calibration.y.scale === 'log' && b <= 0) return false
    return true
  }
  if (calibration.x.scale === 'log' && a <= 0) return false
  if (calibration.y.scale === 'log' && b <= 0) return false
  return true
}

export function buildPreviewConfig(
  curves: Curve[],
  calibration: Calibration,
  height: number,
): { traces: Array<Record<string, unknown>>; layout: Record<string, unknown> } {
  const coords = calibration.coords_type ?? 'cartesian'
  const traces: Array<Record<string, unknown>> = []
  for (const curve of curves) {
    if (!curve.visible) continue
    const mode = connectAsToPlotlyMode(curve.connect_as)
    if (coords === 'polar') {
      const theta: number[] = []
      const r: number[] = []
      let thetaunit: 'degrees' | 'radians' = 'degrees'
      for (const p of curve.points) {
        const [tRaw, radius] = pixelToData(calibration, p.pixel)
        if (!isPlottable(calibration, tRaw, radius)) continue
        const conv = thetaToPlotly(tRaw, calibration.theta_units)
        thetaunit = conv.thetaunit
        theta.push(conv.value)
        r.push(radius)
      }
      if (!theta.length) continue
      traces.push({
        type: 'scatterpolar',
        mode,
        theta,
        r,
        thetaunit,
        name: curve.label,
        line: { color: curve.color },
        marker: { size: 4, color: curve.color },
      })
    } else {
      const xs: number[] = []
      const ys: number[] = []
      for (const p of curve.points) {
        const [x, y] = pixelToData(calibration, p.pixel)
        if (!isPlottable(calibration, x, y)) continue
        xs.push(x)
        ys.push(y)
      }
      if (!xs.length) continue
      traces.push({
        type: 'scatter',
        mode,
        x: xs,
        y: ys,
        name: curve.label,
        line: { color: curve.color },
        marker: { size: 4, color: curve.color },
      })
    }
  }
  const h = Math.max(height, 120)
  if (coords === 'polar') {
    const origin = calibration.origin_radius ?? 0
    const radialType = calibration.y.scale === 'log' ? 'log' : 'linear'
    return {
      traces,
      layout: {
        ...PLOT_LAYOUT_BASE,
        height: h,
        polar: {
          radialaxis: {
            title: 'R',
            type: radialType,
            gridcolor: '#334155',
            range: origin !== 0 ? [origin, null] : undefined,
          },
          angularaxis: { direction: 'counterclockwise' },
        },
      },
    }
  }
  const units =
    coords === 'map' && calibration.scale_bar?.units ? ` (${calibration.scale_bar.units})` : ''
  return {
    traces,
    layout: {
      ...PLOT_LAYOUT_BASE,
      height: h,
      xaxis: {
        title: coords === 'map' ? `x${units}` : 'X',
        gridcolor: '#334155',
        automargin: true,
        autorange: true,
        type: calibration.x.scale === 'log' ? 'log' : 'linear',
      },
      yaxis: {
        title: coords === 'map' ? `y${units}` : 'Y',
        gridcolor: '#334155',
        automargin: true,
        autorange: true,
        type: calibration.y.scale === 'log' ? 'log' : 'linear',
      },
    },
  }
}
```

Phase 1 already declared `ThetaUnits` and the polar/map fields on `Calibration` in `frontend/src/types.ts`. Do not re-declare them.

In `frontend/src/components/PreviewChart.tsx`, delete local `buildLayout` / `buildTraces` and use:

```ts
import { buildPreviewConfig } from '../lib/previewChart'
import { isCalibrationValid } from '../lib/transform2d'
```

```ts
  const traces = useMemo(
    () => (valid && calibration ? buildPreviewConfig(curves, calibration, plotHeight).traces : []),
    [curves, calibration, valid, plotHeight],
  )
  const layout = useMemo(
    () => (valid && calibration ? buildPreviewConfig(curves, calibration, plotHeight).layout : null),
    [curves, calibration, valid, plotHeight],
  )
```

`previewChart.ts` imports `pixelToData` from `./transform2d` (Phase 1). That function is the polar/map adapter, not the old 1D fit.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/pytest tests/test_export.py tests/test_import.py tests/test_project.py -v`

Expected: PASS. Cartesian header still `curve_id,curve_label,x,y`. Legacy `_LEGACY_CSV` import still works.

Run: `cd frontend && npm test`

Expected: PASS, including polar `scatterpolar` and map units assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/export/export.py backend/app/export/import_curves.py backend/app/export/project_io.py backend/tests/test_export.py backend/tests/test_import.py backend/tests/test_project.py frontend/src/lib/previewChart.ts frontend/src/lib/__tests__/previewChart.test.ts frontend/src/components/PreviewChart.tsx frontend/src/types.ts
git commit -m "$(cat <<'EOF'
feat: export and preview polar and map coordinate systems

EOF
)"
```

---

### Task 5: Integration suite and docs

**Files:**
- Create: `backend/tests/reference/test_pipeline_reference.py`
- Modify: `UPDATES.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Phase 1 `pixel_to_data` / `Calibration` from `ReferenceDoc.axis_points`; Phase 2 `build_curve_mask(session, image_bytes, curve_id) -> np.ndarray` and `build_filter_mask`; Phase 3 `build_segments`, `fill_segment`; Task 1 `match_points`; Task 4 `export_csv`; `assert_not_worse`; `time.perf_counter`
- Produces: regression keys in `metrics.json` for the named pipeline cases; changelog versions **2.3.0, 2.4.0, 2.5.0, 2.6.0** (titles below). This task may touch **only** `UPDATES.md` and `README.md` among markdown files.

UPDATES versions and titles (feature → `subver` from current `2.2.2`):

| Version | Title |
|---------|--------|
| `2.3.0` | Affine, projective, polar and map calibration |
| `2.4.0` | Colour filter, grid removal and subpixel snap |
| `2.5.0` | Segment-fill auto-digitize |
| `2.6.0` | Scatter point-match, polar/map preview and export |

Execution order is 1 → 2 → 3 → 4, so `2.3.0`–`2.5.0` are already in `UPDATES.md`. This task inserts only **`2.6.0`** at the top of the Changelog.

`huge.png` is 4000×2000. Wall-clock budget for one `build_filter_mask` + `match_points` pass: **15.0 seconds**.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/reference/test_pipeline_reference.py`:

```python
from __future__ import annotations

import math
import time

import cv2
import numpy as np
import pytest

from app.calibration.coords import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.point_match import match_points
from app.cv.segments import build_segments, fill_segment, segment_at
from app.export.export import export_csv
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    ColorFilter,
    Curve,
    Point,
    Session,
)
from tests.metrics import assert_not_worse, max_abs_error, rms_error
from tests.reference.refcorpus import iter_docs, sample_image
from tests.synth.plotgen import render_plot

pytestmark = pytest.mark.reference


def _norm_level(v: float) -> float:
    return float(v) / 100.0 if float(v) > 1.0 else float(v)


def _filter_from_doc(doc) -> ColorFilter:
    raw = doc.color_filter or {}
    low = _norm_level(float(raw.get("IntensityLow", raw.get("low", 0.0))))
    high = _norm_level(float(raw.get("IntensityHigh", raw.get("high", 0.4))))
    return ColorFilter(mode="intensity", low=low, high=high)


def _cal_from_doc(doc) -> Calibration:
    scale_x = doc.scale_x if doc.scale_x in ("linear", "log") else "linear"
    scale_y = doc.scale_y if doc.scale_y in ("linear", "log") else "linear"
    coords = doc.coords_type if doc.coords_type in ("cartesian", "polar", "map") else "cartesian"
    axis_points = [
        AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=ap.graph_y)
        for ap in doc.axis_points
    ]
    return Calibration(
        x=CalibrationAxis(scale=scale_x, ref_points=[]),
        y=CalibrationAxis(scale=scale_y, ref_points=[]),
        coords_type=coords,
        model="auto",
        axis_points=axis_points,
        theta_units="degrees",
    )


def _session(doc, cal: Calibration, curve: Curve) -> Session:
    h, w = doc.image.shape[:2]
    return Session(
        image_meta={"width": w, "height": h, "scale_factor": 1.0},
        calibration=cal,
        curves=[curve],
    )


def _rel_errors(pairs: list[tuple[float, float]], expected: list[tuple[float, float]]) -> tuple[float, float]:
    if not pairs or not expected:
        return 999.0, 999.0
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    ex = [p[0] for p in expected]
    ey = [p[1] for p in expected]
    span_x = max(max(ex) - min(ex), 1e-9)
    span_y = max(max(ey) - min(ey), 1e-9)
    # nearest-neighbour in x then y relative to span
    errs = []
    for x, y in zip(xs, ys, strict=True):
        dmin = min(math.hypot((x - gx) / span_x, (y - gy) / span_y) for gx, gy in expected)
        errs.append(dmin)
    return float(rms_error(errs, [0.0] * len(errs))), float(max(errs) if errs else 999.0)


def test_pipeline_cartesian_linear(ref_dir):
    doc = next(d for d in iter_docs(ref_dir) if d.name == "guidelines_cartesian")
    cal = _cal_from_doc(doc)
    flt = _filter_from_doc(doc)
    mask = build_filter_mask(doc.image, flt)
    segs = build_segments(mask, min_length=float(doc.segment_settings.get("MinLength", 2.0)))
    assert len(segs) >= 1
    seed = next(iter(doc.curve_points.values()))[0]
    seg = segment_at(segs, seed, max_distance=20.0)
    assert seg is not None
    pixels = fill_segment(
        seg,
        separation=float(doc.segment_settings.get("PointSeparation", 25.0)),
        fill_corners=bool(doc.segment_settings.get("FillCorners", False)),
        mask=mask,
    )
    curve = Curve(
        label="A",
        filter=flt,
        points=[Point(pixel=p, origin="ai") for p in pixels],
    )
    session = _session(doc, cal, curve)
    csv_text = export_csv(session)
    assert csv_text.splitlines()[0] == "curve_id,curve_label,x,y"
    got = [pixel_to_data(cal, p) for p in pixels]
    assert doc.expected_csv
    expected = []
    for row in doc.expected_csv[1:]:
        if len(row) < 2 or "XXX" in row:
            continue
        expected.append((float(row[-2]), float(row[-1])))
    assert expected
    rms, peak = _rel_errors(got, expected)
    assert peak <= 0.005
    assert rms <= 0.005
    assert_not_worse("pipeline.guidelines_cartesian.rel_peak", peak, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_cartesian.rel_rms", rms, lower_is_better=True)


def test_pipeline_cartesian_log(ref_dir):
    doc = next(d for d in iter_docs(ref_dir) if d.name == "guidelines_cartesian_log")
    cal = _cal_from_doc(doc)
    flt = _filter_from_doc(doc)
    mask = build_filter_mask(doc.image, flt)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) >= 1
    pixels = fill_segment(segs[0], separation=25.0, fill_corners=False, mask=mask)
    got = [pixel_to_data(cal, p) for p in pixels]
    assert doc.expected_csv
    expected = []
    for row in doc.expected_csv[1:]:
        if len(row) < 2 or "XXX" in row:
            continue
        expected.append((float(row[-2]), float(row[-1])))
    assert expected
    rms, peak = _rel_errors(got, expected)
    assert peak <= 0.01
    assert rms <= 0.01
    assert_not_worse("pipeline.guidelines_cartesian_log.rel_peak", peak, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_cartesian_log.rel_rms", rms, lower_is_better=True)


def test_pipeline_polar(ref_dir):
    doc = next(d for d in iter_docs(ref_dir) if d.name == "guidelines_polar")
    cal = _cal_from_doc(doc)
    assert cal.coords_type == "polar"
    flt = _filter_from_doc(doc)
    mask = build_filter_mask(doc.image, flt)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) >= 1
    pixels = fill_segment(segs[0], separation=25.0, fill_corners=False, mask=mask)
    thetas: list[float] = []
    radii: list[float] = []
    for p in pixels:
        t, r = pixel_to_data(cal, p)
        thetas.append(t)
        radii.append(r)
    session = _session(
        doc,
        cal,
        Curve(label="A", filter=flt, points=[Point(pixel=p, origin="ai") for p in pixels]),
    )
    header = export_csv(session).splitlines()[0]
    assert header == "curve_id,curve_label,theta,R"
    assert doc.expected_csv
    exp_t = []
    exp_r = []
    for row in doc.expected_csv[1:]:
        if len(row) < 2 or "XXX" in row:
            continue
        exp_t.append(float(row[-2]))
        exp_r.append(float(row[-1]))
    assert exp_t
    dt = max(min(abs(t - et) for et in exp_t) for t in thetas)
    dr = max(min(abs(r - er) / max(abs(er), 1e-9) for er in exp_r) for r in radii)
    assert dt <= 0.5
    assert dr <= 0.01
    assert_not_worse("pipeline.guidelines_polar.theta_deg", dt, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_polar.R_rel", dr, lower_is_better=True)


def test_pipeline_scatter_pointplot(ref_dir):
    img = sample_image(ref_dir, "pointplot.bmp")
    flt = ColorFilter(mode="intensity", low=0.90, high=0.99)
    mask = build_filter_mask(img, flt)
    n, _labels, stats, centroids = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    truth = [
        (float(centroids[i][0]), float(centroids[i][1]))
        for i in range(1, n)
        if int(stats[i, cv2.CC_STAT_AREA]) >= 8
    ]
    assert len(truth) >= 3
    found = match_points(mask, truth[0], sample_radius=8, max_point_size=24)
    used = [False] * len(truth)
    tp = 0
    for cand in found:
        best = -1
        best_d = 2.0
        for i, t in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cand.pixel[0] - t[0], cand.pixel[1] - t[1])
            if d < best_d:
                best_d = d
                best = i
        if best >= 0 and best_d <= 1.5:
            used[best] = True
            tp += 1
    recall = tp / len(truth)
    fp_rate = (len(found) - tp) / max(len(found), 1)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    h, w = img.shape[:2]
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                {"pixel": (0.0, 0.0), "value": 0.0},
                {"pixel": (float(w - 1), 0.0), "value": float(w - 1)},
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                {"pixel": (0.0, float(h - 1)), "value": 0.0},
                {"pixel": (0.0, 0.0), "value": float(h - 1)},
            ],
        ),
    )
    curve = Curve(
        label="triangles",
        connect_as="scatter",
        filter=flt,
        points=[Point(pixel=c.pixel, origin="ai") for c in found],
    )
    session = Session(
        image_meta={"width": w, "height": h, "scale_factor": 1.0},
        calibration=cal,
        curves=[curve],
    )
    csv_text = export_csv(session)
    assert csv_text.splitlines()[0] == "curve_id,curve_label,x,y"
    assert_not_worse("pipeline.pointplot.recall", recall, lower_is_better=False)
    assert_not_worse("pipeline.pointplot.fp_rate", fp_rate, lower_is_better=True)


def test_huge_png_point_match_budget(ref_dir):
    img = sample_image(ref_dir, "huge.png")
    flt = ColorFilter(mode="intensity", low=0.0, high=0.5)
    t0 = time.perf_counter()
    mask = build_filter_mask(img, flt)
    ys, xs = np.where(mask > 0)
    sample = (float(xs[len(xs) // 2]), float(ys[len(ys) // 2])) if len(xs) else (img.shape[1] / 2.0, img.shape[0] / 2.0)
    match_points(mask, sample, sample_radius=8, max_point_size=48, limit=50)
    elapsed = time.perf_counter() - t0
    assert elapsed < 15.0
    assert_not_worse("pipeline.huge_png.match_s", elapsed, lower_is_better=True)
```

Load each fixture with `next(d for d in iter_docs(ref_dir) if d.name == "<stem>")`. `AxisPoint` construction matches Phase 1. `RefPoint` dict form `{"pixel": ..., "value": ...}` is valid for Pydantic `CalibrationAxis`.

Also add a synthetic (non-reference) test in `backend/tests/test_point_match.py` so `pytest -q` without the corpus still exercises the pipeline:

```python
def test_synthetic_pipeline_scatter_and_line_export():
    from app.export.export import export_csv
    from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, Session
    from tests.synth.plotgen import render_plot

    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 10.0),
        size=(200, 200),
        line_width=2,
        line_color=(0, 0, 255),
    )
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=plot.pixel_of(0.0, 0.0), value=0.0),
                RefPoint(pixel=plot.pixel_of(10.0, 0.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=plot.pixel_of(0.0, 0.0), value=0.0),
                RefPoint(pixel=plot.pixel_of(0.0, 10.0), value=10.0),
            ],
        ),
    )
    session = Session(
        image_meta={"width": 200, "height": 200, "scale_factor": 1.0},
        calibration=cal,
        curves=[
            Curve(
                label="line",
                connect_as="line",
                points=[Point(pixel=plot.pixel_of(2.0, 1.0), origin="user")],
            )
        ],
    )
    from app.calibration.coords import pixel_to_data

    text = export_csv(session)
    assert text.splitlines()[0] == "curve_id,curve_label,x,y"
    x, y = pixel_to_data(cal, plot.pixel_of(2.0, 1.0))
    row = text.splitlines()[1].split(",")
    assert abs(float(row[2]) - x) < 1e-9
    assert abs(float(row[3]) - y) < 1e-9
```

- [ ] **Step 2: Run integration tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/reference/test_pipeline_reference.py -v`

Expected (corpus present): FAIL on missing file / missing baseline keys / unmet gates until Step 3 records baselines. Expected (corpus absent): SKIP.

Run: `cd backend && .venv/bin/pytest tests/test_point_match.py::test_synthetic_pipeline_scatter_and_line_export -v`

Expected: FAIL with `not found` until the test exists, then PASS (export already works from Task 4).

- [ ] **Step 3: Record baselines**

Do not change gates (cartesian peak ≤ 0.5% = `0.005`, log peak ≤ 1% = `0.01`, polar θ ≤ 0.5°, R ≤ 1%, scatter recall ≥ 0.95 / fp ≤ 2%, huge.png `< 15.0` s).

Run: `cd backend && .venv/bin/pytest tests/reference/test_pipeline_reference.py tests/test_point_match.py -v --update-baselines`

Expected: PASS (or SKIP without corpus). Then run without `--update-baselines` and expect the same.

- [ ] **Step 4: Run the full backend suite without the corpus requirement**

Run: `cd backend && .venv/bin/pytest -q`

Expected: PASS (reference tests SKIP if `PLOTDIG_REF_DIR` is absent).

Run: `cd frontend && npm test`

Expected: PASS.

- [ ] **Step 5: Write the failing-docs... no. Docs are not TDD. Update UPDATES.md and README.md**

Insert only this entry at the top of the Changelog in `UPDATES.md` (phases 1–3 already wrote `2.3.0`–`2.5.0`):

```markdown
## [2.6.0] — 2026-09-04
### Added
- **Scatter point-match:** OpenCV normalised-correlation marker finder (`cv/point_match.py`), non-mutating `POST /curves/{id}/point-match` plus undoable accept, ranked-ring canvas UX (Enter/click accept, Esc/right-click reject, Shift+Enter accept-at-or-above).
- **Scatter curves:** `Curve.connect_as` (`line` default, `scatter` markers-only in PreviewChart and EditorCanvas; Improve/Densify disabled; CSV keeps placement order).
- **Polar/map preview and export:** Plotly `scatterpolar` (θ in calibration units, log radius via `Calibration.y.scale`, `origin_radius`); map axes in scale-bar units; CSV headers `theta,R` / `# units:`; project and import round-trip of the new calibration fields.
- End-to-end reference pipeline regression (`tests/reference/test_pipeline_reference.py`) and `huge.png` 15s match budget.
```

Replace README **How It Works** with:

```markdown
## How It Works

PlotDigitizer uses a **manual-first pipeline**:

1. **Upload** a plot image (including photos taken at an angle).
2. **Calibrate** in Cartesian (four bounds or 3+ precise axis points, linear or log), **Polar** (θ units, radius scale, origin radius), or **Map** (two-point scale bar). Affine/projective models map rotated or perspective photos without resampling ink.
3. **Unskew** *(optional)*: preview and apply perspective or mesh correction when you still want a straightened image.
4. **Condition** the curve: per-curve colour filter and optional grid removal; toggle the binary mask overlay.
5. **Place** points on each curve, or **auto-digitize**: segment-fill along ink, or **point-match** for scatter markers (sample one marker, accept/reject ranked candidates).
6. **Refine** line curves with **Improve** (mask corridor) and **Densify**. Scatter curves (`connect_as: scatter`) stay markers-only.
7. Watch the **preview chart** in data space (cartesian, polar θ/R, or map units).
8. **Export** CSV / JSON, or save a **project** (`.pdproj.json`). CSV columns follow the coordinate system (`x,y` / `theta,R` / `x,y` plus units).

**Pixel coordinates are the source of truth.** Data-space values are always derived through the
current calibration, so re-calibrating instantly remaps all points.
```

Replace the Architecture diagram `cv/` and `calibration/` lines with:

```
│  cv/          trace · improve · resample · erase · unskew · color_filter · grid_removal · snap · segments · point_match │
│  calibration/ 2D transform + cartesian / polar / map adapters (linear / log)                                              │
```

and add AutoDigitizePanel / FilterPanel to the frontend line:

```
│  UnskewPanel · CalibrationPanel · FilterPanel · AutoDigitizePanel · CurveList · ExportPanel                              │
```

Replace **Status** with:

```markdown
## Status

**v2.6** — precision toolkit: affine/projective/polar/map calibration, colour-filter + grid
conditioning, segment-fill and point-match auto-digitize, scatter curves, polar/map preview and
export. Current version: see [`UPDATES.md`](UPDATES.md).
```

Do not create any other markdown.

- [ ] **Step 6: Re-run tests after docs (docs cannot break tests)**

Run: `cd backend && .venv/bin/pytest -q`

Expected: PASS (reference SKIP without corpus).

Run: `cd frontend && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/reference/test_pipeline_reference.py backend/tests/test_point_match.py backend/tests/reference/baselines/metrics.json UPDATES.md README.md
git commit -m "$(cat <<'EOF'
test: add precision-toolkit pipeline regression and document v2.6

EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|-----------|------|
| §5.1 polar/map adapters through preview/export | Task 4 (`scatterpolar`, map axes, CSV headers) |
| §6 `ConnectAs`, `Curve.connect_as`, `WorkspaceState.max_point_size` | Task 3 (`connect_as`), Task 2 (`max_point_size`) |
| §7 `cv/point_match.py` `MatchCandidate` / `match_points` | Task 1 (exact signatures) |
| §8 `POST .../point-match` and `.../point-match/accept` | Task 2 |
| §9 point-match UX, PreviewChart polar/map/scatter, export columns | Task 2 UX, Task 3 scatter, Task 4 preview/export |
| §10.4 point-match gates + polar θ/R | Task 1 + Task 5 |
| §11 Phase 4 deliverable | this plan |
| §3 licence / optional corpus / pixels canonical / compat / TDD / deps / docs / no master | Global Constraints + every task |
| Track C non-goals (splines, area, extra digits) | not in any task |

**2. Placeholder scan**

No TBD/TODO/`similar to Task N`. Fixtures load via `iter_docs` + `doc.name`. Plotgen `markers` schema is `{xy, shape, size, color}`. `build_curve_mask(session, image_bytes, curve_id)` is the single call. Polar radius scale is `Calibration.y.scale`.

**3. Type consistency**

- `CanvasMode` is declared once in `frontend/src/types.ts` by Phase 1 as `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`; backend `WorkspaceState.canvas_mode` is the same six-value Literal. Phase 4 must not redeclare or narrow either; it only implements the `'point-match'` handler.
- `MatchCandidate.pixel: tuple[float, float]` / TS `[number, number]` + `score: float` used in cv, API `MatchCandidateOut`, client, overlay, reducer.
- `match_points(..., sample_radius: int, max_point_size: int = 48, exclude=None, limit=200)` unchanged across Task 1–2–5.
- `ConnectAs = "line" | "scatter"`, default `"line"`, same in Pydantic and TS.
- CSV polar header `theta,R` matches import keys `theta`/`r`.
- Undo action `"point_match_accept"` is the API history string the test asserts.

Fixes applied while writing: Improve/Densify backend rejection added so UI disable cannot be bypassed; cartesian CSV header frozen as exact `curve_id,curve_label,x,y`.
