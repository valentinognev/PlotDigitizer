# Image Unskew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Unskew top-bar panel that previews and applies perspective correction of plot images using the four calibration bound points.

**Architecture:** Shared homography math in `backend/app/cv/unskew.py` and `frontend/src/lib/unskew.ts` (parity via shared test vectors). Frontend renders a warped offscreen canvas for preview with inverse-mapped interactions. Backend apply endpoint runs OpenCV `warpPerspective`, remaps all pixel coordinates, and supports undo.

**Tech Stack:** Python + OpenCV + NumPy (backend), React + Konva + TypeScript (frontend), FastAPI, pytest.

**Spec:** `docs/superpowers/specs/2026-07-03-image-unskew-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/cv/unskew.py` | Create | Geometry + homography + image warp + point transform |
| `backend/tests/test_unskew.py` | Create | Unit + API tests |
| `backend/tests/fixtures/unskew_vectors.json` | Create | Shared test vectors (backend reads; frontend copies values inline) |
| `backend/app/api/sessions.py` | Modify | `POST /{id}/unskew/apply` |
| `backend/app/pipeline/pipeline.py` | Modify | `run_unskew_apply(session, image_bytes)` orchestrator |
| `frontend/src/lib/unskew.ts` | Create | TS port of geometry + canvas warp helpers |
| `frontend/src/lib/unskew.test.ts` | Create | Vitest parity tests |
| `frontend/src/components/UnskewPanel.tsx` | Create | Top-bar UI |
| `frontend/src/components/EditorCanvas.tsx` | Modify | Preview image + inverse click mapping |
| `frontend/src/App.tsx` | Modify | Preview state, panel placement, apply handler |
| `frontend/src/api/client.ts` | Modify | `applyUnskew` API call |
| `UPDATES.md` | Modify | Version bump to 2.1.0 |

---

### Task 1: Backend unskew geometry (core math)

**Files:**
- Create: `backend/app/cv/unskew.py`
- Create: `backend/tests/fixtures/unskew_vectors.json`
- Create: `backend/tests/test_unskew.py`
- Test: `backend/tests/test_unskew.py`

- [ ] **Step 1: Add fixture with one known skewed quad**

Create `backend/tests/fixtures/unskew_vectors.json`:

```json
{
  "axis_points": {
    "xmin": [100, 400],
    "xmax": [500, 350],
    "ymin": [120, 380],
    "ymax": [80, 80]
  },
  "expected": {
    "width": 412.3,
    "height": 316.2,
    "origin": [108.5, 392.1],
    "dest_bl": [0, 0],
    "dest_tr": [412, 316]
  }
}
```

(Exact floats will be finalized when implementation runs; tests use `pytest.approx`.)

- [ ] **Step 2: Write failing tests**

Create `backend/tests/test_unskew.py`:

```python
import json
from pathlib import Path

import numpy as np
import pytest

from app.cv.unskew import (
    UnskewError,
    apply_homography_to_point,
    compute_unskew_homography,
    warp_image,
)

FIXTURE = Path(__file__).parent / "fixtures" / "unskew_vectors.json"


def _load():
    return json.loads(FIXTURE.read_text())


def test_compute_homography_from_axis_points():
    data = _load()
    p = data["axis_points"]
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
    )
    exp = data["expected"]
    assert result.width == pytest.approx(exp["width"], rel=0.01)
    assert result.height == pytest.approx(exp["height"], rel=0.01)
    bl = apply_homography_to_point(result.matrix, (0, 0), inverse=True)
    assert bl[0] == pytest.approx(exp["origin"][0], abs=1.0)
    assert bl[1] == pytest.approx(exp["origin"][1], abs=1.0)


def test_parallel_axes_raises():
    with pytest.raises(UnskewError, match="parallel"):
        compute_unskew_homography(
            xmin=(0, 0), xmax=(10, 0), ymin=(0, 5), ymax=(10, 5)
        )


def test_warp_image_output_size():
    data = _load()
    p = data["axis_points"]
    result = compute_unskew_homography(
        xmin=tuple(p["xmin"]),
        xmax=tuple(p["xmax"]),
        ymin=tuple(p["ymin"]),
        ymax=tuple(p["ymax"]),
    )
    src = np.zeros((600, 700, 3), dtype=np.uint8)
    out = warp_image(src, result.matrix, result.width, result.height)
    assert out.shape[1] == int(round(result.width))
    assert out.shape[0] == int(round(result.height))
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_unskew.py -v`  
Expected: FAIL — `ModuleNotFoundError` or `ImportError`

