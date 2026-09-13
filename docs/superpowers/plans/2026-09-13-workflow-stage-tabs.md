# Workflow Stage Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group existing editor panels into three always-reachable stages (Image / Axes / Digitize) so only the current stage’s tools occupy the top strip and right column, while the user can jump to any stage at any time.

**Architecture:** Keep every existing panel and API. Put all stage decisions in a pure `workflowStage` helper (tab id, landing tab, which chrome to show, which canvas modes to cancel). `App.tsx` only renders what that helper returns. No backend, no project-schema, no new geometry model.

**Tech Stack:** React + TypeScript + Tailwind + vitest (frontend only). No new runtime or test dependencies. Vitest include stays `src/**/*.test.ts` (no `.test.tsx`, no Testing Library).

**Spec:** There is no spec file. The binding design is this plan’s Global Constraints plus the approved in-chat design (2026-09-13): option B chrome, preview hidden on Image, Filter on Image with a compact curve picker, Unskew stays on Image and stays blocked until axis bounds exist.

## Global Constraints

- Frontend only. Do not change backend, OpenAPI, or `.pdproj.json`.
- Pixels remain the source of truth. Do not change calibration, unskew math, or filter behaviour.
- Do not add npm dependencies. Do not change `frontend/vite.config.ts` test `include` (must stay `src/**/*.test.ts`).
- Do not add `.test.tsx` files. All new tests are `*.test.ts` against `.ts` helpers. React components are thin wrappers around those helpers.
- TDD: failing test first, then minimal code. Record the command and output in the task report.
- **No git commit and no git push** unless the user later asks. Skip every “Commit” step; put the file list in the task report instead.
- All implementers and reviewers MUST use model `cursor-grok-4.6-high`. Never Fast, never `inherit`, never another family.
- Work on a feature branch / git worktree (create via superpowers:using-git-worktrees at execution time). Never commit to `master`.
- Unskew does **not** get an independent geometry quad. Perspective/mesh stay as today. If `getAxisBounds(calibration)` is null, Unskew stays disabled; status text is `Place axis bounds in Calibration first` (reuse/extract this exact string).
- `pick-color` is an **Image** exclusive mode (Filter lives on Image). It is **not** a Digitize mode. Digitize exclusive modes are `place`, `segment-fill`, `point-match`, `mask-box`, `mask-pen`, `mask-erase`. Axes exclusive mode is `axis`.
- After **upload** always land on `image`. On **restore** (open project / last session): Digitize if any curve has points, else Axes if `isCalibrationValid`, else Image. Do not change the tab when the same `session.id` merely patches.
- Magnifier is always in the right column. Upload / Undo / Redo stay in the header. Open / Save JSON / CSV / Import move to the header and leave the stage strip.
- Figure title / xlabel / ylabel leave Export and appear only on Axes.
- Version bump happens only in the docs task: feature → `2.18.0`. Do not edit `UPDATES.md` / `README.md` in earlier tasks.
- Do not create any markdown except the docs task’s edits to existing `README.md`, `UPDATES.md`, and `frontend/README.md`.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/workflowStage.ts` | Create | Stage ids, tab labels, `stageChrome`, landing tab, mode cancel |
| `frontend/src/lib/__tests__/workflowStage.test.ts` | Create | Those helpers |
| `frontend/src/lib/curves.ts` | Modify | `createEmptyCurve`, `appendCurve` |
| `frontend/src/lib/__tests__/curves.test.ts` | Create | append / create |
| `frontend/src/lib/figureFields.ts` | Create | Field keys + labels for title/xlabel/ylabel |
| `frontend/src/lib/__tests__/figureFields.test.ts` | Create | Labels |
| `frontend/src/components/FigureFields.tsx` | Create | Title / xlabel / ylabel inputs |
| `frontend/src/components/ExportPanel.tsx` | Modify | Header button row; no figure fields |
| `frontend/src/components/StageTabs.tsx` | Create | Image / Axes / Digitize tablist |
| `frontend/src/components/CurvePicker.tsx` | Create | Compact active-curve select + Add |
| `frontend/src/components/CurveList.tsx` | Modify | Use `appendCurve` |
| `frontend/src/App.tsx` | Modify | Tab state, landing, mode cancel, conditional chrome |
| `README.md` | Modify | Architecture + typical workflow (docs task) |
| `frontend/README.md` | Modify | Layout table |
| `UPDATES.md` | Modify | `[2.18.0]` entry |

---

### Task 1: workflowStage helper

**Files:**
- Create: `frontend/src/lib/workflowStage.ts`
- Test: `frontend/src/lib/__tests__/workflowStage.test.ts`

**Interfaces:**
- Consumes: `CanvasMode` from `frontend/src/types.ts`; `isCalibrationValid` from `frontend/src/lib/transform.ts`; `getAxisBounds` from `frontend/src/lib/transform.ts`
- Produces: exact exports below. Later tasks import these names verbatim.

```ts
export type WorkflowStage = 'image' | 'axes' | 'digitize'

