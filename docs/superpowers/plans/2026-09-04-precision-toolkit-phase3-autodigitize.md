# Precision Toolkit Phase 3: Automatic Line Digitizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Engauge-informed segment fill (click a stroke, get evenly spaced snapped points) and rebuild Improve to consume the Phase 2 shared mask, with UI for both plus the missing remove-from-plot control.

**Architecture:** A column-run segment builder turns the per-curve binary mask into compact polylines. Segment fill walks those polylines by arc length (optional corner vertices) and refines each sample with `snap_to_ink`. Improve v2 keeps the seed corridor and `improve_curve_from_hints` entry point but drops the 9×9 dark-quartile colour sample in favour of `build_curve_mask` + `snap_to_ink`. The frontend AutoDigitizePanel + `segment-fill` canvas mode is the click-to-fill surface; CurveList finally exposes remove-from-plot.

**Tech Stack:** Python 3, FastAPI, Pydantic, OpenCV, NumPy, Pillow, pytest; React 19, TypeScript, Konva / react-konva, vitest. No SciPy, no scikit-image, no FFTW. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-precision-toolkit-design.md`

**Worktree:** Implement on a feature branch / git worktree (skill `using-git-worktrees` at execution time). Never commit to `master`. Never `git push` or merge unless the user asks.

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
   (feature → `subver`; this phase is pinned `2.4.0` → `2.5.0`). `README.md` changes only when architecture changes. No other
   markdown files may be created.
9. **No commits to `master`.** All work happens on a feature branch / worktree. Never
   `git push`, never merge, without the user's explicit request.

Phase 3 also inherits: Improve and Densify keep working through their current API and UI; `cv/erase.py` keeps importing `_is_near_white` and `_sample_color_from_hints` from `app.cv.improve` (do not delete those helpers); Phase 1 is independent (do not import the new transform solver); where a test needs data-space values, build a four-bound linear/log calibration through `app.calibration.calibration.pixel_to_data`.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/cv/segments.py` | Create | `Segment`, `build_segments`, `segment_at`, `fill_segment`, `CORNER_TURN_DEG` |
| `backend/tests/test_segments.py` | Create | Synthetic builder + fill unit tests |
| `backend/tests/reference/test_segment_fill_reference.py` | Create | Corpus fill + corners.png tests (`@pytest.mark.reference`) |
| `backend/app/cv/improve.py` | Modify | Improve v2 (shared mask + `snap_to_ink`); keep v1 colour-sample helpers for `erase.py` |
| `backend/tests/test_improve_v2.py` | Create | v1 baseline recording, v2-beats-v1, signature compatibility |
| `backend/tests/reference/test_improve_v2_reference.py` | Create | Optional corpus Improve comparison |
| `backend/tests/reference/baselines/metrics.json` | Modify | Record v1 Improve RMS, segment-fill RMS |
| `backend/app/models/schemas.py` | Modify | Workspace fields + segment request/response models |
| `backend/app/pipeline/pipeline.py` | Modify | `list_curve_segments`, `run_segment_fill`; Improve passes shared mask |
| `backend/app/api/sessions.py` | Modify | `POST .../segments`, `POST .../segment-fill` |
| `backend/tests/test_segment_api.py` | Create | HTTP tests for the two new routes + undo |
| `backend/tests/test_remove_from_plot_api.py` | Create | HTTP tests for existing remove-from-plot + undo |
| `frontend/src/lib/segments.ts` | Create | Hit-test, Konva flatten, spacing label |
| `frontend/src/lib/__tests__/segments.test.ts` | Create | Vitest for those helpers |
| `frontend/src/components/AutoDigitizePanel.tsx` | Create | Separation / min length / fill-corners + enter-mode button |
| `frontend/src/components/EditorCanvas.tsx` | Modify | `segment-fill` hover highlight + click |
| `frontend/src/components/CurveList.tsx` | Modify | Remove-from-plot button |
| `frontend/src/types.ts` | Modify | Workspace fields + `SegmentPublic` |
| `frontend/src/api/client.ts` | Modify | `listCurveSegments`, `fillCurveSegment`, `removeCurveFromPlot` |
| `frontend/src/App.tsx` | Modify | Wire panel, mode, fetch, click, remove-from-plot |
| `README.md` | Modify | Mention segment fill / AutoDigitizePanel (architecture) |
| `UPDATES.md` | Modify | Phase 3 changelog, bump `2.4.0` → `2.5.0` |

---

## Frozen public signatures (all later tasks)

```python
@dataclass
class Segment:
    points: list[tuple[float, float]]
    length: float

CORNER_TURN_DEG: float = 30.0  # fill_corners vertex turn threshold

def build_segments(mask: np.ndarray, min_length: float = 2.0) -> list[Segment]
def segment_at(
    segments: list[Segment],
    pixel: tuple[float, float],
    max_distance: float = 12.0,
) -> Segment | None
def fill_segment(
    seg: Segment,
    separation: float = 25.0,
    fill_corners: bool = False,
    *,
    mask: np.ndarray | None = None,
) -> list[tuple[float, float]]

def improve_curve_from_hints(
    image_bytes: bytes,
    color_hex: str,
    hint_points: list[tuple[float, float]],
    target_count: int,
    mask: np.ndarray | None = None,
) -> list[Point]
```

`fill_segment`'s first three arguments match spec §7 exactly. The keyword-only `mask` is how emitted points are refined with `snap_to_ink` (local polyline direction). Omitting `mask` returns geometric samples (spacing tests). Pipeline always passes the curve mask.

Improve keeps the four positional arguments used by `pipeline.run_cv_improve` and by `backend/tests/test_cv_improve.py`. Optional `mask` is the v2 path; `None` builds a default `ColorFilter()` mask from the decoded image so old callers keep working.

