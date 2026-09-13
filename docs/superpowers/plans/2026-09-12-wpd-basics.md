# WPD Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the everyday WebPlotDigitizer capabilities PlotDigitizer still lacks — precision placement UX, a numeric data table, spatial-mask + averaging-window / Δx extract, date and bar axes, multiple named calibrations, and one-click colour-pick extract — without VLM/AI and without copying AGPL WPD source.

**Architecture:** Pixels stay the source of truth. New CV tools consume the existing per-curve `build_curve_mask` (colour filter + optional grid removal), optionally AND-ed with a painted region. Date values are Unix-days floats inside the existing 2D transform. Bar charts are a new `coords_type`. Multiple calibrations are a list on the session with `Curve.calibration_id`. Colour-pick extract is `suggest_filter` + averaging-window in one undoable call.

**Tech Stack:** Python 3, FastAPI, Pydantic v2, NumPy, OpenCV (headless), Pillow, pytest; React 19, TypeScript, Konva, Plotly, Tailwind, Vite, Vitest. No new runtime dependencies. No SciPy, no scikit-image, no FFTW.

**Spec:** This file. There is no separate design doc. Executors treat **Global Constraints**, **File map**, and **Frozen signatures** as the spec.

## Global Constraints

1. **No VLM / AI Assist.** Do not reintroduce Detect, cloud vision, or any external model. Colour-pick extract is classical CV only.
2. **Licence hygiene.** WPD frontend is AGPL-3.0. Do **not** copy or transcribe files from `/home/valentin/Projects/t/WebPlotDigitizer/`. Implement from the behaviour described in this plan using OpenCV/NumPy/TypeScript.
3. **Pixels remain the source of truth.** `Point.pixel` is canonical. Data values are always derived through the active (or per-curve) calibration.
4. **Backward compatibility.** Existing sessions and `.pdproj.json` must load. Four-bound cartesian linear/log mapping stays numerically identical (1e-12). New fields are optional with defaults.
5. **TDD.** Failing test first, then minimal code. Every task records the test command.
6. **Backend/frontend parity.** Date parse/format and any new transform adapter must agree to 1e-9 on a committed fixture (`backend/tests/fixtures/date_parity.json` + TS test that reads it).
7. **Dependency floor.** Backend: existing `backend/requirements.txt` only. Frontend: no new runtime dependency. Vitest is already present.
8. **Docs.** `UPDATES.md` gets one new top entry per completed phase (feature → `subver`). `README.md` only when architecture changes. No other markdown except this plan (already exists).
9. **No commits unless the user asked.** Skip every Commit step unless this session has an explicit commit request. Never `git push`, never merge, never commit to `master`.
10. **CanvasMode union.** Extend the existing six-value union in **both** `frontend/src/types.ts` and `backend/app/models/schemas.py` `WorkspaceState.canvas_mode` together. Do not redeclare a narrowed union.

**Phase version pins** (current HEAD is `2.10.1`):

| Phase | Bump | Title |
|-------|------|--------|
| 1 | `2.11.0` | Precision UX (magnifier, nudge, readout, drop) |
| 2 | `2.12.0` | Data table + copy |
| 3 | `2.13.0` | Region mask + averaging window + Δx |
| 4 | `2.14.0` | Date/time axes |
| 5 | `2.15.0` | Bar charts |
| 6 | `2.16.0` | Multiple named calibrations |
| 7 | `2.17.0` | Colour-pick auto-extract |

Each phase is independently shippable: after it, `cd backend && .venv/bin/pytest -q` and `cd frontend && npm test` must pass.

---

## File map

| File | Phase | Action | Responsibility |
|------|-------|--------|----------------|
| `frontend/src/lib/nudge.ts` | 1 | Create | Arrow-key pixel deltas |
| `frontend/src/lib/cursorReadout.ts` | 1 | Create | Pixel + data-space label |
| `frontend/src/lib/magnifier.ts` | 1 | Create | Source-rect for the zoom inset |
| `frontend/src/lib/imageDrop.ts` | 1 | Create | File from drag-and-drop |
| `frontend/src/components/MagnifierView.tsx` | 1 | Create | 160×160 blit + crosshair |
| `frontend/src/components/EditorCanvas.tsx` | 1,3,5 | Modify | Hover pixel, mask tools, bar labels |
| `frontend/src/App.tsx` | 1–7 | Modify | Wire keys, drop, panels, new APIs |
| `frontend/src/lib/dataTable.ts` | 2 | Create | Rows, sort, format, clipboard text |
| `frontend/src/components/DataTablePanel.tsx` | 2 | Create | Table UI under preview |
| `backend/app/cv/region.py` | 3 | Create | Rasterize boxes/strokes to a mask |
| `backend/app/cv/averaging_window.py` | 3 | Create | Column-blob extract |
| `backend/app/cv/x_step.py` | 3 | Create | Data-space Δx sample of a polyline |
| `backend/app/models/schemas.py` | 3–7 | Modify | Region, filter mode, date, bar, calibrations |
| `backend/app/pipeline/pipeline.py` | 3,7 | Modify | AND region into `build_curve_mask`; extract runners |
| `backend/app/api/sessions.py` | 3–7 | Modify | New routes |
| `frontend/src/lib/regionMask.ts` | 3 | Create | Box/stroke helpers for the canvas |
| `backend/app/calibration/dates.py` | 4 | Create | Parse/format Unix-days |
| `frontend/src/lib/dates.ts` | 4 | Create | TS mirror |
| `backend/app/calibration/coords.py` | 4,5,6 | Modify | Date scale; bar adapter; per-curve cal |
| `frontend/src/lib/transform2d.ts` | 4,5 | Modify | Date + bar parity |
| `backend/app/export/export.py` | 2,4,5,6 | Modify | Format, date strings, bar columns, per-curve cal |
| `frontend/src/components/CalibrationPanel.tsx` | 4,5,6 | Modify | Date inputs, bar mode, cal list |
| `frontend/src/lib/previewChart.ts` | 4,5,6 | Modify | Date axis, bars, dual-Y |
| `backend/app/cv/color_filter.py` | 7 | Modify | `sample` mode + dominant colours |
| `frontend/src/components/AutoDigitizePanel.tsx` | 3,7 | Modify | Mask tools, Δx, Extract colour |
| `frontend/src/api/client.ts` | 1–7 | Modify | New endpoints |
| `frontend/src/types.ts` | 1–7 | Modify | Types |
| `README.md` | 1,3,7 | Modify | Workflow steps |
| `UPDATES.md` | 1–7 | Modify | Changelog |