export const WORKFLOW_STAGE_TABS: { id: WorkflowStage; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'axes', label: 'Axes' },
  { id: 'digitize', label: 'Digitize' },
]

export const UNSKEW_PLACE_AXES_HINT = 'Place axis bounds in Calibration first'

export type StageChrome = {
  showUnskew: boolean
  showFilter: boolean
  showCurvePicker: boolean
  showCalibration: boolean
  showFigureFields: boolean
  showAutoDigitize: boolean
  showCurveList: boolean
  showPreview: boolean
  showDataTable: boolean
}

export function stageChrome(stage: WorkflowStage): StageChrome

export type SessionStageInput = {
  id: string
  calibration: import('../types').Calibration | null
  curves: Array<{ points: unknown[] }>
}

export function defaultWorkflowStage(
  session: SessionStageInput | null,
  reason: 'upload' | 'restore',
): WorkflowStage

/** `null` means keep the current tab (same session id). */
export function nextStageOnSessionIdentityChange(
  previousSessionId: string | null,
  session: SessionStageInput | null,
  reason: 'upload' | 'restore',
): WorkflowStage | null

export const IMAGE_EXCLUSIVE_MODES: readonly CanvasMode[]
export const AXIS_EXCLUSIVE_MODES: readonly CanvasMode[]
export const DIGITIZE_EXCLUSIVE_MODES: readonly CanvasMode[]

export function canvasModeAfterLeavingStage(
  leaving: WorkflowStage,
  mode: CanvasMode,
): CanvasMode

export function shouldResetAxisPlacement(leaving: WorkflowStage): boolean

export function hasPlacedAxisBounds(
  calibration: import('../types').Calibration | null,
): boolean