Crossing-stroke rule used in Task 1: **exactly 2 segments**, and every vertex of each segment lies within **2.5 px** of one and the same analytic line (infinite line through that stroke's endpoints). A count of 1 would mean the two strokes were fused; 3–4 would mean the junction was split into stubs; 2 segments whose vertices jump lines would mean the linker swapped branches at the junction.

---

### Task 1: Segment builder

**Files:**
- Create: `backend/app/cv/segments.py`
- Test: `backend/tests/test_segments.py`

**Interfaces:**
- Consumes: uint8 mask `{0,255}` from Phase 2 `build_filter_mask` / `build_curve_mask` (tests in this task draw masks directly with OpenCV so they run without a session). NumPy + OpenCV only.
- Produces:
  - `CORNER_TURN_DEG = 30.0`
  - `@dataclass class Segment: points: list[tuple[float, float]]; length: float`
  - `build_segments(mask: np.ndarray, min_length: float = 2.0) -> list[Segment]`
  - `segment_at(segments: list[Segment], pixel: tuple[float, float], max_distance: float = 12.0) -> Segment | None`
  - Module helpers used by Task 2 in the same file: `_turn_deg`, `_arc_length`, `_point_at_arclength` (implement in Task 1 so Task 2 does not redefine them).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_segments.py`:

```python
from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.cv.segments import build_segments, segment_at


def _line_mask(
    size: tuple[int, int],
    a: tuple[int, int],
    b: tuple[int, int],
    width: int = 2,
) -> np.ndarray:
    mask = np.zeros(size, dtype=np.uint8)
    cv2.line(mask, a, b, 255, width)
    return mask


def _sine_mask() -> tuple[np.ndarray, list[tuple[float, float]]]:
    h, w = 400, 500
    mask = np.zeros((h, w), dtype=np.uint8)
    xs = np.linspace(50.0, 450.0, 401)
    ys = 200.0 + 40.0 * np.sin(2.0 * np.pi * (xs - 50.0) / 400.0)
    analytic = list(zip(xs.tolist(), ys.tolist(), strict=True))
    for i in range(len(xs) - 1):
        cv2.line(
            mask,
            (int(round(xs[i])), int(round(ys[i]))),
            (int(round(xs[i + 1])), int(round(ys[i + 1]))),
            255,
            2,
        )
    return mask, analytic


def _nearest_analytic_dist(
    px: float, py: float, analytic: list[tuple[float, float]]
) -> float:
    return min(math.hypot(px - ax, py - ay) for ax, ay in analytic)


def _point_to_line_dist(
    px: float,
    py: float,
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    denom = math.hypot(dx, dy)
    if denom < 1e-9:
        return math.hypot(px - ax, py - ay)
    return abs((px - ax) * dy - (py - ay) * dx) / denom


def test_single_stroke_is_one_segment_tracking_analytic_sine():
    mask, analytic = _sine_mask()
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    seg = segs[0]
    assert len(seg.points) >= 4
    assert seg.length == pytest.approx(
        sum(
            math.hypot(
                seg.points[i + 1][0] - seg.points[i][0],
                seg.points[i + 1][1] - seg.points[i][1],
            )
            for i in range(len(seg.points) - 1)
        ),
        rel=1e-9,
    )
    # Compact polyline: not one vertex per column.
    assert len(seg.points) < 200
    for px, py in seg.points:
        assert _nearest_analytic_dist(px, py, analytic) <= 2.5


def test_crossing_strokes_are_two_segments_not_one():
    """Two diagonals that share a pixel must not fuse or swap branches.

    Expected count is exactly 2. Every vertex of each segment must stay
    within 2.5 px of one and the same analytic line (the infinite line
    through that stroke's endpoints). A linker that swaps arms at the
    junction still yields two segments, but each segment's vertices
    split across both lines and fail this check.
    """
    main_a, main_b = (20.0, 20.0), (180.0, 180.0)
    anti_a, anti_b = (20.0, 180.0), (180.0, 20.0)
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.line(mask, (20, 20), (180, 180), 255, 2)
    cv2.line(mask, (20, 180), (180, 20), 255, 2)
    segs = build_segments(mask, min_length=20.0)
    assert len(segs) == 2

    jump_tol_px = 2.5

    def _on_line(seg, a: tuple[float, float], b: tuple[float, float]) -> bool:
        return all(
            _point_to_line_dist(px, py, a, b) <= jump_tol_px
            for px, py in seg.points
        )

    assigned = []
    for seg in segs:
        on_main = _on_line(seg, main_a, main_b)
        on_anti = _on_line(seg, anti_a, anti_b)
        assert on_main ^ on_anti, (
            "segment jumped between the two strokes "
            "(vertices are not all on one analytic line)"
        )
        assigned.append("main" if on_main else "anti")
    assert sorted(assigned) == ["anti", "main"]


def test_doubling_back_stroke_is_one_segment():
    """A U that is not a function of x must stay a single polyline."""
    mask = np.zeros((160, 200), dtype=np.uint8)
    cv2.line(mask, (30, 20), (30, 140), 255, 2)
    cv2.line(mask, (30, 140), (170, 140), 255, 2)
    cv2.line(mask, (170, 140), (170, 20), 255, 2)
    segs = build_segments(mask, min_length=10.0)
    assert len(segs) == 1
    assert segs[0].length == pytest.approx(120 + 140 + 120, abs=25.0)
    xs = [p[0] for p in segs[0].points]
    assert min(xs) < 50 and max(xs) > 150


def test_short_speckles_below_min_length_are_dropped():
    mask = np.zeros((80, 80), dtype=np.uint8)
    mask[10:12, 10:12] = 255
    mask[40:43, 50:52] = 255
    cv2.line(mask, (5, 70), (75, 70), 255, 2)
    segs = build_segments(mask, min_length=10.0)
    assert len(segs) == 1
    assert segs[0].length >= 60.0


def test_segment_at_picks_nearest_and_none_beyond_max_distance():
    mask = _line_mask((100, 200), (10, 50), (190, 50), width=2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    hit = segment_at(segs, (100.0, 50.0), max_distance=12.0)
    assert hit is segs[0]
    miss = segment_at(segs, (100.0, 80.0), max_distance=12.0)
    assert miss is None


def test_segment_at_chooses_closer_of_two_parallel_strokes():
    mask = np.zeros((80, 200), dtype=np.uint8)
    cv2.line(mask, (10, 20), (190, 20), 255, 2)
    cv2.line(mask, (10, 60), (190, 60), 255, 2)
    segs = build_segments(mask, min_length=20.0)
    assert len(segs) == 2
    hit = segment_at(segs, (100.0, 22.0), max_distance=12.0)
    assert hit is not None
    ys = [p[1] for p in hit.points]
    assert sum(ys) / len(ys) < 40.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_segments.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.cv.segments'` (or `ImportError`).

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/cv/segments.py`. Technique (documented behaviour, not Engauge source): scan the mask column by column for vertical ink runs; link runs in adjacent columns whose Y-spans overlap; at forks/joins continue the chain that minimises turning angle so a crossing stays two strokes; fold nearly-collinear vertices; drop polylines shorter than `min_length`.

```python
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

CORNER_TURN_DEG = 30.0
COLLINEAR_FOLD_DEG = 8.0
COLLINEAR_FOLD_DIST_PX = 0.75


@dataclass
class Segment:
    points: list[tuple[float, float]]
    length: float


class _Run:
    __slots__ = ("x", "y0", "y1", "left", "right")

    def __init__(self, x: int, y0: int, y1: int) -> None:
        self.x = x
        self.y0 = y0
        self.y1 = y1
        self.left: list[_Run] = []
        self.right: list[_Run] = []

    @property
    def pt(self) -> tuple[float, float]:
        return (float(self.x), 0.5 * (self.y0 + self.y1))


def _runs_in_column(col: np.ndarray) -> list[tuple[int, int]]:
    ys = np.flatnonzero(col)
    if ys.size == 0:
        return []
    runs: list[tuple[int, int]] = []
    start = prev = int(ys[0])
    for raw in ys[1:]:
        y = int(raw)
        if y == prev + 1:
            prev = y
            continue
        runs.append((start, prev))
        start = prev = y
    runs.append((start, prev))
    return runs


def _overlaps(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return not (a[1] < b[0] or b[1] < a[0])


def _turn_deg(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
) -> float:
    v1 = (p1[0] - p0[0], p1[1] - p0[1])
    v2 = (p2[0] - p1[0], p2[1] - p1[1])
    n1 = math.hypot(v1[0], v1[1])
    n2 = math.hypot(v2[0], v2[1])
    if n1 < 1e-9 or n2 < 1e-9:
        return 0.0
    cross = v1[0] * v2[1] - v1[1] * v2[0]
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    return abs(math.degrees(math.atan2(cross, dot)))


def _fold_collinear(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return list(points)
    pts = list(points)
    changed = True
    while changed and len(pts) > 2:
        changed = False
        i = 1
        while i < len(pts) - 1:
            turn = _turn_deg(pts[i - 1], pts[i], pts[i + 1])
            x0, y0 = pts[i - 1]
            x1, y1 = pts[i + 1]
            x, y = pts[i]
            dx, dy = x1 - x0, y1 - y0
            denom = math.hypot(dx, dy)
            dist = (
                0.0
                if denom < 1e-9
                else abs((x - x0) * dy - (y - y0) * dx) / denom
            )
            if turn <= COLLINEAR_FOLD_DEG and dist <= COLLINEAR_FOLD_DIST_PX:
                pts.pop(i)
                changed = True
                continue
            i += 1
    return pts


def _arc_length(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        total += math.hypot(
            points[i + 1][0] - points[i][0],
            points[i + 1][1] - points[i][1],
        )
    return total


def _arc_length_prefix(points: list[tuple[float, float]]) -> list[float]:
    lengths = [0.0]
    for i in range(1, len(points)):
        lengths.append(
            lengths[-1]
            + math.hypot(
                points[i][0] - points[i - 1][0],
                points[i][1] - points[i - 1][1],
            )
        )
    return lengths


def _point_at_arclength(
    points: list[tuple[float, float]],
    lengths: list[float],
    target: float,
) -> tuple[float, float]:
    if target <= 0.0:
        return points[0]
    if target >= lengths[-1]:
        return points[-1]
    idx = 0
    while idx < len(lengths) - 1 and lengths[idx + 1] < target:
        idx += 1
    span = lengths[idx + 1] - lengths[idx]
    t = 0.0 if span < 1e-9 else (target - lengths[idx]) / span
    x0, y0 = points[idx]
    x1, y1 = points[idx + 1]
    return (x0 + t * (x1 - x0), y0 + t * (y1 - y0))


def _point_to_segment_dist(
    px: float,
    py: float,
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 < 1e-12:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _point_to_polyline_dist(
    pixel: tuple[float, float], points: list[tuple[float, float]]
) -> float:
    if not points:
        return math.inf
    if len(points) == 1:
        return math.hypot(pixel[0] - points[0][0], pixel[1] - points[0][1])
    return min(
        _point_to_segment_dist(pixel[0], pixel[1], points[i], points[i + 1])
        for i in range(len(points) - 1)
    )


def _neighbors(run: _Run) -> list[_Run]:
    return run.left + run.right


def _build_run_graph(mask: np.ndarray) -> list[_Run]:
    binary = mask > 0
    height, width = binary.shape[:2]
    cols: list[list[_Run]] = []
    all_runs: list[_Run] = []
    for x in range(width):
        runs = [_Run(x, y0, y1) for y0, y1 in _runs_in_column(binary[:, x])]
        cols.append(runs)
        all_runs.extend(runs)
    for x in range(width - 1):
        for left in cols[x]:
            for right in cols[x + 1]:
                if _overlaps((left.y0, left.y1), (right.y0, right.y1)):
                    left.right.append(right)
                    right.left.append(left)
    return all_runs


def _walk_path(
    start: _Run, used: set[tuple[int, int]]
) -> list[_Run]:
    def unused(node: _Run) -> list[_Run]:
        return [n for n in _neighbors(node) if (id(node), id(n)) not in used]

    path = [start]
    prev: _Run | None = None
    node = start
    while True:
        cands = unused(node)
        if prev is not None:
            cands = [c for c in cands if c is not prev]
        if not cands:
            break
        if prev is None:
            nxt = cands[0]
        else:
            nxt = min(
                cands,
                key=lambda n: _turn_deg(prev.pt, node.pt, n.pt),
            )
        used.add((id(node), id(nxt)))
        used.add((id(nxt), id(node)))
        path.append(nxt)
        prev, node = node, nxt
    return path


def build_segments(mask: np.ndarray, min_length: float = 2.0) -> list[Segment]:
    if mask.size == 0:
        return []
    all_runs = _build_run_graph(mask)
    used: set[tuple[int, int]] = set()
    polylines: list[list[tuple[float, float]]] = []

    def unused_neighbors(run: _Run) -> list[_Run]:
        return [n for n in _neighbors(run) if (id(run), id(n)) not in used]

    starts = [r for r in all_runs if len(_neighbors(r)) == 1]
    starts.extend(r for r in all_runs if r not in starts)

    for start in starts:
        if not unused_neighbors(start) and _neighbors(start):
            continue
        if not _neighbors(start):
            pts = [(float(start.x), float(start.y0))]
            if start.y1 != start.y0:
                pts.append((float(start.x), float(start.y1)))
            polylines.append(pts)
            continue
        if (id(start), id(unused_neighbors(start)[0])) in used:
            continue
        chain = _walk_path(start, used)
        polylines.append([r.pt for r in chain])

    segments: list[Segment] = []
    for raw in polylines:
        points = _fold_collinear(raw)
        length = _arc_length(points)
        if length + 1e-9 < min_length:
            continue
        segments.append(Segment(points=points, length=length))
    return segments


def segment_at(
    segments: list[Segment],
    pixel: tuple[float, float],
    max_distance: float = 12.0,
) -> Segment | None:
    best: Segment | None = None
    best_d = max_distance
    for seg in segments:
        d = _point_to_polyline_dist(pixel, seg.points)
        if d <= best_d:
            best_d = d
            best = seg
    return best
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_segments.py -v`

Expected: PASS (6 tests). If `test_crossing_strokes_are_two_segments_not_one` fails with `len == 4`, the walker is splitting at the junction instead of pairing collinear arms — keep the min-turn continuation and mark both directed edges used. If `len == 1`, overlap linking is treating the X as one Euler path — do not walk already-used edges. If `len == 2` but `on_main ^ on_anti` fails, the linker swapped branches at the junction — pair the unused neighbour with the smallest turning angle.

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/segments.py backend/tests/test_segments.py
git commit -m "$(cat <<'EOF'
feat: build compact polylines from a binary stroke mask

Column-run linking with collinear continuation keeps crossing strokes
apart and folds nearly-straight vertices so segment fill can walk them.
EOF
)"
```

---

### Task 2: Segment fill

**Files:**
- Modify: `backend/app/cv/segments.py` (add `fill_segment`)
- Modify: `backend/tests/test_segments.py` (spacing, corners, synthetic precision)
- Create: `backend/tests/reference/test_segment_fill_reference.py`
- Modify: `backend/tests/reference/baselines/metrics.json` (via `pytest --update-baselines` after the gates pass)

**Interfaces:**
- Consumes: `Segment`, `build_segments`, `_turn_deg`, `_arc_length_prefix`, `_point_at_arclength`, `CORNER_TURN_DEG` from Task 1; Phase 2 `snap_to_ink(mask, pixel, window=7, direction=None) -> tuple[float, float]`; Phase 0 `render_plot`, `rms_error`, `assert_not_worse`; Phase 2 `build_filter_mask` + `ColorFilter` for synthetic masks from rendered plots.
- Produces: `fill_segment(seg: Segment, separation: float = 25.0, fill_corners: bool = False, *, mask: np.ndarray | None = None) -> list[tuple[float, float]]`. Walks `seg.points` by arc length, always emits both endpoints, emits a point every `separation` pixels, and when `fill_corners` is true also emits every vertex whose turning angle is `>= CORNER_TURN_DEG` (30°). When `mask` is provided, each emitted point is passed through `snap_to_ink` with the local polyline direction.

- [ ] **Step 1: Write the failing synthetic fill tests**

Append to `backend/tests/test_segments.py`:

```python
from app.calibration.calibration import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.segments import fill_segment
from app.models.schemas import Calibration, CalibrationAxis, ColorFilter, RefPoint
from tests.metrics import assert_not_worse, rms_error
from tests.synth.plotgen import render_plot


def _consecutive_spacings(points: list[tuple[float, float]]) -> list[float]:
    return [
        math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
        for i in range(len(points) - 1)
    ]


def test_fill_segment_spacing_on_straight_stroke():
    mask = _line_mask((40, 260), (10, 20), (250, 20), width=2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    filled = fill_segment(segs[0], separation=25.0, fill_corners=False)
    assert filled[0] == pytest.approx(segs[0].points[0], abs=1.5)
    assert filled[-1] == pytest.approx(segs[0].points[-1], abs=1.5)
    assert len(filled) >= 5
    gaps = _consecutive_spacings(filled)
    for gap in gaps[:-1]:
        assert gap == pytest.approx(25.0, abs=3.0)
    assert gaps[-1] <= 25.0 + 3.0


def test_fill_segment_spacing_on_curved_stroke():
    mask, _analytic = _sine_mask()
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    filled = fill_segment(segs[0], separation=25.0, fill_corners=False)
    assert len(filled) >= 8
    gaps = _consecutive_spacings(filled)
    for gap in gaps[:-1]:
        assert 15.0 <= gap <= 35.0


def test_fill_corners_captures_zigzag_vertices_plain_spacing_misses():
    mask = np.zeros((120, 220), dtype=np.uint8)
    corners = [(10, 60), (50, 20), (90, 100), (130, 20), (170, 100), (210, 60)]
    for i in range(len(corners) - 1):
        cv2.line(mask, corners[i], corners[i + 1], 255, 2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    plain = fill_segment(segs[0], separation=40.0, fill_corners=False)
    with_corners = fill_segment(segs[0], separation=40.0, fill_corners=True)
    assert len(with_corners) > len(plain)

    inner = corners[1:-1]

    def _hit(samples: list[tuple[float, float]], corner: tuple[int, int], rad: float) -> bool:
        cx, cy = float(corner[0]), float(corner[1])
        return any(math.hypot(px - cx, py - cy) <= rad for px, py in samples)

    missed_plain = [c for c in inner if not _hit(plain, c, 6.0)]
    assert missed_plain, "plain spacing should skip at least one sharp corner"
    for c in inner:
        assert _hit(with_corners, c, 4.0)


def _four_bound_linear(xmin, xmax, ymin, ymax, x0, x1, y0, y1) -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=xmin, value=x0),
                RefPoint(pixel=xmax, value=x1),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=ymin, value=y0),
                RefPoint(pixel=ymax, value=y1),
            ],
        ),
        source="manual",
    )


def test_segment_fill_synthetic_sine_rms_within_half_percent_y_range():
    plot = render_plot(
        lambda x: math.sin(x),
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )
    mask = build_filter_mask(plot.image, ColorFilter())
    segs = build_segments(mask, min_length=20.0)
    assert segs, "expected the sine stroke to produce a segment"
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    pred = [plot.data_of(px, py) for px, py in filled]
    err = rms_error(pred, plot.truth)
    y_span = 3.0
    assert err <= 0.005 * y_span
    assert_not_worse("segment_fill_synth_sine_rms", err, lower_is_better=True)
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_segments.py::test_fill_segment_spacing_on_straight_stroke -v`

Expected: FAIL with `ImportError` / `AttributeError: cannot import name 'fill_segment'`.

- [ ] **Step 3: Implement `fill_segment`**

Add to `backend/app/cv/segments.py` (keep the Task 1 symbols; add the snap import and this function):

```python
from app.cv.snap import snap_to_ink


def _local_direction(
    points: list[tuple[float, float]], index: int
) -> tuple[float, float] | None:
    if len(points) < 2:
        return None
    if index <= 0:
        a, b = points[0], points[1]
    elif index >= len(points) - 1:
        a, b = points[-2], points[-1]
    else:
        a, b = points[index - 1], points[index + 1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy)
    if norm < 1e-9:
        return None
    return (dx / norm, dy / norm)


def _sort_unique_along(
    samples: list[tuple[float, float]],
    poly: list[tuple[float, float]],
    lengths: list[float],
) -> list[tuple[float, float]]:
    keyed: list[tuple[float, tuple[float, float]]] = []
    for pt in samples:
        best_s = 0.0
        best_d = math.inf
        for i in range(len(poly) - 1):
            ax, ay = poly[i]
            bx, by = poly[i + 1]
            dx, dy = bx - ax, by - ay
            len2 = dx * dx + dy * dy
            if len2 < 1e-12:
                s = lengths[i]
                d = math.hypot(pt[0] - ax, pt[1] - ay)
            else:
                t = max(0.0, min(1.0, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / len2))
                qx, qy = ax + t * dx, ay + t * dy
                s = lengths[i] + t * (lengths[i + 1] - lengths[i])
                d = math.hypot(pt[0] - qx, pt[1] - qy)
            if d < best_d:
                best_d = d
                best_s = s
        keyed.append((best_s, pt))
    keyed.sort(key=lambda item: item[0])
    out: list[tuple[float, float]] = []
    for _s, pt in keyed:
        if out and math.hypot(pt[0] - out[-1][0], pt[1] - out[-1][1]) < 0.5:
            continue
        out.append(pt)
    return out


def fill_segment(
    seg: Segment,
    separation: float = 25.0,
    fill_corners: bool = False,
    *,
    mask: np.ndarray | None = None,
) -> list[tuple[float, float]]:
    points = seg.points
    if not points:
        return []
    if len(points) == 1:
        pt = points[0]
        if mask is not None:
            pt = snap_to_ink(mask, pt)
        return [pt]

    lengths = _arc_length_prefix(points)
    total = lengths[-1]
    if total < 1e-9:
        pt = points[0]
        if mask is not None:
            pt = snap_to_ink(mask, pt)
        return [pt]

    sep = max(float(separation), 1e-6)
    samples: list[tuple[float, float]] = []
    d = 0.0
    while d < total - 1e-9:
        samples.append(_point_at_arclength(points, lengths, d))
        d += sep
    end = points[-1]
    if not samples or math.hypot(samples[-1][0] - end[0], samples[-1][1] - end[1]) > 0.5:
        samples.append(end)
    if math.hypot(samples[0][0] - points[0][0], samples[0][1] - points[0][1]) > 0.5:
        samples.insert(0, points[0])

    if fill_corners:
        extra: list[tuple[float, float]] = []
        for i in range(1, len(points) - 1):
            if _turn_deg(points[i - 1], points[i], points[i + 1]) >= CORNER_TURN_DEG:
                extra.append(points[i])
        samples = _sort_unique_along(samples + extra, points, lengths)

    if mask is not None:
        snapped: list[tuple[float, float]] = []
        for i, pt in enumerate(samples):
            snapped.append(
                snap_to_ink(mask, pt, direction=_local_direction(samples, i))
            )
        samples = snapped
    return samples
```

- [ ] **Step 4: Run synthetic fill tests**

Run: `cd backend && .venv/bin/pytest tests/test_segments.py -v`

Expected: PASS. First time `assert_not_worse` sees `segment_fill_synth_sine_rms` it may fail with a missing-key error — then run `cd backend && .venv/bin/pytest tests/test_segments.py::test_segment_fill_synthetic_sine_rms_within_half_percent_y_range -v --update-baselines` and re-run the file. Gate is RMS ≤ 0.5 % of the Y range (span 3.0). If the measured RMS exceeds the gate, stop and report the number; do not silently loosen it.

- [ ] **Step 5: Write the failing reference tests**

Create `backend/tests/reference/test_segment_fill_reference.py`:

```python
from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.calibration.calibration import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.segments import build_segments, fill_segment
from app.models.schemas import Calibration, CalibrationAxis, ColorFilter, RefPoint
from tests.metrics import assert_not_worse, rms_error
from tests.reference.refcorpus import sample_image


pytestmark = pytest.mark.reference


def _plot_frame_bounds(img_bgr: np.ndarray) -> tuple[float, float, float, float]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    dark = (gray < 40).astype(np.uint8) * 255
    row_counts = dark.sum(axis=1)
    col_counts = dark.sum(axis=0)
    h_rows = np.where(row_counts > 0.35 * dark.shape[1] * 255)[0]
    v_cols = np.where(col_counts > 0.35 * dark.shape[0] * 255)[0]
    assert h_rows.size >= 2 and v_cols.size >= 2, "gnuplot axis frame not found"
    return (
        float(v_cols.min()),
        float(v_cols.max()),
        float(h_rows.min()),
        float(h_rows.max()),
    )


def _cal_from_frame(
    img_bgr: np.ndarray,
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    *,
    log_y: bool = False,
) -> Calibration:
    x_left, x_right, y_top, y_bottom = _plot_frame_bounds(img_bgr)
    return Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=x0),
                RefPoint(pixel=(x_right, y_bottom), value=x1),
            ],
        ),
        y=CalibrationAxis(
            scale="log" if log_y else "linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=y0),
                RefPoint(pixel=(x_left, y_top), value=y1),
            ],
        ),
        source="manual",
    )


def _rms_against_funcs(
    filled_data: list[tuple[float, float]],
    funcs,
    x_lo: float,
    x_hi: float,
) -> tuple[float, float]:
    xs = np.linspace(x_lo, x_hi, 1500)
    best = math.inf
    y_span = 1.0
    for fn in funcs:
        truth = [(float(x), float(fn(x))) for x in xs]
        ys = [p[1] for p in truth]
        y_span = max(ys) - min(ys)
        err = rms_error(filled_data, truth)
        best = min(best, err)
    return best, y_span


def test_fill_corners_on_reference_corners_png(ref_dir):
    img = sample_image(ref_dir, "corners.png")
    mask = build_filter_mask(img, ColorFilter())
    segs = build_segments(mask, min_length=8.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    plain = fill_segment(seg, separation=40.0, fill_corners=False, mask=mask)
    with_corners = fill_segment(seg, separation=40.0, fill_corners=True, mask=mask)
    assert len(with_corners) > len(plain)


def test_segment_fill_gnuplot_x_y_lines_rms(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_y_lines_nogrid.png")
    flt = ColorFilter(mode="hue", low=0.0, high=0.08)
    mask = build_filter_mask(img, flt)
    if int(cv2.countNonZero(mask)) < 50:
        mask = build_filter_mask(img, ColorFilter())
    segs = build_segments(mask, min_length=30.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    xs = np.linspace(-10.0, 10.0, 2000)
    ys = np.concatenate(
        [xs * np.sin(xs / 3.0), xs * np.sin(xs / 4.0), xs * np.sin(xs / 5.0)]
    )
    cal = _cal_from_frame(
        img, -10.0, 10.0, float(ys.min()), float(ys.max()), log_y=False
    )
    pred = [pixel_to_data(cal, p) for p in filled]
    err, y_span = _rms_against_funcs(
        pred,
        [
            lambda x: x * math.sin(x / 3.0),
            lambda x: x * math.sin(x / 4.0),
            lambda x: x * math.sin(x / 5.0),
        ],
        -10.0,
        10.0,
    )
    assert err <= 0.02 * y_span
    assert_not_worse("segment_fill_ref_gnuplot_xy_rms", err, lower_is_better=True)


def test_segment_fill_gnuplot_x_log_y_lines_rms(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_log_y_lines_nogrid.png")
    mask = build_filter_mask(img, ColorFilter())
    segs = build_segments(mask, min_length=30.0)
    assert segs
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    xs = np.linspace(0.2, 10.0, 2000)
    ys = np.concatenate(
        [xs * np.exp(xs / 3.0), xs * np.exp(xs / 4.0), xs * np.exp(xs / 5.0)]
    )
    y0, y1 = float(ys.min()), float(ys.max())
    cal = _cal_from_frame(img, 0.2, 10.0, y0, y1, log_y=True)
    pred = [pixel_to_data(cal, p) for p in filled]
    err, y_span = _rms_against_funcs(
        pred,
        [
            lambda x: x * math.exp(x / 3.0),
            lambda x: x * math.exp(x / 4.0),
            lambda x: x * math.exp(x / 5.0),
        ],
        0.2,
        10.0,
    )
    assert err <= 0.02 * y_span
    assert_not_worse("segment_fill_ref_gnuplot_xlogy_rms", err, lower_is_better=True)
```

The `ref_dir` fixture comes from Phase 0 `backend/tests/reference/conftest.py` and skips when `PLOTDIG_REF_DIR` is missing. Synthetic tests in `test_segments.py` cover spacing, corners, and the 0.5 % gate without the corpus.

- [ ] **Step 6: Run reference tests**

Run: `cd backend && .venv/bin/pytest tests/reference/test_segment_fill_reference.py -v`

Expected without corpus: SKIP (all three). Expected with corpus: FAIL until `fill_segment` exists, then PASS, or FAIL at the RMS assert. If RMS exceeds 2 % of Y range, report the measured value; do not loosen the gate. Then:

`cd backend && .venv/bin/pytest tests/reference/test_segment_fill_reference.py -v --update-baselines`

- [ ] **Step 7: Run the full segment suite**

Run: `cd backend && .venv/bin/pytest tests/test_segments.py tests/reference/test_segment_fill_reference.py -v`

Expected: PASS, with reference tests skipped when the corpus is absent.

- [ ] **Step 8: Commit**

```bash
git add backend/app/cv/segments.py backend/tests/test_segments.py \
  backend/tests/reference/test_segment_fill_reference.py \
  backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
feat: fill segments at a fixed pixel spacing with optional corners

Arc-length sampling plus snap-to-ink turns a clicked stroke into
evenly spaced points; 30° vertices are kept when fill_corners is on.
EOF
)"
```

---

### Task 3: Improve v2

**Files:**
- Create: `backend/tests/test_improve_v2.py`
- Create: `backend/tests/reference/test_improve_v2_reference.py`
- Modify: `backend/app/cv/improve.py`
- Modify: `backend/app/pipeline/pipeline.py` (`run_cv_improve` passes the shared mask)
- Modify: `backend/tests/reference/baselines/metrics.json`
- Test (must keep passing): `backend/tests/test_cv_improve.py`

**Interfaces:**
- Consumes: Phase 2 `build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray` (defined in this same `pipeline.py` module; no import) and `snap_to_ink`; Phase 2 `build_filter_mask` + `ColorFilter`; Task 1/2 unused here; existing `order_points_along_curve`, `resample_path`, `_corridor_mask`, `_bbox_from_hints`.
- Produces: `improve_curve_from_hints(image_bytes: bytes, color_hex: str, hint_points: list[tuple[float, float]], target_count: int, mask: np.ndarray | None = None) -> list[Point]`. Four positional args unchanged. When `mask` is None, decode the image and use `build_filter_mask(img, ColorFilter())`. Corridor-from-seeds is ANDed with that mask. Empty corridor (`countNonZero < 10`) or failed decode → `resample_path(hints, target_count)`. Keep `_is_near_white` and `_sample_color_from_hints` defined in this module (`erase.py` imports them).

Call `build_curve_mask(session, image_bytes, curve_id)` with the encoded PNG bytes already held by the pipeline function. Do not reimplement colour filter or grid removal.

- [ ] **Step 1: Write the v1 baseline recorder (characterises current Improve, no production change)**

Create `backend/tests/test_improve_v2.py`:

```python
from __future__ import annotations

import math

import pytest

from app.cv.improve import improve_curve_from_hints
from app.models.schemas import Curve, Point, Session
from app.pipeline.pipeline import run_cv_improve
from tests.metrics import assert_not_worse, rms_error
from tests.synth.plotgen import render_plot


def _sine_plot():
    return render_plot(
        lambda x: math.sin(x),
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )


def _offset_hints(plot, n: int = 5, offset_px: float = 3.0):
    xs = [2.0 * math.pi * i / (n - 1) for i in range(n)]
    hints = []
    for x in xs:
        px, py = plot.pixel_of(x, math.sin(x))
        hints.append((px, py + offset_px))
    return hints


def _encode(plot) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".png", plot.image)
    assert ok
    return buf.tobytes()


def _rms_for_hints(plot, hints, target=24) -> float:
    image_bytes = _encode(plot)
    points = improve_curve_from_hints(image_bytes, "#0000ff", hints, target)
    pred = [plot.data_of(p.pixel[0], p.pixel[1]) for p in points]
    return rms_error(pred, plot.truth)


def test_improve_v1_records_synth_sine_rms():
    plot = _sine_plot()
    hints = _offset_hints(plot)
    err = _rms_for_hints(plot, hints)
    assert_not_worse("improve_v1_synth_sine_rms", err, lower_is_better=True)


def test_improve_v1_records_synth_line_rms():
    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(-1.0, 6.0),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )
    hints = []
    for x in (1.0, 4.0, 7.0, 9.0):
        px, py = plot.pixel_of(x, 0.5 * x)
        hints.append((px, py + 3.0))
    err = _rms_for_hints(plot, hints, target=16)
    assert_not_worse("improve_v1_synth_line_rms", err, lower_is_better=True)


def test_improve_white_corridor_falls_back_to_resample():
    import io

    from PIL import Image

    img = Image.new("RGB", (200, 100), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    hints = [(30.0, 40.0), (90.0, 40.0), (160.0, 40.0)]
    points = improve_curve_from_hints(buf.getvalue(), "#ff0000", hints, target_count=8)
    assert len(points) == 8
    assert points[0].pixel[0] == pytest.approx(30.0, abs=1.0)
    assert points[-1].pixel[0] == pytest.approx(160.0, abs=1.0)


def test_improve_signature_still_accepts_four_positional_args():
    plot = _sine_plot()
    hints = _offset_hints(plot)
    points = improve_curve_from_hints(_encode(plot), "#0000ff", hints, 12)
    assert len(points) == 12
```

- [ ] **Step 2: Record the v1 numbers**

Run: `cd backend && .venv/bin/pytest tests/test_improve_v2.py -v --update-baselines`

Expected: PASS (v1 still in `improve.py`). Then run without `--update-baselines` to confirm the frozen keys load.

Run: `cd backend && .venv/bin/pytest tests/test_improve_v2.py -v`

Expected: PASS.

- [ ] **Step 3: Commit the frozen v1 baseline (before rewriting Improve)**

```bash
git add backend/tests/test_improve_v2.py backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
test: freeze Improve v1 RMS baselines before the shared-mask rewrite

Later v2 must beat these numbers on the same synthetic fixtures.
EOF
)"
```

- [ ] **Step 4: Write the failing v2-beats-v1 tests (still against v1 — they must fail once we assert strict improvement after the rewrite; add them now so the rewrite has a target)**

Append to `backend/tests/test_improve_v2.py`:

```python
import json
from pathlib import Path

BASELINE = Path(__file__).resolve().parent / "reference" / "baselines" / "metrics.json"


def _v1(name: str) -> float:
    data = json.loads(BASELINE.read_text())
    assert name in data, f"missing frozen v1 key {name}"
    return float(data[name])


def test_improve_v2_sine_strictly_better_than_v1():
    plot = _sine_plot()
    err = _rms_for_hints(plot, _offset_hints(plot))
    v1 = _v1("improve_v1_synth_sine_rms")
    assert err < v1
    assert_not_worse("improve_v2_synth_sine_rms", err, lower_is_better=True)


def test_improve_v2_line_strictly_better_than_v1():
    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(-1.0, 6.0),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )
    hints = []
    for x in (1.0, 4.0, 7.0, 9.0):
        px, py = plot.pixel_of(x, 0.5 * x)
        hints.append((px, py + 3.0))
    err = _rms_for_hints(plot, hints, target=16)
    v1 = _v1("improve_v1_synth_line_rms")
    assert err < v1
    assert_not_worse("improve_v2_synth_line_rms", err, lower_is_better=True)


def test_run_cv_improve_still_replaces_points_via_pipeline():
    plot = _sine_plot()
    image_bytes = _encode(plot)
    hints = _offset_hints(plot)
    session = Session(
        image_meta={"width": 800, "height": 600, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#0000ff",
                target_point_count=10,
                points=[Point(pixel=h, origin="user") for h in hints],
            )
        ],
    )
    result = run_cv_improve(session, image_bytes, "c1")
    assert len(result.curves[0].points) == 10
```

Create `backend/tests/reference/test_improve_v2_reference.py`:

```python
from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.calibration.calibration import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.improve import improve_curve_from_hints
from app.models.schemas import Calibration, CalibrationAxis, ColorFilter, RefPoint
from tests.metrics import assert_not_worse, rms_error
from tests.reference.refcorpus import sample_image


pytestmark = pytest.mark.reference

BASELINE = Path(__file__).resolve().parents[1] / "reference" / "baselines" / "metrics.json"


def _v1(name: str) -> float:
    data = json.loads(BASELINE.read_text())
    return float(data[name])


def test_improve_v2_gnuplot_xy_strictly_better_than_v1(ref_dir):
    img = sample_image(ref_dir, "gnuplot_x_y_lines_nogrid.png")
    ok, buf = cv2.imencode(".png", img)
    assert ok
    image_bytes = buf.tobytes()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    dark = (gray < 40).astype(np.uint8) * 255
    h_rows = np.where(dark.sum(axis=1) > 0.35 * dark.shape[1] * 255)[0]
    v_cols = np.where(dark.sum(axis=0) > 0.35 * dark.shape[0] * 255)[0]
    x_left, x_right = float(v_cols.min()), float(v_cols.max())
    y_top, y_bottom = float(h_rows.min()), float(h_rows.max())
    xs = np.linspace(-10.0, 10.0, 2000)
    ys = xs * np.sin(xs / 3.0)
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=-10.0),
                RefPoint(pixel=(x_right, y_bottom), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(x_left, y_bottom), value=float(ys.min())),
                RefPoint(pixel=(x_left, y_top), value=float(ys.max())),
            ],
        ),
        source="manual",
    )
    hints = [
        (x_left + 0.2 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
        (x_left + 0.5 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
        (x_left + 0.8 * (x_right - x_left), (y_top + y_bottom) / 2 + 4.0),
    ]
    mask = build_filter_mask(img, ColorFilter())
    points = improve_curve_from_hints(
        image_bytes, "#0000ff", hints, 24, mask=mask
    )
    pred = [pixel_to_data(cal, p.pixel) for p in points]
    truth = [(float(x), float(x * math.sin(x / 3.0))) for x in xs]
    err = rms_error(pred, truth)
    key = "improve_v1_ref_gnuplot_xy_rms"
    data = json.loads(BASELINE.read_text())
    if key not in data:
        assert_not_worse(key, err, lower_is_better=True)
        pytest.skip("v1 gnuplot key recorded this run; re-run after v2 rewrite")
    assert err < _v1(key)
    assert_not_worse("improve_v2_ref_gnuplot_xy_rms", err, lower_is_better=True)
```

Because this reference test cannot record v1 after the rewrite, record it **before** Step 6:

Run: `cd backend && .venv/bin/pytest tests/reference/test_improve_v2_reference.py -v --update-baselines`

If the corpus is absent: SKIP. If present: writes `improve_v1_ref_gnuplot_xy_rms` on the first run (the skip path after writing). Re-run once so the key exists, then proceed. Commit the json if it changed:

```bash
git add backend/tests/reference/test_improve_v2_reference.py backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
test: freeze Improve v1 RMS on the gnuplot line sample

Corpus-gated; skipped when PLOTDIG_REF_DIR is absent.
EOF
)"
```

- [ ] **Step 5: Run v2 comparison tests against still-v1 Improve**

Run: `cd backend && .venv/bin/pytest tests/test_improve_v2.py::test_improve_v2_sine_strictly_better_than_v1 -v`

Expected: FAIL with `AssertionError` (`err < v1` is false because err == v1 within noise, or `err == v1`). That is the required red before the rewrite. If it accidentally passes because of RMS jitter, tighten the seeds (`offset_px=3.0` is fixed) rather than weakening the assertion.

- [ ] **Step 6: Rewrite `improve.py` (keep helpers `erase.py` needs)**

Replace the body of `improve_curve_from_hints` and `_snap_polyline_to_mask`. Do **not** delete `_sample_color_from_hints`, `_is_near_white`, `_bgr_to_hex`, `_corridor_mask`, or `_bbox_from_hints`.

Full file `backend/app/cv/improve.py`:

```python
from __future__ import annotations

import cv2
import numpy as np

from app.cv.color_filter import build_filter_mask
from app.cv.order import order_points_along_curve
from app.cv.resample import resample_path
from app.cv.snap import snap_to_ink
from app.models.schemas import ColorFilter, Point


def _bbox_from_hints(
    hints: list[tuple[float, float]],
    width: int,
    height: int,
    padding: int = 24,
) -> tuple[int, int, int, int]:
    xs = [h[0] for h in hints]
    ys = [h[1] for h in hints]
    x0 = max(0, int(min(xs)) - padding)
    y0 = max(0, int(min(ys)) - padding)
    x1 = min(width, int(max(xs)) + padding)
    y1 = min(height, int(max(ys)) + padding)
    return x0, y0, max(1, x1 - x0), max(1, y1 - y0)


def _corridor_mask(
    hints: list[tuple[float, float]],
    shape: tuple[int, ...],
    radius: int = 30,
) -> np.ndarray:
    mask = np.zeros(shape[:2], dtype=np.uint8)
    pts = np.array(
        [[int(round(x)), int(round(y))] for x, y in hints],
        dtype=np.int32,
    )
    thickness = max(8, radius)
    if len(pts) >= 2:
        cv2.polylines(mask, [pts], False, 255, thickness=thickness)
    elif len(pts) == 1:
        cv2.circle(mask, tuple(pts[0]), radius, 255, -1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius, radius))
    return cv2.dilate(mask, kernel)


def _bgr_to_hex(b: int, g: int, r: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def _is_near_white(hex_color: str, thresh: int = 235) -> bool:
    hx = hex_color.lstrip("#")
    if len(hx) != 6:
        return False
    r, g, b = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
    return r >= thresh and g >= thresh and b >= thresh


def _sample_color_from_hints(
    img: np.ndarray,
    hints: list[tuple[float, float]],
    fallback_hex: str,
) -> tuple[str, int]:
    """Kept for erase.py; not used by Improve v2 thresholding."""
    height, width = img.shape[:2]
    dark_samples: list[np.ndarray] = []
    center_samples: list[np.ndarray] = []

    for x, y in hints:
        xi, yi = int(round(x)), int(round(y))
        if 0 <= yi < height and 0 <= xi < width:
            center_samples.append(img[yi, xi])
        y0, y1 = max(0, yi - 4), min(height, yi + 5)
        x0, x1 = max(0, xi - 4), min(width, xi + 5)
        patch = img[y0:y1, x0:x1].reshape(-1, 3)
        if patch.size == 0:
            continue
        lum = patch[:, 0] * 0.114 + patch[:, 1] * 0.587 + patch[:, 2] * 0.299
        darkest_n = max(1, len(patch) // 4)
        darkest = patch[np.argsort(lum)[:darkest_n]]
        dark_samples.append(darkest)

    if not dark_samples:
        return fallback_hex, 100

    stacked = np.vstack(dark_samples)
    med = np.median(stacked, axis=0)
    hex_color = _bgr_to_hex(int(med[0]), int(med[1]), int(med[2]))

    if _is_near_white(hex_color) and center_samples:
        center = np.median(np.vstack(center_samples), axis=0)
        hex_color = _bgr_to_hex(int(center[0]), int(center[1]), int(center[2]))

    spread = float(np.std(stacked, axis=0).mean())
    tolerance = int(max(25, min(55, spread * 2 + 22)))
    return hex_color, tolerance


def _local_direction(
    points: list[tuple[float, float]], index: int
) -> tuple[float, float] | None:
    if len(points) < 2:
        return None
    if index <= 0:
        a, b = points[0], points[1]
    elif index >= len(points) - 1:
        a, b = points[-2], points[-1]
    else:
        a, b = points[index - 1], points[index + 1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = float(np.hypot(dx, dy))
    if norm < 1e-9:
        return None
    return (dx / norm, dy / norm)


def _snap_polyline_to_mask(
    hints: list[tuple[float, float]],
    mask: np.ndarray,
    target_count: int,
) -> list[Point]:
    dense_n = max(target_count * 4, len(hints) * 2, 20)
    guide = [p.pixel for p in resample_path(hints, dense_n)]
    if int(cv2.countNonZero(mask)) < 10:
        return resample_path(hints, target_count)
    snapped: list[tuple[float, float]] = []
    for i, pt in enumerate(guide):
        snapped.append(snap_to_ink(mask, pt, direction=_local_direction(guide, i)))
    return resample_path(snapped, target_count)


def improve_curve_from_hints(
    image_bytes: bytes,
    color_hex: str,
    hint_points: list[tuple[float, float]],
    target_count: int,
    mask: np.ndarray | None = None,
) -> list[Point]:
    hint_points = order_points_along_curve(hint_points)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return resample_path(hint_points, target_count)

    if mask is None:
        mask = build_filter_mask(img, ColorFilter())

    corridor = _corridor_mask(hint_points, img.shape)
    x, y, w, h = _bbox_from_hints(hint_points, img.shape[1], img.shape[0])
    roi = np.zeros_like(mask)
    roi[y : y + h, x : x + w] = 255
    masked = cv2.bitwise_and(mask, corridor)
    masked = cv2.bitwise_and(masked, roi)
    if int(cv2.countNonZero(masked)) < 10:
        return resample_path(hint_points, target_count)

    # color_hex stays in the signature for callers; thresholding uses `mask`.
    return _snap_polyline_to_mask(hint_points, masked, target_count)
```

In `backend/app/pipeline/pipeline.py`, change `run_cv_improve` to:

```python
def run_cv_improve(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> Session:
    curve = _require_curve(session, curve_id)
    if len(curve.points) < 2:
        raise ValueError("At least 2 tuned points are required to improve a curve")

    hint_points = [p.pixel for p in curve.points]
    shared_mask = build_curve_mask(session, image_bytes, curve_id)
    new_points = improve_curve_from_hints(
        image_bytes,
        curve.cv_color,
        hint_points,
        curve.target_point_count,
        mask=shared_mask,
    )
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session
```

`build_curve_mask` is defined in this same `backend/app/pipeline/pipeline.py` module. Do not import it.

- [ ] **Step 7: Run v2 tests, existing Improve tests, and erase tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_improve_v2.py tests/test_cv_improve.py tests/test_erase.py -v --update-baselines
```

Expected: PASS. `test_improve_v2_sine_strictly_better_than_v1` and `test_improve_v2_line_strictly_better_than_v1` must be strictly less than the frozen v1 keys. Existing `test_cv_improve.py` cases (red corridor, rainbow display colour, vertical segment, scrambled hints, pipeline replace) must still pass. `test_erase.py` must still import `_is_near_white` / `_sample_color_from_hints`.

If a fixture is not strictly better: do not edit the gate. Record both RMS values in the task report and stop.

Immediately after the rewrite, stop the v1 recorder tests from calling Improve (they would overwrite the frozen v1 keys on `--update-baselines`). Replace `test_improve_v1_records_synth_sine_rms` and `test_improve_v1_records_synth_line_rms` with:

```python
def test_improve_v1_baseline_keys_remain_frozen():
    data = json.loads(BASELINE.read_text())
    assert "improve_v1_synth_sine_rms" in data
    assert "improve_v1_synth_line_rms" in data
    # Must not remeasure — v2 lives in improve.py now.
```

Keep `test_improve_white_corridor_falls_back_to_resample` and `test_improve_signature_still_accepts_four_positional_args` as behaviour tests of current Improve.

Then run without `--update-baselines`:

```bash
cd backend && .venv/bin/pytest tests/test_improve_v2.py tests/test_cv_improve.py tests/test_erase.py tests/reference/test_improve_v2_reference.py -v
```

Expected: PASS, reference skipped without corpus.

- [ ] **Step 8: Commit**

```bash
git add backend/app/cv/improve.py backend/app/pipeline/pipeline.py \
  backend/tests/test_improve_v2.py \
  backend/tests/reference/test_improve_v2_reference.py \
  backend/tests/reference/baselines/metrics.json
git commit -m "$(cat <<'EOF'
feat: snap Improve through the shared curve mask

Replace 9×9 dark-quartile tracing with colour-filter + grid-removal
mask and subpixel snap-to-ink; keep the public four-arg entry point.
EOF
)"
```

---

### Task 4: Segment API and auto-digitize UI

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/pipeline/pipeline.py`
- Modify: `backend/app/api/sessions.py`
- Create: `backend/tests/test_segment_api.py`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/lib/segments.ts`
- Create: `frontend/src/lib/__tests__/segments.test.ts`
- Create: `frontend/src/components/AutoDigitizePanel.tsx`
- Modify: `frontend/src/components/EditorCanvas.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `build_segments`, `segment_at`, `fill_segment` (Tasks 1–2); `build_curve_mask(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray` (same `pipeline.py` module, no import); `order_points_along_curve`; Phase 1 `CanvasMode` (already the full six-value union including `'segment-fill'`; do not redeclare); Phase 3 implements the `'segment-fill'` handler; existing `session_store.push_history`, `SessionPublic`.
- Produces:
  - `WorkspaceState.point_separation: float = 25.0`
  - `WorkspaceState.min_segment_length: float = 2.0`
  - `WorkspaceState.fill_corners: bool = False`
  - `POST /sessions/{id}/curves/{curve_id}/segments` → `{segments: [{index, length, points}]}` (no undo)
  - `POST /sessions/{id}/curves/{curve_id}/segment-fill` body `{pixel, separation?, fill_corners?}` → `SessionPublic` (pushes undo)
  - `list_curve_segments(session, image_bytes, curve_id) -> list[dict]`
  - `run_segment_fill(session, image_bytes, curve_id, pixel, separation, fill_corners) -> Session`
  - TS: `nearestSegment`, `flattenPolyline`, `formatSeparation`
  - Client: `listCurveSegments`, `fillCurveSegment`

No component rendering tests (no testing-library).

- [ ] **Step 1: Write failing frontend helper tests**

Create `frontend/src/lib/segments.ts` is later; first create `frontend/src/lib/__tests__/segments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  flattenPolyline,
  formatSeparation,
  nearestSegment,
  type SegmentLite,
} from '../segments'

const horizontal: SegmentLite = {
  index: 0,
  length: 100,
  points: [
    [10, 40],
    [110, 40],
  ],
}

const vertical: SegmentLite = {
  index: 1,
  length: 80,
  points: [
    [200, 10],
    [200, 90],
  ],
}

describe('nearestSegment', () => {
  it('returns the closest segment within maxDistance', () => {
    const hit = nearestSegment([horizontal, vertical], [50, 42], 12)
    expect(hit?.index).toBe(0)
  })

  it('returns null beyond maxDistance', () => {
    expect(nearestSegment([horizontal], [50, 80], 12)).toBeNull()
  })
})

describe('flattenPolyline', () => {
  it('flattens to Konva points', () => {
    expect(flattenPolyline(horizontal.points)).toEqual([10, 40, 110, 40])
  })
})

describe('formatSeparation', () => {
  it('formats whole pixels', () => {
    expect(formatSeparation(25)).toBe('25 px')
    expect(formatSeparation(25.4)).toBe('25 px')
  })
})
```

- [ ] **Step 2: Run frontend tests to verify they fail**

Run: `cd frontend && npm test -- src/lib/__tests__/segments.test.ts`

Expected: FAIL with `Cannot find module '../segments'` (Phase 0 already added `"test": "vitest run"`).

- [ ] **Step 3: Implement `frontend/src/lib/segments.ts`**

```ts
export type SegmentLite = {
  index: number
  length: number
  points: [number, number][]
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distToPolyline(pixel: [number, number], points: [number, number][]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (points.length === 1) {
    return Math.hypot(pixel[0] - points[0][0], pixel[1] - points[0][1])
  }
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(
      pixel[0],
      pixel[1],
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1],
    )
    if (d < best) best = d
  }
  return best
}

export function nearestSegment(
  segments: SegmentLite[],
  pixel: [number, number],
  maxDistance = 12,
): SegmentLite | null {
  let best: SegmentLite | null = null
  let bestD = maxDistance
  for (const seg of segments) {
    const d = distToPolyline(pixel, seg.points)
    if (d <= bestD) {
      bestD = d
      best = seg
    }
  }
  return best
}

export function flattenPolyline(points: [number, number][]): number[] {
  const out: number[] = []
  for (const [x, y] of points) {
    out.push(x, y)
  }
  return out
}

export function formatSeparation(px: number): string {
  return `${Math.round(px)} px`
}
```

- [ ] **Step 4: Run frontend helpers**

Run: `cd frontend && npm test -- src/lib/__tests__/segments.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing API tests**

Create `backend/tests/test_segment_api.py`:

```python
from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.models.schemas import Curve, Point

client = TestClient(app)


def _session_with_stroke():
    img = Image.new("RGB", (240, 120), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 60), (220, 60)], fill=(0, 0, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("plot.png", buf.getvalue(), "image/png")})
    assert res.status_code == 200
    session_id = res.json()["id"]
    curve = Curve(
        id="c1",
        label="A",
        color="#0000ff",
        points=[Point(pixel=(30.0, 60.0)), Point(pixel=(200.0, 60.0))],
    )
    patched = client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    assert patched.status_code == 200
    return session_id, "c1"


def test_list_segments_returns_one_stroke():
    session_id, curve_id = _session_with_stroke()
    res = client.post(f"/sessions/{session_id}/curves/{curve_id}/segments")
    assert res.status_code == 200
    body = res.json()
    assert "segments" in body
    assert len(body["segments"]) >= 1
    seg = body["segments"][0]
    assert "index" in seg and "length" in seg and "points" in seg
    assert seg["length"] > 50
    assert len(seg["points"]) >= 2


def test_segment_fill_appends_points_and_undo_restores():
    session_id, curve_id = _session_with_stroke()
    before = client.get(f"/sessions/{session_id}").json()
    n_before = len(before["curves"][0]["points"])
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/segment-fill",
        json={"pixel": [120.0, 60.0], "separation": 25.0, "fill_corners": False},
    )
    assert res.status_code == 200
    n_after = len(res.json()["curves"][0]["points"])
    assert n_after > n_before
    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    assert len(undone.json()["curves"][0]["points"]) == n_before


def test_segment_fill_miss_returns_400():
    session_id, curve_id = _session_with_stroke()
    res = client.post(
        f"/sessions/{session_id}/curves/{curve_id}/segment-fill",
        json={"pixel": [120.0, 10.0]},
    )
    assert res.status_code == 400


def test_workspace_persists_segment_settings():
    session_id, _curve_id = _session_with_stroke()
    res = client.patch(
        f"/sessions/{session_id}/preferences",
        json={
            "workspace": {
                "point_separation": 18.0,
                "min_segment_length": 5.0,
                "fill_corners": True,
            }
        },
    )
    assert res.status_code == 200
    ws = res.json()["workspace"]
    assert ws["point_separation"] == 18.0
    assert ws["min_segment_length"] == 5.0
    assert ws["fill_corners"] is True
```

- [ ] **Step 6: Run API tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_segment_api.py -v`

Expected: FAIL — `404` on `/segments` (route missing) and/or workspace fields dropped by Pydantic.

- [ ] **Step 7: Schemas, pipeline, routes**

In `backend/app/models/schemas.py`, add only these fields to the existing `WorkspaceState` class (keep every existing field):

```python
    point_separation: float = 25.0
    min_segment_length: float = 2.0
    fill_corners: bool = False
```

`WorkspaceState.canvas_mode` is already defined once by Phase 1 as the six-value `Literal["select", "place", "axis", "pick-color", "segment-fill", "point-match"]`. Phase 3 must not redeclare or narrow it; it only implements the `"segment-fill"` value (already in the Literal, no handler yet). Phase 2 already defined `show_mask`, `show_axes_checker`, `max_point_size`, `grid`, and `GridGeometrySettings`. Do not redefine Phase 1 or Phase 2 fields.

Add request/response models (same file):

```python
class SegmentPublic(BaseModel):
    index: int
    length: float
    points: list[tuple[float, float]]


class SegmentsResponse(BaseModel):
    segments: list[SegmentPublic]


class SegmentFillRequest(BaseModel):
    pixel: tuple[float, float]
    separation: float | None = Field(default=None, gt=0)
    fill_corners: bool | None = None
```

Phase 2 owns `GridGeometrySettings`. Do not redeclare it. Add the three segment fields plus the two new request models.

In `backend/app/pipeline/pipeline.py` add:

```python
from app.cv.order import order_points_along_curve
from app.cv.segments import build_segments, fill_segment, segment_at


def list_curve_segments(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
) -> list[dict]:
    _require_curve(session, curve_id)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []
    mask = build_curve_mask(session, image_bytes, curve_id)
    min_length = 2.0
    if session.workspace is not None:
        min_length = float(session.workspace.min_segment_length)
    segs = build_segments(mask, min_length=min_length)
    return [
        {"index": i, "length": seg.length, "points": seg.points}
        for i, seg in enumerate(segs)
    ]


def run_segment_fill(
    session: Session,
    image_bytes: bytes,
    curve_id: str,
    pixel: tuple[float, float],
    separation: float,
    fill_corners: bool,
) -> Session:
    curve = _require_curve(session, curve_id)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    mask = build_curve_mask(session, image_bytes, curve_id)
    min_length = 2.0
    if session.workspace is not None:
        min_length = float(session.workspace.min_segment_length)
    segs = build_segments(mask, min_length=min_length)
    hit = segment_at(segs, pixel, max_distance=12.0)
    if hit is None:
        raise ValueError("No segment within 12 px of the click")
    filled = fill_segment(
        hit, separation=separation, fill_corners=fill_corners, mask=mask
    )
    combined = [p.pixel for p in curve.points] + filled
    ordered = order_points_along_curve(combined)
    new_points = [Point(pixel=pt, origin="ai") for pt in ordered]
    session.curves = _replace_curve_points(session.curves, curve_id, new_points)
    return session
```

In `backend/app/api/sessions.py` add imports:

```python
from app.models.schemas import (
    SegmentFillRequest,
    SegmentsResponse,
)
from app.pipeline.pipeline import (
    list_curve_segments,
    run_segment_fill,
)
```

(Keep existing imports; merge into the existing `schemas` / `pipeline` import blocks.)

Add routes next to `cv_improve_curve`:

```python
@router.post("/{session_id}/curves/{curve_id}/segments", response_model=SegmentsResponse)
def list_segments(session_id: str, curve_id: str) -> SegmentsResponse:
    stored = _require(session_id)
    try:
        payload = list_curve_segments(stored.session, stored.image_bytes, curve_id)
    except ValueError as exc:
        raise _error(exc, "segments_input", str(exc)) from exc
    return SegmentsResponse(segments=payload)


@router.post(
    "/{session_id}/curves/{curve_id}/segment-fill",
    response_model=SessionPublic,
)
def segment_fill_curve(
    session_id: str, curve_id: str, body: SegmentFillRequest
) -> SessionPublic:
    stored = _require(session_id)
    ws = stored.session.workspace
    separation = body.separation if body.separation is not None else (
        ws.point_separation if ws is not None else 25.0
    )
    fill_corners = body.fill_corners if body.fill_corners is not None else (
        ws.fill_corners if ws is not None else False
    )
    try:
        session_store.push_history(stored, "segment_fill")
        stored.session = run_segment_fill(
            stored.session,
            stored.image_bytes,
            curve_id,
            body.pixel,
            separation,
            fill_corners,
        )
        session_store.update(session_id, stored.session)
    except ValueError as exc:
        raise _error(exc, "segment_fill", str(exc)) from exc
    return _to_public(stored)
```

- [ ] **Step 8: Run API tests**

Run: `cd backend && .venv/bin/pytest tests/test_segment_api.py tests/test_cv_improve.py tests/test_api.py -v`

Expected: PASS. Existing Improve and session tests still pass.

- [ ] **Step 9: Frontend types and client**

In `frontend/src/types.ts`, add to `WorkspaceState` (keep existing keys):

`CanvasMode` is already defined once in `frontend/src/types.ts` by Phase 1 as the full six-value union `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`, and the backend `WorkspaceState.canvas_mode` is the same six-value Literal. Phase 3 must not redeclare or narrow either; it only implements the `'segment-fill'` value (which is already present in the union but has no handler yet).

```ts
export interface SegmentPublic {
  index: number
  length: number
  points: [number, number][]
}

export interface WorkspaceState {
  active_curve_id?: string | null
  resample_count?: number
  unskew_mode?: 'perspective' | 'mesh'
  mesh?: MeshGridPayload | null
  canvas_mode?: CanvasMode
  show_mask?: boolean
  point_separation?: number
  min_segment_length?: number
  fill_corners?: boolean
}
```

Do not add a second `export type CanvasMode`. Phase 2 already exported the extra workspace fields (`show_mask`, …). Add only `point_separation`, `min_segment_length`, `fill_corners`, and `SegmentPublic`. Do not redeclare `CanvasMode` or add `canvas_mode` (Phase 1 already has both).

In `frontend/src/api/client.ts` append:

```ts
import type { SegmentPublic, Session } from '../types'

export async function listCurveSegments(
  id: string,
  curveId: string,
): Promise<{ segments: SegmentPublic[] }> {
  return request<{ segments: SegmentPublic[] }>(
    `/sessions/${id}/curves/${curveId}/segments`,
    { method: 'POST' },
  )
}

export async function fillCurveSegment(
  id: string,
  curveId: string,
  body: {
    pixel: [number, number]
    separation?: number
    fill_corners?: boolean
  },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/segment-fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

Merge the `SegmentPublic` import into the existing `import type` line rather than adding a second import.

- [ ] **Step 10: AutoDigitizePanel**

Create `frontend/src/components/AutoDigitizePanel.tsx`:

```tsx
import { formatSeparation } from '../lib/segments'

interface Props {
  busy: boolean
  disabled: boolean
  active: boolean
  pointSeparation: number
  minSegmentLength: number
  fillCorners: boolean
  onPointSeparationChange: (n: number) => void
  onMinSegmentLengthChange: (n: number) => void
  onFillCornersChange: (v: boolean) => void
  onEnterSegmentFill: () => void
}

export function AutoDigitizePanel({
  busy,
  disabled,
  active,
  pointSeparation,
  minSegmentLength,
  fillCorners,
  onPointSeparationChange,
  onMinSegmentLengthChange,
  onFillCornersChange,
  onEnterSegmentFill,
}: Props) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Auto digitize</h3>
      <div className="flex flex-col gap-2 text-[11px] text-slate-300">
        <label className="flex items-center justify-between gap-2">
          Point separation
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={2}
              max={200}
              value={pointSeparation}
              disabled={busy}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) {
                  onPointSeparationChange(Math.min(200, Math.max(2, n)))
                }
              }}
              className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            />
            {formatSeparation(pointSeparation)}
          </span>
        </label>
        <label className="flex items-center justify-between gap-2">
          Min segment length
          <input
            type="number"
            min={0}
            max={500}
            value={minSegmentLength}
            disabled={busy}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) {
                onMinSegmentLengthChange(Math.min(500, Math.max(0, n)))
              }
            }}
            className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fillCorners}
            disabled={busy}
            onChange={(e) => onFillCornersChange(e.target.checked)}
          />
          Fill corners (turns ≥ 30°)
        </label>
        <button
          type="button"
          disabled={busy || disabled}
          title={
            disabled
              ? 'Select a curve first'
              : 'Click a stroke on the plot to drop evenly spaced points'
          }
          onClick={onEnterSegmentFill}
          className={`rounded px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
            active ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          Segment fill
        </button>
      </div>
    </section>
  )
}
```

Point-match controls stay out of this panel until Phase 4.

- [ ] **Step 11: EditorCanvas `segment-fill` mode**

Phase 1 already has `canvasMode: CanvasMode` on `EditorCanvas` (place-points is `canvasMode === 'place'`). This task adds hover highlight + click-to-fill for the existing `'segment-fill'` value; do not redeclare `CanvasMode`.

1. Change the Konva import to include `Line`:

```ts
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
```

2. Add to `Props`:

```ts
import type { SegmentLite } from '../lib/segments'
import { flattenPolyline, nearestSegment } from '../lib/segments'

// Phase 1 already has canvasMode: CanvasMode on Props. Add:
  segments: SegmentLite[]
  onSegmentFillClick: (pixel: [number, number]) => void
```

Phase 1 already imports `CanvasMode`; do not re-import or redeclare it. Do not add a second `canvasMode` prop. Place-points remains `canvasMode === 'place'`.

3. Inside `EditorCanvas`, add hover state and use it in `handleMouseMove` / `handleStageMouseDown`. Insert after the existing hooks:

```ts
  const [hoverSegIndex, setHoverSegIndex] = useState<number | null>(null)
  const filling = canvasMode === 'segment-fill'
```

In `handleStageMouseDown`, after the pan-gesture return and before marquee, add:

```ts
    if (filling) {
      onSegmentFillClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
```

At the start of `handleMouseMove`, after computing `[x, y]`:

```ts
    if (filling) {
      const hit = nearestSegment(segments, toOriginalCoords([x, y]), 12)
      setHoverSegIndex(hit ? hit.index : null)
      return
    }
```

When `canvasMode` leaves `'segment-fill'`, clear hover:

```ts
  useEffect(() => {
    if (!filling) setHoverSegIndex(null)
  }, [filling])
```

Disable stage drag while filling (same pattern as place mode). In the `Stage` `draggable` prop, add `&& !filling`. In `handleMouseUp` restore drag with `setStageDraggable(!filling && canvasMode !== 'place' && !axisPlaceStep && spaceDownRef.current)`.

4. After the curves' points are rendered, draw the hover polyline (logical pixels mapped with `toDisplayCoords`):

```tsx
          {filling &&
            segments.map((seg) => {
              const pts = flattenPolyline(seg.points.map((p) => toDisplayCoords(p)))
              const active = hoverSegIndex === seg.index
              return (
                <Line
                  key={seg.index}
                  points={pts}
                  stroke={active ? '#38bdf8' : '#38bdf866'}
                  strokeWidth={(active ? 4 : 2) / totalScale}
                  listening={false}
                  lineCap="round"
                  lineJoin="round"
                />
              )
            })}
```

5. Extend `PlotInteractionHint` with a `segmentFill?: boolean` prop:

```ts
  } else if (segmentFill) {
    text = `Click a highlighted stroke to drop evenly spaced points. Esc: exit. ${panHint}`
```

Pass `segmentFill={filling}` from `EditorCanvas`.

- [ ] **Step 12: Wire `App.tsx`**

Imports: add `fillCurveSegment`, `listCurveSegments` to the client import; add `AutoDigitizePanel`; import `SegmentPublic` from `./types`. Phase 1 already imported `CanvasMode`; do not re-import or redeclare it.

Phase 1 already stores `canvasMode` in React state. Add only:

```ts
  const [pointSeparation, setPointSeparation] = useState(25)
  const [minSegmentLength, setMinSegmentLength] = useState(2)
  const [fillCorners, setFillCorners] = useState(false)
  const [segments, setSegments] = useState<SegmentPublic[]>([])
```

When applying workspace from a session, restore the three fields:

```ts
    if (ws?.point_separation !== undefined) setPointSeparation(ws.point_separation)
    if (ws?.min_segment_length !== undefined) setMinSegmentLength(ws.min_segment_length)
    if (ws?.fill_corners !== undefined) setFillCorners(ws.fill_corners)
    if (ws?.canvas_mode) setCanvasMode(ws.canvas_mode)
```

Include them in `saveWorkspaceQuiet`'s workspace object:

```ts
      const workspace = {
        ...(session?.workspace ?? {}),
        active_curve_id: activeCurveId,
        resample_count: resampleCount,
        unskew_mode: mode,
        mesh: meshState ? meshToPayload(meshState) : null,
        point_separation: pointSeparation,
        min_segment_length: minSegmentLength,
        fill_corners: fillCorners,
        canvas_mode: canvasMode,
      }
```

Add `pointSeparation`, `minSegmentLength`, `fillCorners`, `canvasMode` to that callback's dependency list.

Esc exits segment-fill. Add this keydown effect next to Phase 2's canvas-mode handlers:

```ts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (canvasMode === 'segment-fill') {
        setCanvasMode('select')
        setSegments([])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvasMode])
```

Load segments when entering the mode:

```ts
  const loadSegments = useCallback(async () => {
    if (!session || !activeCurveId) return
    try {
      const body = await listCurveSegments(session.id, activeCurveId)
      setSegments(body.segments)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not build segments')
      setSegments([])
    }
  }, [session, activeCurveId])

  const enterSegmentFill = () => {
    if (!activeCurveId) return
    setAxisPlaceStep(null)
    setCanvasMode('segment-fill')
    setSelectedPointIds([])
    void loadSegments()
  }
```

Place-points in CurveList must leave segment-fill. Phase 1 already maps the CurveList place-points control onto `setCanvasMode('place' | 'select')`. Keep that mapping and clear axis placement when enabling place:

```ts
            onAddPointModeChange={(enabled) => {
              setCanvasMode(enabled ? 'place' : 'select')
              if (enabled) setAxisPlaceStep(null)
            }}
```

Fill click handler:

```ts
  const handleSegmentFillClick = (pixel: [number, number]) => {
    if (!session || !activeCurveId) return
    run(
      () =>
        fillCurveSegment(session.id, activeCurveId, {
          pixel,
          separation: pointSeparation,
          fill_corners: fillCorners,
        }),
      'Filling segment…',
    )
  }
```

Pass new props into `EditorCanvas`:

```tsx
              canvasMode={canvasMode}
              segments={segments}
              onSegmentFillClick={handleSegmentFillClick}
```

Do not pass `addPointMode`. Place-points is `canvasMode === 'place'`.

In the aside, above `CurveList` and below Phase 2 `FilterPanel`:

```tsx
          <AutoDigitizePanel
            busy={busy}
            disabled={!activeCurveId}
            active={canvasMode === 'segment-fill'}
            pointSeparation={pointSeparation}
            minSegmentLength={minSegmentLength}
            fillCorners={fillCorners}
            onPointSeparationChange={(n) => {
              setPointSeparation(n)
            }}
            onMinSegmentLengthChange={(n) => {
              setMinSegmentLength(n)
            }}
            onFillCornersChange={setFillCorners}
            onEnterSegmentFill={enterSegmentFill}
          />
```

Autosave already watches the workspace fields once they are in `saveWorkspaceQuiet`. Add `pointSeparation`, `minSegmentLength`, and `fillCorners` to the existing workspace autosave effect deps (the one that calls `saveWorkspaceQuiet` when `activeCurveId` / `resampleCount` change). When min length changes while filling, call `void loadSegments()`.

```ts
  useEffect(() => {
    if (canvasMode === 'segment-fill') void loadSegments()
  }, [canvasMode, minSegmentLength, activeCurveId, loadSegments])
```

- [ ] **Step 13: Run frontend unit tests and backend API tests**

Run:

```bash
cd frontend && npm test
cd backend && .venv/bin/pytest tests/test_segment_api.py tests/test_cv_improve.py tests/test_api.py -v
```

Expected: PASS.

Manual UI (browser, if the app is running): enter Segment fill, hover a stroke (highlight), click (points appear), Undo restores, Improve and Densify buttons still work. If browser tools are unavailable, the API + vitest commands above are the verification; note that in the task report.

- [ ] **Step 14: Commit**

```bash
git add backend/app/models/schemas.py backend/app/pipeline/pipeline.py \
  backend/app/api/sessions.py backend/tests/test_segment_api.py \
  frontend/src/types.ts frontend/src/api/client.ts \
  frontend/src/lib/segments.ts frontend/src/lib/__tests__/segments.test.ts \
  frontend/src/components/AutoDigitizePanel.tsx \
  frontend/src/components/EditorCanvas.tsx frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat: click-to-fill segments from the auto-digitize panel

Expose segment listing and fill over HTTP and add a canvas mode
that highlights the stroke under the cursor before filling it.
EOF
)"
```

---

### Task 5: Surface remove-from-plot

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/CurveList.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `backend/tests/test_remove_from_plot_api.py`
- Modify: `README.md`
- Modify: `UPDATES.md`

**Interfaces:**
- Consumes: existing `POST /sessions/{id}/curves/{curve_id}/remove-from-plot` (`sessions.remove_curve_from_plot`), which already calls `session_store.push_history(stored, "remove_from_plot")` then `run_remove_curve_from_plot` / `update_working_image`. Undo path is `POST /sessions/{id}/undo` (see `backend/tests/test_undo_image.py`).
- Produces: `removeCurveFromPlot(id: string, curveId: string): Promise<Session>`; per-curve button in `CurveList` with `window.confirm`, disabled while `busy`.

- [ ] **Step 1: Write the failing API tests**

Create `backend/tests/test_remove_from_plot_api.py`:

```python
from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.models.schemas import Curve, Point

client = TestClient(app)


def _session_with_red_line():
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 70), (110, 10)], fill=(255, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    original = buf.getvalue()
    res = client.post("/sessions", files={"file": ("plot.png", original, "image/png")})
    assert res.status_code == 200
    session_id = res.json()["id"]
    curve = Curve(
        id="c1",
        label="A",
        color="#ff0000",
        points=[Point(pixel=(20.0, 60.0)), Point(pixel=(100.0, 20.0))],
    )
    patched = client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    assert patched.status_code == 200
    return session_id, original


def test_remove_from_plot_changes_image_and_undo_restores_bytes():
    session_id, original = _session_with_red_line()
    before = client.get(f"/sessions/{session_id}/image")
    assert before.status_code == 200
    assert before.content == original

    erased = client.post(f"/sessions/{session_id}/curves/c1/remove-from-plot")
    assert erased.status_code == 200
    assert erased.json()["image_meta"]["revision"] >= 1

    after = client.get(f"/sessions/{session_id}/image")
    assert after.status_code == 200
    assert after.content != original

    undone = client.post(f"/sessions/{session_id}/undo")
    assert undone.status_code == 200
    restored = client.get(f"/sessions/{session_id}/image")
    assert restored.content == original
    assert undone.json()["image_meta"]["revision"] == 0


def test_remove_from_plot_requires_two_points():
    img = Image.new("RGB", (80, 60), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("plot.png", buf.getvalue(), "image/png")})
    session_id = res.json()["id"]
    curve = Curve(id="c1", label="A", color="#ff0000", points=[Point(pixel=(10.0, 10.0))])
    client.patch(
        f"/sessions/{session_id}/curves",
        json={"curves": [curve.model_dump()]},
    )
    bad = client.post(f"/sessions/{session_id}/curves/c1/remove-from-plot")
    assert bad.status_code == 400
```

This route already exists, so these tests should pass once written — they are characterisation + the missing HTTP coverage. If `test_remove_from_plot_changes_image_and_undo_restores_bytes` fails, fix the undo path before adding UI.

- [ ] **Step 2: Run API tests**

Run: `cd backend && .venv/bin/pytest tests/test_remove_from_plot_api.py tests/test_undo_image.py -v`

Expected: PASS.

- [ ] **Step 3: Client method**

Append to `frontend/src/api/client.ts`:

```ts
export async function removeCurveFromPlot(id: string, curveId: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/remove-from-plot`, {
    method: 'POST',
  })
}
```

- [ ] **Step 4: CurveList button**

Add to `Props`:

```ts
  onRemoveFromPlot: (curveId: string) => void