---

## Frozen signatures (all later tasks)

```python
# Phase 1 (frontend, vitest)
NUDGE_STEP_PX = 1
NUDGE_SHIFT_STEP_PX = 10
def nudgeDelta(key: string, shift: boolean): [number, number] | null
def applyNudge(pixel: [number, number], delta: [number, number], bounds?: { w: number; h: number }): [number, number]
def formatCursorReadout(pixel: [number, number], data: [number, number] | null, coords: CoordsType | undefined): string
def magnifierSourceRect(imageW, imageH, cursor: [number, number], magnification: number, view: number): { sx: number; sy: number; sw: number; sh: number }
function fileFromDrop(data: DataTransfer | null): File | null

# Phase 2
type NumberStyle = 'ignore' | 'fixed' | 'precision' | 'exponential'
type DataTableRow = { curveId: string; curveLabel: string; pointId: string; a: number; b: number; aLabel: string; bLabel: string }
function rowsFromCurves(curves, calibration, figure?): DataTableRow[]
function sortRows(rows, key: 'a' | 'b', order: 'asc' | 'desc'): DataTableRow[]
function formatNumber(n: number, digits: number, style: NumberStyle): string
function tableToClipboardText(rows: DataTableRow[], sep: string): string

# Phase 3
class RegionBox: x: float; y: float; w: float; h: float
class RegionMask:
    boxes: list[RegionBox] = []
    strokes: list[list[tuple[float, float]]] = []
    erase_strokes: list[list[tuple[float, float]]] = []
    stroke_width: float = 20.0
def rasterize_region(width: int, height: int, region: RegionMask | None) -> np.ndarray  # uint8 {0,255}; None or empty → all 255
def averaging_window(mask: np.ndarray, dx: float = 10.0, dy: float = 10.0) -> list[tuple[float, float]]
def sample_by_x_step(
    pixels: list[tuple[float, float]],
    cal: Calibration,
    xmin: float,
    xmax: float,
    delx: float,
) -> list[tuple[float, float]]

# Phase 4
UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
def parse_axis_token(text: str) -> tuple[float, Literal["number", "date"]]
def format_unix_days(value: float, pattern: str) -> str
# Scale becomes Literal["linear", "log", "date"]
# date axis: RefPoint.value is Unix days (float); pixel_to_data still returns that float

# Phase 5
# CoordsType += "bar"
# Calibration.bar_horizontal: bool = False
# Point.label: str | None = None
def bar_pixel_to_value(cal: Calibration, pixel: tuple[float, float]) -> float

# Phase 6
# Calibration.id: str (uuid, default factory)
# Calibration.name: str = "Axes"
# Session.calibrations: list[Calibration] = []
# Session.calibration remains: if set, it is the active/legacy singleton and must round-trip
# Curve.calibration_id: str | None = None  # None → session.calibration or calibrations[0]
def calibration_for_curve(session: Session, curve: Curve) -> Calibration | None

# Phase 7
# FilterMode += "sample"
# sample: keep if rgb_dist(pixel, sample_color) / (255*sqrt(3)) <= high
def dominant_trace_colors(img_bgr: np.ndarray, limit: int = 8) -> list[str]  # hex, background excluded
def run_extract_by_color(session, image_bytes, curve_id, pixel, distance, dx, dy) -> Session
```

`build_curve_mask` after Phase 3:

```
mask = build_filter_mask(img, flt)
if region: mask = cv2.bitwise_and(mask, rasterize_region(w, h, region))
if remove_grid: mask = remove_grid(...)
```

---

# Phase 1 — Precision UX (`2.11.0`)

Magnifier inset, arrow-key nudge, cursor readout, drag-and-drop load. Frontend-only except drop reuses `uploadSession`.

### Task 1: Nudge deltas

**Files:**
- Create: `frontend/src/lib/nudge.ts`
- Test: `frontend/src/lib/__tests__/nudge.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `nudgeDelta`, `applyNudge`, `NUDGE_STEP_PX = 1`, `NUDGE_SHIFT_STEP_PX = 10`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { applyNudge, nudgeDelta } from '../nudge'

describe('nudgeDelta', () => {
  it('maps arrows to 1 px and Shift to 10 px', () => {
    expect(nudgeDelta('ArrowLeft', false)).toEqual([-1, 0])
    expect(nudgeDelta('ArrowRight', false)).toEqual([1, 0])
    expect(nudgeDelta('ArrowUp', false)).toEqual([0, -1])
    expect(nudgeDelta('ArrowDown', false)).toEqual([0, 1])
    expect(nudgeDelta('ArrowRight', true)).toEqual([10, 0])
    expect(nudgeDelta('ArrowUp', true)).toEqual([0, -10])
    expect(nudgeDelta('a', false)).toBeNull()
  })
})

describe('applyNudge', () => {
  it('adds the delta and clamps to image bounds when given', () => {
    expect(applyNudge([5, 5], [-1, 0])).toEqual([4, 5])
    expect(applyNudge([0, 0], [-1, 0], { w: 10, h: 10 })).toEqual([0, 0])
    expect(applyNudge([9, 9], [10, 10], { w: 10, h: 10 })).toEqual([10, 10])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/nudge.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
export const NUDGE_STEP_PX = 1
export const NUDGE_SHIFT_STEP_PX = 10

export function nudgeDelta(key: string, shift: boolean): [number, number] | null {
  const step = shift ? NUDGE_SHIFT_STEP_PX : NUDGE_STEP_PX
  if (key === 'ArrowLeft') return [-step, 0]
  if (key === 'ArrowRight') return [step, 0]
  if (key === 'ArrowUp') return [0, -step]
  if (key === 'ArrowDown') return [0, step]
  return null
}

export function applyNudge(
  pixel: [number, number],
  delta: [number, number],
  bounds?: { w: number; h: number },
): [number, number] {
  let x = pixel[0] + delta[0]
  let y = pixel[1] + delta[1]
  if (bounds) {
    x = Math.min(Math.max(x, 0), bounds.w)
    y = Math.min(Math.max(y, 0), bounds.h)
  }
  return [x, y]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/nudge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (skip unless the user asked)

### Task 2: Cursor readout + magnifier crop

**Files:**
- Create: `frontend/src/lib/cursorReadout.ts`, `frontend/src/lib/magnifier.ts`
- Test: `frontend/src/lib/__tests__/cursorReadout.test.ts`, `frontend/src/lib/__tests__/magnifier.test.ts`

**Interfaces:**
- Consumes: `CoordsType` from `types.ts`; `pixelToData` is **not** called here — App passes already-mapped data.
- Produces: `formatCursorReadout`, `magnifierSourceRect`.

- [ ] **Step 1: Write the failing tests**

`cursorReadout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCursorReadout } from '../cursorReadout'