export function previewGridClassName(showPreview: boolean): string
```

`stageChrome` values (assert the full object, not a subset):

- `image`: unskew, filter, curvePicker true; everything else false.
- `axes`: calibration, figureFields, preview, dataTable true; everything else false.
- `digitize`: autoDigitize, curveList, preview, dataTable true; everything else false.

`previewGridClassName(true)` must be exactly:

`grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 gap-2 p-2 lg:grid-cols-2 lg:grid-rows-1`

`previewGridClassName(false)` must be exactly:

`grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2`

`IMAGE_EXCLUSIVE_MODES` = `['pick-color']`

`AXIS_EXCLUSIVE_MODES` = `['axis']`

`DIGITIZE_EXCLUSIVE_MODES` = `['place', 'segment-fill', 'point-match', 'mask-box', 'mask-pen', 'mask-erase']`

`canvasModeAfterLeavingStage` returns `'select'` when `mode` is in that stage’s exclusive list, otherwise the same `mode`.

`shouldResetAxisPlacement` is true only for `'axes'`.

`hasPlacedAxisBounds` is true iff `calibration` is non-null and `getAxisBounds(calibration)` is non-null.

`defaultWorkflowStage`:
- `session === null` → `'image'`
- `reason === 'upload'` → `'image'` (even if calibration is valid and curves have points)
- `reason === 'restore'` and any `curve.points.length > 0` → `'digitize'`
- else if `isCalibrationValid(session.calibration)` → `'axes'`
- else `'image'`

`nextStageOnSessionIdentityChange`:
- `session === null` → `'image'`
- `session.id === previousSessionId` → `null`
- else `defaultWorkflowStage(session, reason)`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/workflowStage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import {
  AXIS_EXCLUSIVE_MODES,
  DIGITIZE_EXCLUSIVE_MODES,
  IMAGE_EXCLUSIVE_MODES,
  UNSKEW_PLACE_AXES_HINT,
  WORKFLOW_STAGE_TABS,
  canvasModeAfterLeavingStage,
  defaultWorkflowStage,
  hasPlacedAxisBounds,
  nextStageOnSessionIdentityChange,
  previewGridClassName,
  shouldResetAxisPlacement,
  stageChrome,
} from '../workflowStage'

function validCartesian(): Calibration {
  return {
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 100], value: 0 },
        { pixel: [100, 100], value: 10 },
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

describe('WORKFLOW_STAGE_TABS', () => {
  it('is Image, Axes, Digitize in that order', () => {
    expect(WORKFLOW_STAGE_TABS.map((t) => t.id)).toEqual(['image', 'axes', 'digitize'])
    expect(WORKFLOW_STAGE_TABS.map((t) => t.label)).toEqual(['Image', 'Axes', 'Digitize'])
  })
})

describe('stageChrome', () => {
  it('shows image-prep tools only on image', () => {
    expect(stageChrome('image')).toEqual({
      showUnskew: true,
      showFilter: true,
      showCurvePicker: true,
      showCalibration: false,
      showFigureFields: false,
      showAutoDigitize: false,
      showCurveList: false,
      showPreview: false,
      showDataTable: false,
    })
  })

  it('shows calibration, figure fields, and preview on axes', () => {
    expect(stageChrome('axes')).toEqual({
      showUnskew: false,
      showFilter: false,
      showCurvePicker: false,
      showCalibration: true,
      showFigureFields: true,
      showAutoDigitize: false,
      showCurveList: false,
      showPreview: true,
      showDataTable: true,
    })
  })

  it('shows digitize tools and preview on digitize', () => {
    expect(stageChrome('digitize')).toEqual({
      showUnskew: false,
      showFilter: false,
      showCurvePicker: false,
      showCalibration: false,
      showFigureFields: false,
      showAutoDigitize: true,
      showCurveList: true,
      showPreview: true,
      showDataTable: true,
    })
  })
})

describe('defaultWorkflowStage', () => {
  const valid = {
    id: 's1',
    calibration: validCartesian(),
    curves: [{ points: [{}, {}] }],
  }

  it('lands on image when there is no session', () => {
    expect(defaultWorkflowStage(null, 'restore')).toBe('image')
  })

  it('always lands on image after upload', () => {
    expect(defaultWorkflowStage(valid, 'upload')).toBe('image')
  })

  it('restores to digitize when any curve has points', () => {
    expect(defaultWorkflowStage(valid, 'restore')).toBe('digitize')
  })

  it('restores to axes when calibration is valid but there are no points', () => {
    expect(
      defaultWorkflowStage(
        { id: 's1', calibration: validCartesian(), curves: [{ points: [] }] },
        'restore',
      ),
    ).toBe('axes')
  })

  it('restores to image when calibration is missing and there are no points', () => {
    expect(
      defaultWorkflowStage({ id: 's1', calibration: null, curves: [] }, 'restore'),
    ).toBe('image')
  })
})

describe('nextStageOnSessionIdentityChange', () => {
  it('returns image when the session is cleared', () => {
    expect(nextStageOnSessionIdentityChange('s1', null, 'restore')).toBe('image')
  })

  it('returns null when the session id is unchanged', () => {
    expect(
      nextStageOnSessionIdentityChange(
        's1',
        { id: 's1', calibration: null, curves: [] },
        'restore',
      ),
    ).toBeNull()
  })

  it('returns the landing stage when the session id changes', () => {
    expect(
      nextStageOnSessionIdentityChange(
        'old',
        { id: 'new', calibration: validCartesian(), curves: [{ points: [{}] }] },
        'restore',
      ),
    ).toBe('digitize')
  })
})

describe('canvasModeAfterLeavingStage', () => {
  it('cancels pick-color when leaving image only', () => {
    expect(IMAGE_EXCLUSIVE_MODES).toEqual(['pick-color'])
    expect(canvasModeAfterLeavingStage('image', 'pick-color')).toBe('select')
    expect(canvasModeAfterLeavingStage('digitize', 'pick-color')).toBe('pick-color')
  })

  it('cancels axis when leaving axes', () => {
    expect(AXIS_EXCLUSIVE_MODES).toEqual(['axis'])
    expect(canvasModeAfterLeavingStage('axes', 'axis')).toBe('select')
    expect(canvasModeAfterLeavingStage('axes', 'place')).toBe('place')
    expect(shouldResetAxisPlacement('axes')).toBe(true)
    expect(shouldResetAxisPlacement('image')).toBe(false)
  })

  it('cancels digitize tools when leaving digitize', () => {
    expect([...DIGITIZE_EXCLUSIVE_MODES]).toEqual([
      'place',
      'segment-fill',
      'point-match',
      'mask-box',
      'mask-pen',
      'mask-erase',
    ])
    expect(canvasModeAfterLeavingStage('digitize', 'place')).toBe('select')
    expect(canvasModeAfterLeavingStage('digitize', 'mask-pen')).toBe('select')
    expect(canvasModeAfterLeavingStage('image', 'place')).toBe('place')
  })
})

describe('hasPlacedAxisBounds', () => {
  it('is false without two refs per axis', () => {
    expect(hasPlacedAxisBounds(null)).toBe(false)
    expect(
      hasPlacedAxisBounds({
        x: { scale: 'linear', ref_points: [] },
        y: { scale: 'linear', ref_points: [] },
        source: 'manual',
      }),
    ).toBe(false)
  })

  it('is true for a four-bound cartesian set', () => {
    expect(hasPlacedAxisBounds(validCartesian())).toBe(true)
  })
})

describe('previewGridClassName', () => {
  it('uses two columns when preview is shown and one when hidden', () => {
    expect(previewGridClassName(true)).toBe(
      'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 gap-2 p-2 lg:grid-cols-2 lg:grid-rows-1',
    )
    expect(previewGridClassName(false)).toBe(
      'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2',
    )
  })
})

describe('UNSKEW_PLACE_AXES_HINT', () => {
  it('tells the user to place axes first', () => {
    expect(UNSKEW_PLACE_AXES_HINT).toBe('Place axis bounds in Calibration first')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/workflowStage.test.ts`