- [ ] **Step 4: Implement `backend/app/cv/unskew.py`**

```python
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

from app.models.schemas import Calibration, Curve, RefPoint


class UnskewError(ValueError):
    pass


@dataclass(frozen=True)
class UnskewResult:
    matrix: np.ndarray  # 3x3, maps source -> dest
    width: float
    height: float


def _line_intersection(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    p4: tuple[float, float],
) -> tuple[float, float]:
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        raise UnskewError("Axis lines are parallel")
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return float(px), float(py)


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    length = math.hypot(v[0], v[1])
    if length < 1e-9:
        raise UnskewError("Degenerate axis direction")
    return v[0] / length, v[1] / length


def _project_point_on_line(
    point: tuple[float, float],
    line_a: tuple[float, float],
    line_b: tuple[float, float],
) -> tuple[float, float]:
    ax, ay = line_a
    bx, by = line_b
    px, py = point
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom < 1e-9:
        raise UnskewError("Degenerate axis line")
    t = ((px - ax) * dx + (py - ay) * dy) / denom
    return ax + t * dx, ay + t * dy


def _gram_schmidt_y(x_dir: tuple[float, float], raw_y: tuple[float, float]) -> tuple[float, float]:
    dot = raw_y[0] * x_dir[0] + raw_y[1] * x_dir[1]
    y = (raw_y[0] - dot * x_dir[0], raw_y[1] - dot * x_dir[1])
    return _normalize(y)


def _quad_area(a, b, c, d) -> float:
    # Shoelace for quad a,b,c,d
    pts = [a, b, d, c]
    area = 0.0
    for i in range(4):
        j = (i + 1) % 4
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    return abs(area) * 0.5


def compute_unskew_homography(
    xmin: tuple[float, float],
    xmax: tuple[float, float],
    ymin: tuple[float, float],
    ymax: tuple[float, float],
) -> UnskewResult:
    origin = _line_intersection(xmin, xmax, ymin, ymax)
    br = _project_point_on_line(xmax, xmin, xmax)
    tl = _project_point_on_line(ymax, ymin, ymax)

    x_raw = _normalize((br[0] - origin[0], br[1] - origin[1]))
    y_raw = (tl[0] - origin[0], tl[1] - origin[1])
    y_dir = _gram_schmidt_y(x_raw, y_raw)

    width = math.hypot(br[0] - origin[0], br[1] - origin[1])
    height = math.hypot(tl[0] - origin[0], tl[1] - origin[1])
    if width < 1 or height < 1:
        raise UnskewError("Degenerate plot area")

    tr = (origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
          origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]))

    src = np.float32([origin, br, tr, tl])
    dst = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
    if _quad_area(tuple(src[0]), tuple(src[1]), tuple(src[2]), tuple(src[3])) < 1:
        raise UnskewError("Degenerate plot area")

    matrix = cv2.getPerspectiveTransform(src, dst)
    return UnskewResult(matrix=matrix, width=width, height=height)


def apply_homography_to_point(
    matrix: np.ndarray,
    point: tuple[float, float],
    *,
    inverse: bool = False,
) -> tuple[float, float]:
    m = np.linalg.inv(matrix) if inverse else matrix
    v = np.array([point[0], point[1], 1.0], dtype=np.float64)
    out = m @ v
    if abs(out[2]) < 1e-12:
        raise UnskewError("Point at infinity under homography")
    return float(out[0] / out[2]), float(out[1] / out[2])


def warp_image(image: np.ndarray, matrix: np.ndarray, width: float, height: float) -> np.ndarray:
    w, h = int(round(width)), int(round(height))
    return cv2.warpPerspective(image, matrix, (w, h))


def homography_from_calibration(calibration: Calibration) -> UnskewResult:
    from app.calibration.calibration import CalibrationError
    from frontend_compat import get_axis_bounds  # NOT USED - use inline extraction below
```