describe('formatCursorReadout', () => {
  it('shows pixel only when data is null', () => {
    expect(formatCursorReadout([12.4, 8.6], null, 'cartesian')).toBe('px 12.4, 8.6')
  })
  it('appends x,y for cartesian and theta/R for polar', () => {
    expect(formatCursorReadout([10, 20], [1.5, 2.25], 'cartesian')).toBe(
      'px 10.0, 20.0  ·  x 1.5  y 2.25',
    )
    expect(formatCursorReadout([10, 20], [45, 3], 'polar')).toBe(
      'px 10.0, 20.0  ·  θ 45  R 3',
    )
  })
})
```

Pixel numbers in the pixel-only branch: one decimal. When data is present, pixel also one decimal; data uses `formatAxisValue`-like trimming (up to 6 significant, drop trailing zeros). Keep the test strings above as the contract — implement formatting to match them exactly.

`magnifier.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { magnifierSourceRect } from '../magnifier'

describe('magnifierSourceRect', () => {
  it('is magnification-scaled and centred on the cursor, clamped to the image', () => {
    const r = magnifierSourceRect(200, 100, [100, 50], 5, 160)
    expect(r.sw).toBeCloseTo(32, 5)
    expect(r.sh).toBeCloseTo(32, 5)
    expect(r.sx).toBeCloseTo(84, 5)
    expect(r.sy).toBeCloseTo(34, 5)
  })
  it('clamps so the rect stays inside the image', () => {
    const r = magnifierSourceRect(40, 40, [0, 0], 5, 160)
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(40)
    expect(r.sy + r.sh).toBeLessThanOrEqual(40)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/cursorReadout.test.ts src/lib/__tests__/magnifier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`magnifierSourceRect(imageW, imageH, cursor, magnification, view)`: `sw = view / magnification`, same for `sh`, `sx = cursor[0] - sw/2`, clamp to `[0, imageW - sw]` (if `sw > imageW`, `sx = 0` and `sw = imageW`). Same for y.

`formatCursorReadout`: pixel-only `px ${x.toFixed(1)}, ${y.toFixed(1)}`. With data, cartesian uses `x`/`y`, polar `θ`/`R`, map `x`/`y`. Format data with up to 6 significant digits; values that are integers in the test (`45`, `3`) print without decimals; `1.5` / `2.25` keep their decimals. Implement a small `fmt(n)` that uses `Number(n.toPrecision(6))` then `String`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__/cursorReadout.test.ts src/lib/__tests__/magnifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (skip unless asked)

### Task 3: Drag-and-drop file helper

**Files:**
- Create: `frontend/src/lib/imageDrop.ts`
- Test: `frontend/src/lib/__tests__/imageDrop.test.ts`

**Interfaces:**
- Consumes: same image MIME rule as `fileFromClipboardData` (`item.type.startsWith('image/')`).
- Produces: `fileFromDrop(data: DataTransfer | null): File | null`. Keep the original filename (unlike paste, which rewrites to `clipboard.png`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { fileFromDrop } from '../imageDrop'

function dt(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer
}

it('returns the first image file and ignores non-images', () => {
  const png = new File([new Uint8Array([1])], 'plot.png', { type: 'image/png' })
  const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
  expect(fileFromDrop(dt([pdf, png]))?.name).toBe('plot.png')
  expect(fileFromDrop(dt([pdf]))).toBeNull()
  expect(fileFromDrop(null)).toBeNull()
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npx vitest run src/lib/__tests__/imageDrop.test.ts`

- [ ] **Step 3: Implement `fileFromDrop` by scanning `data.files` for `type.startsWith('image/')`.**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 4: Wire magnifier, readout, nudge, drop

**Files:**
- Create: `frontend/src/components/MagnifierView.tsx`
- Modify: `frontend/src/components/EditorCanvas.tsx`, `frontend/src/App.tsx`
- Test: `frontend/src/lib/__tests__/nudge.test.ts` (already passing); add `frontend/src/lib/__tests__/nudgeKeys.test.ts` for the App key-filter helper extracted if needed.

**Interfaces:**
- Consumes: Task 1–3 helpers; existing `handleMovePoints`, `handleUpload`, `pixelToData` from `transform2d`.
- Produces: hover pixel callback; magnifier next to the plot; drop on the root layout.

**UI contract:**
- `EditorCanvas` calls `onHoverPixel(pixel | null)` on mouse move / leave (image coords, after unskew mapping via existing `toOriginalCoords`).
- `App` stores `hoverPixel`. If `calibration` is valid, `data = pixelToData(calibration, hoverPixel)` else `null`.
- Readout string is shown in `PlotInteractionHint` (or a sibling under the canvas), left-aligned, tabular.
- `MagnifierView` is 160×160, `image-rendering: pixelated`, draws the plot image cropped by `magnifierSourceRect` via a 2D canvas, black crosshair at centre. Default magnification 5. Place it in the right column **above** CurveList, or a 160px well under the canvas — do not overlap the Konva stage.
- Arrow keys: ignore when target is input/textarea/contenteditable (same guard as Delete). If `selectedPointIds.length > 0` and `nudgeDelta` is non-null, `preventDefault` and `handleMovePoints` with `applyNudge` per selected point, bounds = `image_meta` width/height.
- Drag-and-drop: on the root `div` of `App`, `onDragOver` preventDefault when `fileFromDrop` would succeed; `onDrop` preventDefault and `handleUpload`. Ignore when `busy`.

- [ ] **Step 1: Extract a tiny pure helper if App key logic needs a test**

```ts
// frontend/src/lib/nudge.ts — add:
export function shouldHandleNudgeKey(
  e: { key: string; shiftKey: boolean; target: EventTarget | null },
  selectedCount: number,
): [number, number] | null {
  if (!selectedCount) return null
  const t = e.target
  if (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  ) {
    return null
  }
  return nudgeDelta(e.key, e.shiftKey)
}
```

Add tests: selectedCount 0 → null; input target → null; ArrowRight + 1 selected → `[1,0]`.

- [ ] **Step 2: Run `nudge.test.ts` — FAIL on `shouldHandleNudgeKey` then implement.**

- [ ] **Step 3: Wire MagnifierView, hover, keys, drop as specified.** Magnifier draws with `drawImage(img, sx, sy, sw, sh, 0, 0, 160, 160)`. Pass the same HTMLImageElement / Image bitmap the canvas uses (`imageUrl`). Crosshair: 1px lines at 80,80.

- [ ] **Step 4: Run `cd frontend && npm test`**
Expected: PASS.

- [ ] **Step 5: Update `README.md` Typical Workflow (drop + arrow nudge + magnifier) and `UPDATES.md` `2.11.0`. Commit if asked.**

---

# Phase 2 — Data table + copy (`2.12.0`)

Numeric table of visible curves in data space; sort; number format; copy TSV/CSV. Frontend-derived from pixels + calibration (no new backend required). Optional: ExportPanel “Copy CSV” can reuse `tableToClipboardText`.

### Task 5: Table helpers

**Files:**
- Create: `frontend/src/lib/dataTable.ts`
- Test: `frontend/src/lib/__tests__/dataTable.test.ts`

**Interfaces:**
- Consumes: `pixelToData` from `transform2d`; `csv_coordinate_columns` semantics: cartesian/map → `x,y`; polar → `theta,R`.
- Produces: `rowsFromCurves`, `sortRows`, `formatNumber`, `tableToClipboardText`.

- [ ] **Step 1: Write the failing test** using the same `linearCal` fixture as `transform.test.ts` (copy the object, do not import from that file).

```ts
import { describe, expect, it } from 'vitest'
import { formatNumber, rowsFromCurves, sortRows, tableToClipboardText } from '../dataTable'
import type { Calibration, Curve } from '../../types'

const cal: Calibration = {
  x: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }, { pixel: [500, 400], value: 10 }] },
  y: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }, { pixel: [100, 100], value: 5 }] },
  source: 'manual',
}

it('maps visible curve pixels to data rows and skips hidden curves', () => {
  const curves: Curve[] = [
    { id: 'c1', label: 'A', color: '#f00', style: 'solid', visible: true, points: [{ id: 'p1', pixel: [300, 250], origin: 'user' }] },
    { id: 'c2', label: 'B', color: '#0f0', style: 'solid', visible: false, points: [{ id: 'p2', pixel: [300, 250], origin: 'user' }] },
  ]
  const rows = rowsFromCurves(curves, cal)
  expect(rows).toHaveLength(1)
  expect(rows[0].curveLabel).toBe('A')
  expect(rows[0].a).toBeCloseTo(5, 12)
  expect(rows[0].b).toBeCloseTo(2.5, 12)
  expect(rows[0].aLabel).toBe('x')
  expect(rows[0].bLabel).toBe('y')
})

it('sorts by a descending and formats clipboard text', () => {
  const rows = [
    { curveId: 'c', curveLabel: 'A', pointId: '1', a: 2, b: 1, aLabel: 'x', bLabel: 'y' },
    { curveId: 'c', curveLabel: 'A', pointId: '2', a: 5, b: 0, aLabel: 'x', bLabel: 'y' },
  ]
  const sorted = sortRows(rows, 'a', 'desc')
  expect(sorted.map((r) => r.a)).toEqual([5, 2])
  expect(formatNumber(1.23456, 3, 'fixed')).toBe('1.235')
  expect(formatNumber(1234, 3, 'exponential')).toBe('1.234e+3')
  expect(tableToClipboardText(sorted, ', ')).toBe('A, x, y\n, 5, 0\n, 2, 1')
})
```

Clipboard contract: first line `curveLabel, aLabel, bLabel` then one line per row `curveLabel, formattedA, formattedB` using `style: 'ignore'` (raw `String(n)` if that is shorter — for these integers print `5` and `0`). Use `formatNumber` with style `'ignore'` in `tableToClipboardText` unless a format argument is passed:

```ts
function tableToClipboardText(rows: DataTableRow[], sep: string, fmt?: { digits: number; style: NumberStyle }): string
```

For the test above, default ignore: `'A, x, y\nA, 5, 0\nA, 2, 1'` — **fix the test expectation to that** (curve label on every row, not a blank first column after the header). Update the snippet when implementing: header `curve, x, y` then `A, 5, 1` wait — use:

Header: `curve${sep}x${sep}y`  
Rows: `A${sep}5${sep}0` etc.

Final clipboard for the sort test:

```
curve, x, y
A, 5, 0
A, 2, 1
```

with `sep = ', '`.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement.** `rowsFromCurves` skips `!curve.visible`. Polar labels `theta`,`R`. Invalid calibration / `pixelToData` throw → skip that point.

- [ ] **Step 4: PASS `npx vitest run src/lib/__tests__/dataTable.test.ts`**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 6: DataTablePanel

**Files:**
- Create: `frontend/src/components/DataTablePanel.tsx`
- Modify: `frontend/src/App.tsx` (render under `PreviewChart` in the right-hand plot column, or a tab; must be visible without covering Konva)
- Test: keep Task 5 as proof; no component test required.

**UI contract:**
- Disabled / empty message when no valid calibration or no visible points.
- Columns: curve, x (or theta), y (or R).
- Sort-by select + asc/desc.
- Digits input (default 6) + style select (Ignore / Fixed / Precision / Exponential).
- **Copy** button: `navigator.clipboard.writeText(tableToClipboardText(...))`; toast `Copied N rows`.
- Compact: max-height ~12rem, overflow auto, `text-[11px]`.

- [ ] **Step 1–4: Implement panel, wire in App, `cd frontend && npm test` PASS.**

- [ ] **Step 5: `UPDATES.md` `2.12.0`. README mention View data / Copy. Commit if asked.**

---

# Phase 3 — Region mask + averaging window + Δx (`2.13.0`)

WPD’s local auto-extract loop without copying it: paint a region, colour-filter already exists, run averaging-window; optionally resample an existing polyline at Δx in data units.

### Task 7: Region rasterizer

**Files:**
- Create: `backend/app/cv/region.py`
- Test: `backend/tests/test_region.py`

**Interfaces:**
- Consumes: `RegionMask` schema (add to `schemas.py` in this task).
- Produces: `rasterize_region`.

Add to `schemas.py`:

```python
class RegionBox(BaseModel):
    x: float
    y: float
    w: float
    h: float

class RegionMask(BaseModel):
    boxes: list[RegionBox] = Field(default_factory=list)
    strokes: list[list[tuple[float, float]]] = Field(default_factory=list)
    erase_strokes: list[list[tuple[float, float]]] = Field(default_factory=list)
    stroke_width: float = Field(default=20.0, ge=1.0, le=150.0)

# Curve.region: RegionMask | None = None
```

Empty region (no boxes, no strokes) → full-white mask (no spatial restriction). If any box or stroke exists, start from zeros, fill boxes (`cv2.rectangle` inclusive, thickness -1), polylines with `cv2.polylines` + `cv2.circle` at vertices so a one-point stroke is a disk of `stroke_width/2`, then paint `erase_strokes` with 0.

- [ ] **Step 1: Failing tests**

```python
import numpy as np
from app.cv.region import rasterize_region
from app.models.schemas import RegionBox, RegionMask

def test_empty_region_is_full_white():
    m = rasterize_region(10, 8, None)
    assert m.shape == (8, 10)
    assert m.dtype == np.uint8
    assert int(m.min()) == 255

def test_box_keeps_only_the_rectangle():
    region = RegionMask(boxes=[RegionBox(x=2, y=1, w=3, h=2)])
    m = rasterize_region(10, 8, region)
    assert m[1, 2] == 255
    assert m[1, 4] == 255
    assert m[2, 2] == 255
    assert m[0, 2] == 0
    assert m[1, 1] == 0

def test_stroke_then_erase():
    region = RegionMask(
        strokes=[[(5.0, 4.0), (7.0, 4.0)]],
        erase_strokes=[[(7.0, 4.0)]],
        stroke_width=4.0,
    )
    m = rasterize_region(12, 10, region)
    assert m[4, 5] == 255
    assert m[4, 7] == 0
```

- [ ] **Step 2: `cd backend && .venv/bin/pytest tests/test_region.py -q` FAIL**

- [ ] **Step 3: Implement `rasterize_region`. Integerize boxes with `int(round(...))`. Clip to image.**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 8: Averaging window

**Files:**
- Create: `backend/app/cv/averaging_window.py`
- Test: `backend/tests/test_averaging_window.py`

**Interfaces:**
- Consumes: uint8 mask `{0,255}`.
- Produces: `averaging_window(mask, dx=10.0, dy=10.0) -> list[tuple[float,float]]`.

**Algorithm (do not port WPD source):**
1. For each integer column `x` in `[0, W)`, find contiguous y-runs where `mask[y,x] > 0`. Each run is a blob with `y = 0.5*(y0+y1)`, `x = x+0.5`.
2. Walk columns left to right. Maintain `kept: list`. For each column, among blobs, pick those not yet used.
3. Windowing: among all blobs, greedily take them in increasing x. A blob is kept if there is no already-kept point with `abs(x - xk) < dx` **and** `abs(y - yk) < dy`; if several blobs in the same column would qualify, keep **all** whose y-gap to any kept point is `>= dy` (stacked curves in one mask). If `dx` would skip a column entirely, that is intended.

Simpler contract that tests lock:

- Horizontal 1-pixel-thick line from x=10..50 at y=20, `dx=10`, `dy=10` → points at roughly x=10.5,20.5,… with y≈20.5, count in `4..6`, all `|y-20.5|<1`.
- Two horizontal lines at y=20 and y=50, same x range → two parallel series (y near 20.5 and 50.5), each with ≥4 points.
- Empty mask → `[]`.

- [ ] **Step 1: Write those three tests.**

- [ ] **Step 2: FAIL then implement.** Recommended implementation: collect all blob centres; sort by x; iterate, keep a point if no kept point satisfies `hypot` no — use the axis-aligned window `abs(dx)<dx and abs(dy)<dy` as “too close, skip”. For a single thin line this yields ~length/dx points.

- [ ] **Step 4: PASS `pytest tests/test_averaging_window.py -q`**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 9: Δx sample in data space

**Files:**
- Create: `backend/app/cv/x_step.py`
- Test: `backend/tests/test_x_step.py`

**Interfaces:**
- Consumes: `pixel_to_data`, `data_to_pixel` from `app.calibration.coords`.
- Produces: `sample_by_x_step`.

Walk the polyline in pixel space, convert vertices to data, build a piecewise-linear `y(x)` along increasing data-x (if the polyline is not monotone in x, sort vertices by data-x — this matches “sample the curve vs x”). Then for `x = xmin, xmin+delx, ... <= xmax`, interpolate y and `data_to_pixel`. Skip samples that fall outside the x-span of the polyline.

- [ ] **Step 1: Failing test** — four-bound linear cal x: px 0→0, px 100→10; y: py 100→0, py 0→10. Polyline `[(0,50),(100,50)]` (y data = 5). `xmin=0, xmax=10, delx=2.5` → 5 points, data x `{0,2.5,5,7.5,10}`, y all 5, pixels x `{0,25,50,75,100}`, y all 50.

- [ ] **Step 2–4: FAIL / implement / PASS**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 10: AND region into `build_curve_mask` + APIs

**Files:**
- Modify: `backend/app/pipeline/pipeline.py`, `backend/app/api/sessions.py`, `backend/app/models/schemas.py`, `backend/tests/test_pipeline_mask.py`
- Create: `backend/tests/test_extract_api.py`
- Modify: `frontend/src/types.ts`, `frontend/src/api/client.ts`

**Interfaces:**
- `Curve.region: RegionMask | None`
- `POST /sessions/{id}/curves/{curve_id}/averaging-window` body `{dx?: float, dy?: float, replace: bool = true}` → `SessionPublic`. Undoable (`push_history`). Points origin `"user"`.
- `POST /sessions/{id}/curves/{curve_id}/x-step` body `{xmin: float, xmax: float, delx: float, replace: bool = true}` → `SessionPublic`. Requires valid calibration. Empty curve → 400 `no_points`.
- `PATCH` curve region via existing `PATCH /curves` (`CurvesEditRequest` already replaces whole curve list) **or** add `PATCH /sessions/{id}/curves/{curve_id}/region` with `RegionMask`. Prefer the dedicated PATCH so the frontend does not send every point. Undoable.

`run_averaging_window`: `mask = build_curve_mask(...)`; `pts = averaging_window(mask, dx, dy)`; replace or append; `order_points_along_curve`.

- [ ] **Step 1: Extend `test_build_curve_mask_applies_filter_then_optional_grid` style in `test_pipeline_mask.py`:** a white image with a black box at (10,10)-(20,20) and another at (40,10)-(50,20); intensity filter keeps dark; region box only around the first → mask 255 only near the first box.

- [ ] **Step 2: HTTP tests in `test_extract_api.py`:** averaging-window on a synthetic session returns ≥1 point; x-step on a two-point line matches Task 9; missing curve 404; x-step without calibration 400.

- [ ] **Step 3: Implement pipeline + routes. Register in `sessions.py` next to segment-fill.**

- [ ] **Step 4: `cd backend && .venv/bin/pytest tests/test_pipeline_mask.py tests/test_extract_api.py tests/test_region.py tests/test_averaging_window.py tests/test_x_step.py -q` PASS**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 11: Mask canvas + AutoDigitize controls

**Files:**
- Create: `frontend/src/lib/regionMask.ts` (+ `__tests__/regionMask.test.ts`)
- Modify: `frontend/src/types.ts` (`CanvasMode` += `'mask-box' | 'mask-pen' | 'mask-erase'`; `Curve.region`; workspace `stroke_width?`)
- Modify: `EditorCanvas.tsx`, `AutoDigitizePanel.tsx`, `App.tsx`, `schemas.py` `WorkspaceState.canvas_mode`

**Interfaces:**
- `addBox(region, box): RegionMask`
- `appendStrokePoint(region, mode: 'pen' | 'erase', pixel): RegionMask` (starts a new stroke on pointer down; App owns that — keep lib as `pushPointToLastStroke`)
- Modes: box drag on empty image → one `RegionBox`; pen/erase draw polylines. Overlay: semi-transparent cyan fill of raster is **not** required if Filter mask overlay already shows the AND result — after region PATCH, bump `maskEpoch` so `GET /mask` refreshes.
- AutoDigitizePanel: **Box / Pen / Erase / Clear region**; ΔX/ΔY px inputs (default 10); **Averaging window** button; **Δx (data)** inputs xmin/xmax/delx (defaults from calibration bounds when valid) + **Sample Δx** button.
- Clear region → `region: { boxes: [], strokes: [], erase_strokes: [] }` which rasterizes as full white.

- [ ] **Step 1: `regionMask.test.ts` for addBox / pushPointToLastStroke / clear.**

- [ ] **Step 2–4: Wire UI; `npm test` and backend pytest -q PASS.**

- [ ] **Step 5: README + `UPDATES.md` `2.13.0`. Commit if asked.**

---

# Phase 4 — Date/time axes (`2.14.0`)

### Task 12: Date parse/format (Python + TS parity)

**Files:**
- Create: `backend/app/calibration/dates.py`, `frontend/src/lib/dates.ts`
- Create: `backend/tests/test_dates.py`, `frontend/src/lib/__tests__/dates.test.ts`, `backend/tests/fixtures/date_parity.json`

**Interfaces:**
- `parse_axis_token("1.5") -> (1.5, "number")`
- `parse_axis_token("2020/01/15") -> (unix_days, "date")`
- `parse_axis_token("2020-01-15 12:00:00")` accepted
- Invalid → raise `CalibrationError` / throw
- Unix days = `(aware_utc - 1970-01-01 UTC).total_seconds() / 86400`
- Default format pattern `YYYY/MM/DD` or with time `YYYY/MM/DD hh:mm:ss` if the parsed token had a time part
- `format_unix_days(value, pattern)`

Parity fixture JSON:

```json
{
  "cases": [
    {"text": "2020/01/15", "unix_days": 18276.0, "pattern": "YYYY/MM/DD"},
    {"text": "1970/01/01", "unix_days": 0.0, "pattern": "YYYY/MM/DD"}
  ]
}
```

Verify `18276` against Python `date(2020,1,15)` before freezing the file; if off-by-one, put the Python-computed value in the fixture and make TS match.

- [ ] **Step 1: Tests for parse/format round-trip and the fixture on both sides.**

- [ ] **Step 2–4: Implement independently (datetime + TS Date.UTC). Do not copy WPD Julian code.**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 13: `Scale = date` in the transform

**Files:**
- Modify: `schemas.py` (`Scale`), `coords.py` (`_to_linear_axes` / `_from_linear_axes`: `date` uses the same path as `linear` — values are already linear Unix-days), `frontend/src/types.ts`, `transform2d.ts`, `CalibrationPanel.tsx` (`BoundInput` uses `parse_axis_token`; show formatted date when scale is date)
- Test: `backend/tests/test_coords.py`, `frontend/src/lib/__tests__/transform.test.ts`

**Contract:** A cartesian cal with X scale `date`, xmin `2020/01/01` → `0` days relative… actually store Unix days in `RefPoint.value`. `pixel_to_data` returns that float. Log + date on the same axis is invalid (`validate_calibration`).

Calibration panel: when scale is Date, BoundInput is free text; on commit call `parseAxisToken` (TS); store `.value`. Display with `formatUnixDays`.

CSV export: if an axis scale is `date`, write `format_unix_days(v, "YYYY/MM/DD")` (or with time if `abs(v - round(v)) > 1e-6`).

Preview: Plotly `xaxis.type = 'date'` when x scale is date — convert unix days to `Date` ISO via `new Date(unix_days * 86400e3).toISOString()`.

- [ ] **Step 1: Backend test: date xmin/xmax map the midpoint pixel to the midpoint date. Frontend parity via existing transform tests + one date case.**

- [ ] **Step 2–4: Implement. Export test in `test_export.py` that CSV contains `2020/01/15` not a huge float.**

- [ ] **Step 5: `UPDATES.md` `2.14.0`. README calibration sentence. Commit if asked.**

---

# Phase 5 — Bar charts (`2.15.0`)

### Task 14: Bar coordinate adapter

**Files:**
- Modify: `schemas.py` (`CoordsType` += `"bar"`; `Calibration.bar_horizontal: bool = False`; `Point.label: str | None = None`)
- Create: `backend/app/calibration/bar.py` with `bar_pixel_to_value`
- Modify: `coords.py` `pixel_to_data` / `data_to_pixel` / `validate_calibration`
- Test: `backend/tests/test_bar_coords.py`
- Mirror: `frontend/src/lib/transform2d.ts`, `frontend/src/types.ts`, `frontend/src/lib/__tests__/transform2d.test.ts`

**Calibration:** two `ref_points` on the **value** axis (reuse `y.ref_points` with length 2). Pixel P1,P2 and values v1,v2. `bar_pixel_to_value` projects the query pixel onto the P1–P2 line and interpolates (linear or log via `y.scale`). `pixel_to_data` returns `(0.0, value)` for vertical bars (dummy first coord) or document as `(value, 0)` — **lock: `pixel_to_data` → `(value, 0.0)` for vertical, `(value, 0.0)` same for horizontal**; the discrete axis is `Point.label`, not a data coordinate.

`validate_calibration` for bar: `y.ref_points` length ≥ 2; distinct pixels.

- [ ] **Step 1: Test P1=(50,100) v=0, P2=(50,0) v=10, pixel (50,50) → value 5. Log: v=1 and v=100, midpoint pixel → 10.**

- [ ] **Step 2–4: Implement + TS parity.**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 15: Bar UI, preview, export

**Files:**
- Modify: `CalibrationPanel.tsx` (coords type Bar; two-point place using existing Precise/scale-bar style — **reuse scale-bar placement UX**: click P1, P2 on the value axis; numeric v1/v2; checkbox Rotated/horizontal)
- Modify: `previewChart.ts` — `type: 'bar'` traces, x = `label || point index`, y = value
- Modify: `export.py` — headers `curve_id,curve_label,label,value` when `coords_type=="bar"`
- Modify: `EditorCanvas` — optional: show `point.label` next to the marker when bar
- CurveList / place points: after placing a bar point, a small prompt is **not** required in v1; labels default `Bar N`. Add an inline rename later only if cheap: double-click in DataTable.
- Test: `backend/tests/test_export.py` bar CSV; `frontend/src/lib/__tests__/previewChart.test.ts` bar trace type

- [ ] **Step 1–4: TDD those tests then UI.**

- [ ] **Step 5: `UPDATES.md` `2.15.0`. README. Commit if asked.**

---

# Phase 6 — Multiple named calibrations (`2.16.0`)

### Task 16: Schema + `calibration_for_curve`

**Files:**
- Modify: `schemas.py` (`Calibration.id`, `Calibration.name`; `Session.calibrations: list[Calibration] = []`; `Curve.calibration_id: str | None = None`)
- Create: `backend/app/calibration/session_cal.py` with `calibration_for_curve(session, curve) -> Calibration | None`
- Modify: `project_io.py` load: if `calibrations` missing and `calibration` set, `calibrations = [calibration]`; if id missing, assign uuid
- Modify: `export.py` / `pixel_to_data` call sites to use `calibration_for_curve`
- Test: `backend/tests/test_multi_cal.py`

**Rule:** `calibration_for_curve`: if `curve.calibration_id` matches an id in `session.calibrations`, use it; else `session.calibration`; else `session.calibrations[0]` if any; else `None`.

Legacy: keep writing `session.calibration` as the active cal (the one the CalibrationPanel edits). Adding a second cal appends to `calibrations` and does not clear `calibration`.

When saving preferences with a calibration patch, also upsert that object into `calibrations` by id.

- [ ] **Step 1: Tests for legacy session (only `calibration` set), two cals + curve binding, export CSV uses each curve’s cal (two curves, two different y scales, different exported y).**

- [ ] **Step 2–4: Implement load/export/patch upsert.**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 17: Calibration list UI + preview

**Files:**
- Modify: `CalibrationPanel.tsx` — list of named axes, Add / Rename / Delete, bind active curve via CurveList select
- Modify: `CurveList.tsx` — per-curve “Axes” `<select>`
- Modify: `previewChart.ts` — `buildPreviewConfig(curves, sessionOrCals)`: map each curve through its own cal; if two distinct cartesian cals, use `yaxis` + `yaxis2` overlay (second cal → `yaxis: 'y2'`). If more than two, still plot on y/y2 by first vs rest.
- Modify: `App.tsx`, `types.ts`, `client.ts` as needed
- Test: `frontend/src/lib/__tests__/previewChart.test.ts` dual-y assignment helper extracted as `axisTrackForCurve(curve, calibrations): 'y' | 'y2'`

- [ ] **Step 1–4: TDD the helper then wire panel.**

- [ ] **Step 5: `UPDATES.md` `2.16.0`. README. Commit if asked.**

---

# Phase 7 — Colour-pick auto-extract (`2.17.0`)

Builds on Phase 3 averaging-window and existing `suggest_filter_from_pixel`. Still no VLM.

### Task 18: `sample` colour-distance filter + dominant colours

**Files:**
- Modify: `backend/app/cv/color_filter.py`, `schemas.py` `FilterMode`
- Create: `backend/tests/test_sample_filter.py`
- Modify: `frontend/src/types.ts`, `frontend/src/lib/colorFilter.ts` (`displayMax` for sample: 100 meaning percent distance)

**`sample` mode:** parse `sample_color` `#rrggbb`; `dist = ||bgr - sample|| / (255*sqrt(3))`; keep if `dist <= high` (default high 0.12). `low` ignored.

`dominant_trace_colors(img, limit=8)`:
- Compute modal background (existing `_modal_background_bgr`).
- Downsample `::4`.
- Discard pixels within 0.08 dist of background and pixels with saturation < 0.08 (axes/grid greys) **unless** the plot is grayscale — if median sat < 0.08, skip the saturation discard and instead discard luminance within 0.08 of background.
- Bucket remaining colours with a 32-level RGB cube; return top `limit` bucket means as hex, most pixels first.

- [ ] **Step 1: Tests:** red line on white → mask from `ColorFilter(mode='sample', high=0.12, sample_color='#ff0000')` keeps the red pixels not the white; `dominant_trace_colors` on a white image with a 20×20 red rectangle and a 20×20 blue rectangle includes both `#ff0000` and `#0000ff` (approx, allow 8/255 per channel).

- [ ] **Step 2–4: Implement.** Frontend `FilterPanel` select gets a `sample` option; slider is “distance %”.

- [ ] **Step 5: Commit** (skip unless asked)

### Task 19: Extract-by-colour API

**Files:**
- Modify: `pipeline.py`, `sessions.py`
- Test: `backend/tests/test_extract_api.py` (extend)

**Routes:**
- `POST /sessions/{id}/curves/{curve_id}/extract-color` body `{pixel: [x,y], distance?: float, dx?: float, dy?: float, replace?: bool}`  
  1. `flt = ColorFilter(mode='sample', high=distance or 0.12, sample_color=hex at pixel)`  
  2. set `curve.filter = flt`  
  3. `run_averaging_window`  
  4. undoable as one history entry `"extract_color"`
- `POST /sessions/{id}/dominant-colors` → `{colors: string[]}` (no mutation)
- `POST /sessions/{id}/propose-curves` body `{limit?: int, extract?: bool}` → creates one curve per dominant colour (labels `Colour 1…`, `trace_color` + `filter` sample mode). If `extract` true, also run averaging-window on each. Skip colours that produce < 3 points when extract is true. Undoable one shot.

- [ ] **Step 1: HTTP test: red stroke PNG, click a red pixel, extract-color, active curve has ≥5 points and filter.mode `sample`. dominant-colors returns the red. propose-curves with extract true yields ≥1 curve with points.**

- [ ] **Step 2–4: Implement.**

- [ ] **Step 5: Commit** (skip unless asked)

### Task 20: Colour-pick extract UI

**Files:**
- Modify: `FilterPanel.tsx`, `AutoDigitizePanel.tsx`, `App.tsx`, `client.ts`
- Test: frontend `colorFilter.test.ts` — `previewFilterFromHex` may stay; add `sampleFilterFromHex(hex, distance=0.12)`

**UI contract:**
- After **Pick colour** succeeds (existing `handlePickedPixel` / `suggestFilter`), show **Extract this colour** on AutoDigitizePanel (enabled when active curve + session). It calls `extract-color` at the last picked pixel (store `lastPickPixel` in App).
- Alternative: holding a modifier is unnecessary. One button is enough.
- **Propose curves from colours** on CurveList or AutoDigitizePanel: confirm `Create N curves from dominant colours and extract?` then `propose-curves` with `extract: true`.
- Reuse mask overlay so the user sees what will be extracted after pick (filter PATCH already happens today on pick — extract then overwrites with `sample` mode; that is intended and stricter).

- [ ] **Step 1–4: Wire buttons; `npm test` + backend pytest -q PASS.**

- [ ] **Step 5: README How It Works step 5 mentions colour-pick extract. `UPDATES.md` `2.17.0`. Commit if asked.**

---

## Out of scope (do not add in this plan)

Ternary, circular-chart recorder, webcam, PDF/multi-page, script injection, cloud Plotly, point-groups, distance/angle/area measurements, WPD AI Assist / VLM Detect, histogram algo as a separate named tool (bar extraction may come later).

---

## Pre-flight (controller, before Task 1)

- [ ] Working tree is dirty (precision/export work on `master`). Do **not** mix that work into these phase commits unless the user says to. Prefer a branch `feat/wpd-basics` / git worktree (`using-git-worktrees` at execution time).
- [ ] `cd backend && .venv/bin/pytest -q` and `cd frontend && npm test` green on the starting tree before Task 1.
- [ ] Confirm no file from `/home/valentin/Projects/t/WebPlotDigitizer/` is copied.

---

## Self-review

1. **Spec coverage:** Magnifier, nudge, readout, drop → P1. Data table/copy → P2. Spatial mask, averaging window, Δx → P3. Dates → P4. Bars → P5. Multiple axes → P6. Colour-pick extract (sample filter + averaging window + propose) → P7. No VLM.
2. **Placeholders:** None intended; signatures are frozen above.
3. **Types:** `CanvasMode` extended in P3; `FilterMode` += `sample` in P7; `Scale` += `date` in P4; `CoordsType` += `bar` in P5; `Calibration.id/name`, `Session.calibrations`, `Curve.calibration_id` in P6; `Curve.region` in P3; `Point.label` in P5.