Expected: FAIL with `Cannot find module '../workflowStage'` (or the first describe fails if the file exists empty).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/workflowStage.ts` implementing the exports so the tests pass. `hasPlacedAxisBounds` must call `getAxisBounds`. `defaultWorkflowStage` must call `isCalibrationValid` for the restore-without-points branch. Do not import React.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/lib/__tests__/workflowStage.test.ts`

Expected: PASS

- [ ] **Step 5: Skip commit** (global constraint). Report files created.

---

### Task 2: Shared createEmptyCurve / appendCurve

**Files:**
- Modify: `frontend/src/lib/curves.ts`
- Modify: `frontend/src/components/CurveList.tsx` (`addCurve` body)
- Test: `frontend/src/lib/__tests__/curves.test.ts`

**Interfaces:**
- Consumes: `Curve` from `frontend/src/types.ts`; `paletteColor` from `frontend/src/lib/colors.ts`; `DEFAULT_POINT_COUNT` from `frontend/src/lib/constants.ts`
- Produces:

```ts
export function createEmptyCurve(index: number, id: string): Curve
export function appendCurve(curves: Curve[], id: string): { curves: Curve[]; added: Curve }
```

`createEmptyCurve(index, id)` returns:

```ts
{
  id,
  label: `Curve ${index + 1}`,
  color: paletteColor(index),
  style: 'unknown',
  visible: true,
  target_point_count: DEFAULT_POINT_COUNT,
  points: [],
  connect_as: 'line',
}
```

`appendCurve(curves, id)` returns `{ curves: [...curves, added], added }` where `added = createEmptyCurve(curves.length, id)`.

`CurveList` `addCurve` must become:

```ts
const addCurve = () => {
  const { curves: next, added } = appendCurve(curves, crypto.randomUUID())
  onCurveChange(next)
  onActiveChange(added.id)
}
```

Do not change Improve / Densify / Place points / Axes bind.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/curves.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { paletteColor } from '../colors'
import { DEFAULT_POINT_COUNT } from '../constants'
import { appendCurve, createEmptyCurve } from '../curves'