**Important:** Do not import frontend code. Instead add a helper in the same file:

```python
def _bounds_from_calibration(calibration: Calibration) -> tuple[tuple[float,float], ...]:
    from app.calibration.calibration import _extreme_ref_index  # if private, duplicate logic
    ...
```

Prefer duplicating the extreme-ref lookup (same as `getAxisBounds` in TS) to avoid coupling:

```python
def bounds_pixels_from_calibration(cal: Calibration) -> tuple[tuple[float,float], tuple[float,float], tuple[float,float], tuple[float,float]]:
    xi = _extreme_ref_index(cal.x.ref_points, "x", "min")
    xa = _extreme_ref_index(cal.x.ref_points, "x", "max")
    yi = _extreme_ref_index(cal.y.ref_points, "y", "min")
    ya = _extreme_ref_index(cal.y.ref_points, "y", "max")
    xmin = tuple(cal.x.ref_points[xi].pixel)
    xmax = tuple(cal.x.ref_points[xa].pixel)
    ymin = tuple(cal.y.ref_points[yi].pixel)
    ymax = tuple(cal.y.ref_points[ya].pixel)
    return xmin, xmax, ymin, ymax
```

Copy `_extreme_ref_index` from `calibration.py` as module-private `_extreme_ref_index` in `unskew.py`.

Add session remapping:

```python
def remap_session_pixels(session, matrix: np.ndarray) -> None:
    if session.calibration:
        for axis in (session.calibration.x, session.calibration.y):
            for ref in axis.ref_points:
                ref.pixel = apply_homography_to_point(matrix, ref.pixel)
    for curve in session.curves:
        for pt in curve.points:
            pt.pixel = apply_homography_to_point(matrix, pt.pixel)
```

- [ ] **Step 5: Run tests and update fixture expected values**

Run: `cd backend && .venv/bin/pytest tests/test_unskew.py -v`  
If expected values differ, print actual `result.width`, `result.height`, origin from a one-off script and update fixture.

Expected: PASS

---

### Task 2: Backend apply endpoint + pipeline

**Files:**
- Modify: `backend/app/pipeline/pipeline.py`
- Modify: `backend/app/api/sessions.py`
- Modify: `backend/tests/test_unskew.py`

- [ ] **Step 1: Write failing API test**

Append to `backend/tests/test_unskew.py`:

```python
def test_unskew_apply_endpoint(client, sample_session):
    session_id = sample_session["id"]
    # sample_session fixture must have calibration with 4 bounds; adjust conftest if needed
    res = client.post(f"/sessions/{session_id}/unskew/apply")
    assert res.status_code == 200
    body = res.json()
    assert body["image_meta"]["revision"] >= 1
```