```

Destructure `onRemoveFromPlot` in the function signature.

In the per-curve button row, after Improve:

```tsx
              <button
                type="button"
                disabled={busy || curve.points.length < 2}
                title={
                  curve.points.length < 2
                    ? 'Place at least 2 points before erasing this curve from the image'
                    : 'Erase this curve from the plot image (Undo restores the image)'
                }
                className="rounded bg-rose-900/70 px-2 py-1 text-[11px] hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Erase "${curve.label}" from the plot image? This can be undone.`,
                    )
                  ) {
                    return
                  }
                  onRemoveFromPlot(curve.id)
                }}
              >
                Remove from plot
              </button>
```

- [ ] **Step 5: App wiring**

Import `removeCurveFromPlot` from `./api/client`. Pass into `CurveList`:

```tsx
            onRemoveFromPlot={(curveId) =>
              session &&
              run(
                () => removeCurveFromPlot(session.id, curveId),
                'Removing curve from plot…',
              )
            }
```

`busy` already disables the button; `run()` is the busy state. Server-side undo is the existing header Undo button.

- [ ] **Step 6: Docs**

Insert this entry at the top of the Changelog in `UPDATES.md` (immediately under `## Changelog`), bumping `2.4.0` → `2.5.0` (Phase 2 ships `2.4.0` immediately before this phase):