describe('createEmptyCurve', () => {
  it('builds Curve N+1 with the palette color for that index', () => {
    expect(createEmptyCurve(0, 'c0')).toEqual({
      id: 'c0',
      label: 'Curve 1',
      color: paletteColor(0),
      style: 'unknown',
      visible: true,
      target_point_count: DEFAULT_POINT_COUNT,
      points: [],
      connect_as: 'line',
    })
    expect(createEmptyCurve(2, 'c2').label).toBe('Curve 3')
  })
})

describe('appendCurve', () => {
  it('appends a curve and reports it as added', () => {
    const existing = [createEmptyCurve(0, 'c0')]
    const { curves, added } = appendCurve(existing, 'c1')
    expect(added.id).toBe('c1')
    expect(added.label).toBe('Curve 2')
    expect(curves.map((c) => c.id)).toEqual(['c0', 'c1'])
    expect(existing).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/curves.test.ts`

Expected: FAIL (`createEmptyCurve` / `appendCurve` not exported)

- [ ] **Step 3: Write minimal implementation**

Add the two functions to `frontend/src/lib/curves.ts`. Switch `CurveList` `addCurve` to `appendCurve` as specified. Keep `createEmptyCurve` free of `crypto.randomUUID` — the caller passes `id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/lib/__tests__/curves.test.ts`

Expected: PASS. Also run `cd frontend && npm test -- src/lib/__tests__/workflowStage.test.ts` to confirm Task 1 still passes.

- [ ] **Step 5: Skip commit.** Report files.

---

### Task 3: FigureFields, header Export, StageTabs, CurvePicker

**Files:**
- Create: `frontend/src/lib/figureFields.ts`
- Test: `frontend/src/lib/__tests__/figureFields.test.ts`
- Create: `frontend/src/components/FigureFields.tsx`
- Create: `frontend/src/components/StageTabs.tsx`
- Create: `frontend/src/components/CurvePicker.tsx`
- Modify: `frontend/src/components/ExportPanel.tsx`

**Interfaces:**
- Consumes: Task 1 `WORKFLOW_STAGE_TABS`, `WorkflowStage`; Task 2 `appendCurve`; `FigureMeta` from types
- Produces: components used by Task 4. `ExportPanel` no longer accepts or renders `figure` / `onFigureChange`.

`frontend/src/lib/figureFields.ts`:

```ts
import type { FigureMeta } from '../types'

export const FIGURE_FIELD_KEYS = ['title', 'xlabel', 'ylabel'] as const satisfies readonly (keyof FigureMeta)[]

export const FIGURE_FIELD_LABELS: Record<keyof FigureMeta, string> = {
  title: 'Figure title',
  xlabel: 'xlabel',
  ylabel: 'ylabel',
}
```

`FigureFields` props:

```ts
{
  figure: FigureMeta
  disabled: boolean
  onFigureChange: (figure: FigureMeta) => void
}
```

Render one labeled text input per `FIGURE_FIELD_KEYS`, using `FIGURE_FIELD_LABELS[key]`. `onChange` calls `onFigureChange({ ...figure, [key]: e.target.value })`. Disabled when `disabled`. Use the same input classes as today’s ExportPanel fields (`rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px]`, labels `text-[10px] text-slate-400`). Wrap in `<div className="flex flex-col gap-1">` with no “Project” heading.

`StageTabs` props:

```ts
{
  stage: WorkflowStage
  onChange: (stage: WorkflowStage) => void
  disabled?: boolean
}
```

Render `role="tablist"` with one `role="tab"` button per `WORKFLOW_STAGE_TABS`. Selected tab: `aria-selected={true}` and a filled `bg-slate-600 text-slate-100` class. Unselected: `text-slate-400 hover:bg-slate-700`. `disabled` disables all tabs (no session). Do not implement keyboard roving in this task.

`CurvePicker` props:

```ts
{
  curves: Curve[]
  activeCurveId: string | null
  busy: boolean
  onActiveChange: (id: string) => void
  onCurvesChange: (curves: Curve[]) => void
}
```

- Heading `Curves` (`text-xs font-semibold text-slate-200`).
- `<select>` of `curves` by `id` / `label`; value `activeCurveId ?? ''`; `onChange` → `onActiveChange`.
- `+ Add` button: `const { curves: next, added } = appendCurve(curves, crypto.randomUUID()); onCurvesChange(next); onActiveChange(added.id)`.
- Empty list: select disabled, placeholder option `No curves — click Add`.
- Container: `rounded-lg border border-slate-700 bg-slate-800/50 p-2` (compact; not the full CurveList).

`ExportPanel` changes:
- Remove `figure`, `onFigureChange`, and all `FigureFields` usage from both compact and non-compact branches.
- Remove the unused `EMPTY_FIGURE` / `FigureFields` internals from this file.
- Add optional `variant?: 'header' | 'card'`. `App` will pass `'header'`. Default `'card'` keeps the existing bordered section for any leftover caller.
- `variant === 'header'`: no `<h3>`, no JSON blurb, no figure fields. Render only the Open / Save JSON / CSV / Import controls in a `flex flex-wrap items-center gap-1.5` row (no `section` card, or a fragment). Keep the hidden file inputs.
- `variant === 'card'`: same as today’s non-compact layout **minus** figure fields (heading “Project” + blurb + buttons).
- Keep `compact` working if still referenced: treat `compact` as `variant === 'header'` when `variant` is omitted and `compact` is true, so old call sites do not grow a card in the header. Prefer `variant` in App.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/figureFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FIGURE_FIELD_KEYS, FIGURE_FIELD_LABELS } from '../figureFields'

describe('figure field copy', () => {
  it('keeps title, xlabel, ylabel in that order', () => {
    expect(FIGURE_FIELD_KEYS).toEqual(['title', 'xlabel', 'ylabel'])
    expect(FIGURE_FIELD_LABELS).toEqual({
      title: 'Figure title',
      xlabel: 'xlabel',
      ylabel: 'ylabel',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/figureFields.test.ts`

Expected: FAIL (`Cannot find module '../figureFields'`)

- [ ] **Step 3: Write minimal implementation**

Add `figureFields.ts`, then the three components, then strip figure fields from `ExportPanel` as specified. Do not modify `App.tsx` in this task (App will not typecheck if it still passes `figure` into ExportPanel — **leave App compiling**: either keep the ExportPanel props as optional unused until Task 4, or update App’s ExportPanel invocation in this task only far enough to compile: stop passing `figure` / `onFigureChange`, pass `variant="header"`. If you touch App here, do **not** add tabs yet.

Preferred: make `figure` / `onFigureChange` optional and unused so App still compiles, and let Task 4 move the panel. Do not leave a type error at the end of this task.

Run `cd frontend && npx tsc -b --pretty false` before finishing. If App still passes the old props, make those props optional (`figure?`, `onFigureChange?`) and simply not render them, so `tsc` stays green. Task 4 removes the dead props from the App call site.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- src/lib/__tests__/figureFields.test.ts src/lib/__tests__/workflowStage.test.ts src/lib/__tests__/curves.test.ts src/lib/__tests__/exportFlow.test.ts src/api/client.test.ts`

Expected: PASS. Then `cd frontend && npx tsc -b --pretty false` — exit 0.

- [ ] **Step 5: Skip commit.** Report files.

---

### Task 4: Wire App shell

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: every export from Task 1; `FigureFields`, `StageTabs`, `CurvePicker`; `ExportPanel` `variant="header"`; existing panels
- Produces: the visible three-stage UI. No new exported functions.

Layout (top to bottom):

1. Header row: title + upload + undo/redo as today, then `<ExportPanel variant="header" ...>` **without** `figure` / `onFigureChange`. Do not pass `compact` if `variant` is set.
2. Toast / progress as today.
3. `<StageTabs stage={workflowStage} onChange={handleWorkflowStageChange} disabled={!session} />` in a `shrink-0 border-b border-slate-800 px-2 py-1` bar. Tabs are clickable whenever `session` is non-null.
4. Stage tool strip (`flex shrink-0 flex-wrap gap-2 ...`) renders **only** the panels `stageChrome` says to show at the top:
   - Image: `UnskewPanel` then `FilterPanel` (same props as today).
   - Axes: `CalibrationPanel` (same props as today).
   - Digitize: render nothing in this strip (no empty padded box: omit the strip `div` when none of `showUnskew`, `showFilter`, `showCalibration` is true).
5. `<main>` as today (canvas + optional preview column + aside).
   - Canvas column unchanged.
   - Preview column (`PreviewChart` + `DataTablePanel`) mounts only when `chrome.showPreview` (table follows preview; `showDataTable` is the same flag in practice — still gate the table on `chrome.showDataTable`).
   - Outer grid `className={previewGridClassName(chrome.showPreview)}`.
6. Aside (`w-[300px]` as today), always: stage-specific block, then magnifier (`h-[160px]`), then CurveList only when `showCurveList`.
   - Image: `CurvePicker` (`onCurvesChange={syncCurves}`, `onActiveChange={setActiveCurveId}`) then magnifier. No CurveList, no AutoDigitize.
   - Axes: `FigureFields figure={figure} disabled={!session} onFigureChange={handleFigureChange}` then magnifier.
   - Digitize: `AutoDigitizePanel` (same props) then magnifier then `CurveList` (same props).

State:
- `const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('image')`
- Track `sessionLandingIdRef` (string | null), initialized null.
- Track `sessionLandingReasonRef`: `'upload' | 'restore'`, default `'restore'`.
- Set `sessionLandingReasonRef.current = 'upload'` at the start of `handleUpload` (the `uploadSession` path around today’s line 398) **before** `syncSessionUi`. Paste and file-drop already call `handleUpload`.
- Leave the reason as `'restore'` for bootstrap `getLastSession` (`syncSessionUi` around today’s line 255) and for ExportPanel `onLoadProject` (`loadProject`).
- After a landing apply, set `sessionLandingReasonRef.current = 'restore'` so a later patch of the same id cannot be treated as upload.
- When `session` changes, compute `nextStageOnSessionIdentityChange(sessionLandingIdRef.current, session && { id: session.id, calibration: session.calibration, curves: session.curves }, sessionLandingReasonRef.current)`. If not null, `setWorkflowStage` to it and set `sessionLandingIdRef.current = session?.id ?? null`. A `useEffect` on `session` is enough if the reason ref is assigned first.

`handleWorkflowStageChange(next: WorkflowStage)`:
```
if (next === workflowStage) return
const nextMode = canvasModeAfterLeavingStage(workflowStage, canvasMode)
if (nextMode !== canvasMode) handleCanvasModeChange(nextMode)
if (shouldResetAxisPlacement(workflowStage)) {
  setAxisPlaceStep(null)
  setPreciseMode(false)
  setScaleBarStep(null)
}
setWorkflowStage(next)
```

Unskew status: when `!axisBounds`, use `UNSKEW_PLACE_AXES_HINT` instead of a duplicated string.

Do not persist `workflowStage` in `workspace` / preferences.

Do not change canvas click handlers, CV calls, or preference flush.

- [ ] **Step 1: Write the failing test**

Do not add an App component test (vitest is node / `*.test.ts`). Extend `frontend/src/lib/__tests__/workflowStage.test.ts` with one contract test that Task 4’s App must satisfy — if it already exists from Task 1, add:

```ts
describe('editor shell contract', () => {
  it('hides the top strip when only digitize tools are active', () => {
    const chrome = stageChrome('digitize')
    const showTopStrip = chrome.showUnskew || chrome.showFilter || chrome.showCalibration
    expect(showTopStrip).toBe(false)
  })
})
```

If Task 1 already covers this via `stageChrome('digitize')`, skip adding a duplicate and go to Step 3 after running the existing file once to show the contract still holds. The Task 4 proof is: App uses `stageChrome(workflowStage)` and `previewGridClassName(chrome.showPreview)` — the reviewer greps those identifiers in `App.tsx`.

To keep TDD for this task, first add a failing assertion in `workflowStage.test.ts` that `previewGridClassName` is imported by checking a new helper:

```ts
export function shouldRenderTopStrip(chrome: StageChrome): boolean {
  return chrome.showUnskew || chrome.showFilter || chrome.showCalibration
}
```

Test:

```ts
it('omits the top strip on digitize and keeps it on image and axes', () => {
  expect(shouldRenderTopStrip(stageChrome('image'))).toBe(true)
  expect(shouldRenderTopStrip(stageChrome('axes'))).toBe(true)
  expect(shouldRenderTopStrip(stageChrome('digitize'))).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/workflowStage.test.ts`

Expected: FAIL (`shouldRenderTopStrip` is not exported)

- [ ] **Step 3: Write minimal implementation**

Add `shouldRenderTopStrip` to `workflowStage.ts`. Wire `App.tsx` exactly as specified. Use `const chrome = stageChrome(workflowStage)` once per render. Gate the tool strip with `shouldRenderTopStrip(chrome)`.

Replace the current top-row Unskew/Filter/Calibration/Export cluster: Export moves to the header; the others follow chrome flags.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test`

Expected: PASS (all frontend tests). Then `cd frontend && npx tsc -b --pretty false` — exit 0.

- [ ] **Step 5: Skip commit.** Report files.

---

### Task 5: Docs

**Files:**
- Modify: `UPDATES.md` (new top changelog entry `[2.18.0] — 2026-09-13`)
- Modify: `README.md` (Architecture diagram + Status line + Typical Workflow panel order)
- Modify: `frontend/README.md` (Layout table + toolbar sentence)

**Interfaces:**
- Consumes: the shipped UI from Task 4
- Produces: docs only

`UPDATES.md` entry (newest on top, after the versioning policy, before `[2.17.1]`):

```md
## [2.18.0] — 2026-09-13
### Added
- Editor stages as tabs: **Image** (Unskew, Filter, compact curve picker), **Axes** (Calibration, figure title/labels, preview), **Digitize** (Auto digitize, Curves, preview). Tabs are always reachable; after upload the Image tab is selected; opening a project lands on Digitize if any curve has points, otherwise Axes if calibration is valid, else Image.
### Changed
- Open / Save JSON / CSV / Import live in the header. Leaving a tab cancels that stage’s exclusive canvas mode (Image: pick colour; Axes: place bounds; Digitize: place / mask / segment-fill / point-match).
```

`README.md` Architecture frontend box: replace the single panel list with the three stages. Status: **v2.18**. Typical Workflow: Image (unskew/filter) after load; Axes (bounds + title/labels); Digitize (points). Note that Unskew still needs placed axis bounds (switch to Axes first).

`frontend/README.md` Layout: document `StageTabs`, `CurvePicker`, `FigureFields`; toolbar is header export + stage tabs, not Unskew → Calibration → Export.

- [ ] **Step 1: Write the failing test**

No code test. Proof is the three files containing `2.18.0` / stage names. First, `rg -n "2\.18\.0" UPDATES.md` should fail.

- [ ] **Step 2: Confirm it fails**

Run: `rg -n "2\\.18\\.0" UPDATES.md README.md`

Expected: no matches

- [ ] **Step 3: Write the docs**

Edit the three files as specified. Do not create new markdown files.

- [ ] **Step 4: Verify**

Run: `rg -n "2\\.18\\.0|Image · Axes|StageTabs" UPDATES.md README.md frontend/README.md`

Expected: matches in all three. Then `cd frontend && npm test` still PASS.

- [ ] **Step 5: Skip commit.** Report files.

---

## Subagent / reviewer notes

Execute with superpowers:subagent-driven-development. One implementer per task, then a task reviewer, then a whole-branch reviewer after Task 5.

Every dispatch uses **`cursor-grok-4.6-high`**.

Reviewer checks beyond the diff:
- Task 1: exclusive-mode lists match Global Constraints (`pick-color` is Image, not Digitize).
- Task 3: `ExportPanel` no longer renders title/xlabel/ylabel; `tsc` clean.
- Task 4: `App.tsx` greps `stageChrome`, `StageTabs`, `CurvePicker`, `FigureFields`, `variant="header"`, `shouldRenderTopStrip`, `nextStageOnSessionIdentityChange`, `canvasModeAfterLeavingStage`. Preview/DataTable are not mounted on Image. CurveList is not mounted on Image/Axes. Unskew is not mounted on Axes/Digitize.
- Task 5: version `2.18.0`, not a `subsubver` bump.

Do not start Task 4 until Task 3’s `tsc` is green. Tasks 1–2 are sequential with Task 3 (CurvePicker needs `appendCurve`).