Check `conftest.py` for `sample_session` — ensure it sets calibration with non-degenerate bounds. If not, extend fixture.

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd backend && .venv/bin/pytest tests/test_unskew.py::test_unskew_apply_endpoint -v`

- [ ] **Step 3: Add pipeline function**

In `backend/app/pipeline/pipeline.py`:

```python
def run_unskew_apply(session: Session, image_bytes: bytes) -> tuple[Session, bytes]:
    if session.calibration is None:
        raise ValueError("Calibration required for unskew")
    import cv2
    import numpy as np
    from app.cv.unskew import (
        bounds_pixels_from_calibration,
        compute_unskew_homography,
        remap_session_pixels,
        warp_image,
    )

    xmin, xmax, ymin, ymax = bounds_pixels_from_calibration(session.calibration)
    result = compute_unskew_homography(xmin, xmax, ymin, ymax)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    warped = warp_image(img, result.matrix, result.width, result.height)
    ok, buf = cv2.imencode(".png", warped)
    if not ok:
        raise ValueError("Failed to encode warped image")
    remap_session_pixels(session, result.matrix)
    session.image_meta.width = int(round(result.width))
    session.image_meta.height = int(round(result.height))
    return session, buf.tobytes()
```

- [ ] **Step 4: Add API route**

In `backend/app/api/sessions.py`:

```python
@router.post("/{session_id}/unskew/apply", response_model=SessionPublic)
def apply_unskew(session_id: str) -> SessionPublic:
    stored = _require(session_id)
    if stored.session.calibration is None:
        raise _error(ValueError("Set calibration bounds first"), "unskew_no_calibration")
    try:
        session_store.push_history(stored, "unskew_apply")
        new_session, new_image = run_unskew_apply(stored.session, stored.image_bytes)
        stored.session = new_session
        session_store.update_working_image(session_id, new_image)
        session_store.update(session_id, stored.session)
    except UnskewError as exc:
        raise _error(exc, "unskew_invalid", "Adjust axis bounds") from exc
    except ValueError as exc:
        raise _error(exc, "unskew_input", str(exc)) from exc
    stored = session_store.require(session_id)
    return _to_public(stored)
```

Import `run_unskew_apply` from pipeline and `UnskewError` from `app.cv.unskew`.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && .venv/bin/pytest -q`  
Expected: PASS

---

### Task 3: Frontend unskew math (parity)

**Files:**
- Create: `frontend/src/lib/unskew.ts`
- Create: `frontend/src/lib/unskew.test.ts`

- [ ] **Step 1: Write failing vitest**

Create `frontend/src/lib/unskew.test.ts` with same axis_points from fixture and assert width/height approx match.

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd frontend && npm test -- unskew.test.ts`  
(Use project's test runner; if no vitest configured, add minimal vitest or test via `npm run build` typecheck only and rely on backend tests — check `package.json`.)

- [ ] **Step 3: Implement `frontend/src/lib/unskew.ts`**

Export:

```typescript
export class UnskewError extends Error {}

export interface UnskewTransform {
  matrix: number[] // 3x3 row-major flat length 9
  width: number
  height: number
}

export function computeUnskewHomography(
  xmin: [number, number],
  xmax: [number, number],
  ymin: [number, number],
  ymax: [number, number],
): UnskewTransform

export function applyHomography(
  matrix: number[],
  point: [number, number],
  inverse?: boolean,
): [number, number]

export function isUnskewReady(calibration: Calibration | null): boolean

export function preSkewAngleDeg(...): number | null // for optional warning
```

Port Python logic exactly. For homography, use pure TS implementation of `getPerspectiveTransform` (4-point DLT) or a tiny dependency — prefer no new dependency: implement 4-point perspective transform via solving 8x8 linear system.

Add canvas helper:

```typescript
export async function warpImageToCanvas(
  image: HTMLImageElement,
  transform: UnskewTransform,
): Promise<HTMLCanvasElement>
```

Use offscreen canvas + `drawImage` with manual pixel warp OR `WebGL`/`cv` — simplest v1: use 2D canvas per-pixel inverse sampling (slow for large images) OR use CSS matrix if affine-only.

**For homography preview:** use inverse mapping: for each dest pixel, sample src via `applyHomography(matrix, [x,y], true)`. Acceptable for plot-sized images (<2000px). Optimize later if needed.

- [ ] **Step 4: Run tests — PASS**

---

### Task 4: UnskewPanel component

**Files:**
- Create: `frontend/src/components/UnskewPanel.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create panel**