```markdown
## [2.5.0] — 2026-09-04 — Segment-fill auto-digitize
### Added
- Column-run segment builder (`cv/segments.py`): compact polylines from the per-curve binary mask; collinear fold; min-length drop.
- Segment fill: click a stroke to drop arc-length samples at `point_separation`; optional 30° corner vertices; snap-to-ink on the curve mask.
- Segment API (`POST .../segments`, `POST .../segment-fill`) and AutoDigitizePanel with `segment-fill` canvas hover/click.
- Remove-from-plot control on each curve (confirm + undo) so overlapping strokes can be erased before the next fill.
### Changed
- Improve v2 snaps through the shared colour-filter / grid-removal mask instead of a 9×9 dark-quartile colour sample; four-arg public entry point unchanged.
```

`README.md` — How It Works step 5: mention **Segment fill** (click a stroke) beside Improve/Densify. Typical Workflow, after Improve/Densify: add one step that optional **Remove from plot** erases the active curve from the working image (Undo restores it) so overlapping strokes can be traced next. Architecture diagram: add AutoDigitizePanel next to CurveList and `cv/segments.py` next to the other cv modules. Touch no other markdown.

- [ ] **Step 7: Run the verification suite**

```bash
cd backend && .venv/bin/pytest tests/test_segments.py tests/test_improve_v2.py \
  tests/test_cv_improve.py tests/test_erase.py tests/test_segment_api.py \
  tests/test_remove_from_plot_api.py tests/test_undo_image.py tests/test_api.py -v
cd frontend && npm test
```