```tsx
interface Props {
  ready: boolean
  previewActive: boolean
  canApply: boolean
  status: string
  onTogglePreview: (on: boolean) => void
  onApply: () => void
  onCancelPreview: () => void
  busy: boolean
}
```

Match styling of `CalibrationPanel` (compact top bar, `text-[11px]`, slate borders).

- [ ] **Step 2: Wire into App.tsx top bar**

Insert `<UnskewPanel />` **before** `<CalibrationPanel />` in the horizontal bar at line ~528.

State in App:

```typescript
const [unskewPreview, setUnskewPreview] = useState(false)
const unskewReady = isUnskewReady(calibration)
const unskewStatus = ... // derive message
```

Reset `unskewPreview` on session change / upload.

Handlers:

```typescript
const handleApplyUnskew = () =>
  session && run(() => applyUnskew(session.id), 'Applying unskew…').then(() => setUnskewPreview(false))
```

- [ ] **Step 3: Manual smoke test**

Upload image, place bounds, toggle preview, apply.

---

### Task 5: EditorCanvas preview mode

**Files:**
- Modify: `frontend/src/components/EditorCanvas.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Extend EditorCanvas props**

```typescript
unskewPreview?: UnskewTransform | null
```

When `unskewPreview` is set:

1. Load original `image` as today  
2. Call `warpImageToCanvas(image, unskewPreview)` → use as display image  
3. Use `unskewPreview.width/height` for coordinate space of display  
4. Forward-transform calibration marks and curve points for rendering  
5. On click/drag: `applyHomography(matrix, displayPt, true)` before calling parent handlers  

- [ ] **Step 2: Compute transform in App when preview toggled**

```typescript
const unskewTransform = useMemo(() => {
  if (!unskewPreview || !calibration) return null
  const bounds = getAxisBounds(calibration)
  if (!bounds) return null
  try {
    return computeUnskewHomography(
      bounds.xmin.pixel,
      bounds.xmax.pixel,
      bounds.ymin.pixel,
      bounds.ymax.pixel,
    )
  } catch {
    return null
  }
}, [unskewPreview, calibration])
```

Recompute when calibration bounds change during preview.

- [ ] **Step 3: Add API client**

In `frontend/src/api/client.ts`:

```typescript
export async function applyUnskew(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/unskew/apply`, { method: 'POST' })
}
```

- [ ] **Step 4: Verify interaction**

- Drag calibration mark in preview → stored pixel updates in original space  
- Apply → canvas shows new image without preview toggle; bounds appear axis-aligned  

---

### Task 6: UPDATES.md + verification

**Files:**
- Modify: `UPDATES.md`

- [ ] **Step 1: Bump version to 2.1.0**

```markdown
## [2.1.0] — 2026-07-03
### Added
- **Unskew panel:** preview and apply perspective correction from calibration axis bounds (Xmin/Xmax/Ymin/Ymax); remaps image, calibration marks, and curve points on apply.
```

- [ ] **Step 2: Full verification**

Run: `cd backend && .venv/bin/pytest -q`  
Run: `cd frontend && npm run build`  
Manual: upload skewed photo → place bounds → preview → apply → place points.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Reuse calibration bounds | Task 1 `bounds_pixels_from_calibration`, Task 5 |
| Preview-only until apply | Task 4 state, Task 5 canvas |
| Apply remaps all coords | Task 2 pipeline |
| Frontend preview + backend apply | Tasks 3–5 + Task 2 |
| Undo support | Task 2 `push_history` |
| Validation / errors | Task 1 `UnskewError`, Task 4 status |
| Tests | Tasks 1–3, 6 |
| UPDATES bump | Task 6 |

No placeholder steps remain.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-image-unskew.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement task-by-task in this session with checkpoints  

Which approach do you want?