Expected: PASS. Then:

```bash
cd backend && .venv/bin/pytest tests/reference/test_segment_fill_reference.py \
  tests/reference/test_improve_v2_reference.py -v
```

Expected: SKIP without corpus, PASS with corpus.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/CurveList.tsx \
  frontend/src/App.tsx backend/tests/test_remove_from_plot_api.py \
  README.md UPDATES.md
git commit -m "$(cat <<'EOF'
feat: expose remove-from-plot on each curve

The erase route already pushed undo; the UI now confirms and calls it
so overlapping strokes can be cleared before the next fill.
EOF
)"
```

---

## Self-Review

**1. Spec coverage.** Phase 3 slice of spec §5.2 (shared mask → segment builder + improve v2), §6 (`point_separation`, `min_segment_length`, `fill_corners`), §7 (`Segment`, `build_segments`, `segment_at`, `fill_segment`), §8 (`POST .../segments`, `POST .../segment-fill`, existing remove-from-plot UI), §9 AutoDigitizePanel + `segment-fill` mode, §10.4 segment-fill RMS gates and Improve-v2-strictly-better. Point-match, polar/map, FilterPanel, and affine/projective calibration stay in other phases. Spec §9 also lists point-match max size on AutoDigitizePanel — deferred to Phase 4 as required by this phase's task list.

**2. Placeholder scan.** No TBD/TODO, no "add error handling", no "similar to Task N" without repeating code, no "write tests for the above" without the tests. `fill_segment` optional `mask` is spelled out. Crossing count is exactly 2 with rationale. Corner threshold is `CORNER_TURN_DEG = 30`.

**3. Type consistency.** `Segment.points: list[tuple[float, float]]` / `length: float` is what `fill_segment` and the API serialize. `SegmentPublic` / `SegmentLite` use `points: [number, number][]`. Workspace field names match spec: `point_separation`, `min_segment_length`, `fill_corners`. Improve entry point remains `improve_curve_from_hints(image_bytes, color_hex, hint_points, target_count, mask=None)`. `build_curve_mask` is called as `(session, image_bytes, curve_id)` in pipeline code. **Do not redeclare `CanvasMode` or `WorkspaceState.canvas_mode`.** Phase 1 already defines both once as the six-value union/Literal `'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'`. A second `export type CanvasMode` in `types.ts` is a duplicate-identifier typecheck failure; restating or narrowing the backend Literal is the same defect. Phase 3 only implements the `'segment-fill'` handler (value already in the union, no handler yet). Reviewer: grep `types.ts` for `export type CanvasMode` (exactly one) and `schemas.py` for `canvas_mode: Literal` (exactly one, six values, not re-opened in this phase).

Known deviations from the brief/spec (intentional, recorded):

- `fill_segment` takes a keyword-only `mask` so spec §7's three positional arguments still work, while Task 2's snap-to-ink requirement has a place to live.
- `improve_curve_from_hints` gains optional `mask`; the four positional arguments are unchanged.
- `build_curve_mask` takes encoded `image_bytes` as its second argument (`session, image_bytes, curve_id`), matching the other public pipeline functions; decoding happens inside.
- AutoDigitizePanel in this phase does not include point-match max size / point-match mode (Phase 4).
- Improve v2 ignores `color_hex` for thresholding (shared `ColorFilter` / passed-in mask). The argument stays for compatibility; existing tests that pass a rainbow display colour still pass because the default intensity filter finds dark ink.
