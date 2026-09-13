# Digitize Method Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Digitize stage, share the right-column height between Auto digitize and Curves with nested tabs so each approach gets the full remaining pane.

**Architecture:** Keep every existing panel and API. Put method decisions in a pure `digitizeMethod` helper (tab id, which panel to show, which canvas modes to cancel). `App.tsx` renders magnifier, then Auto | Curves tabs, then only the selected panel. Session-local tab state; default Curves. No backend, no project-schema change.

**Tech Stack:** React + TypeScript + Tailwind + vitest (frontend only). No new runtime or test dependencies. Vitest include stays `src/**/*.test.ts` (no `.test.tsx`, no Testing Library).

**Spec:** There is no spec file. The binding design is this plan’s Global Constraints plus the approved in-chat design (2026-09-13): nested Auto | Curves tabs under the magnifier; default Curves; leaving Auto cancels mask / segment-fill / point-match; leaving Curves cancels Place points.

## Global Constraints

- Frontend only. Do not change backend, OpenAPI, or `.pdproj.json`.
- Do not persist the Auto/Curves tab in workspace, preferences, or the project file.
- Pixels remain the source of truth. Do not change calibration, unskew, filter, or auto-digitize API behaviour.
- Do not add npm dependencies. Do not change `frontend/vite.config.ts` test `include` (must stay `src/**/*.test.ts`).
- Do not add `.test.tsx` files. All new tests are `*.test.ts` against `.ts` helpers or source-scan wiring. React components are thin wrappers around those helpers.
- TDD: failing test first, then minimal code. Record the command and output in the task report.
- **No git commit and no git push** unless the user later asks. Skip every “Commit” step; put the file list in the task report instead.
- All implementers and reviewers MUST use model `cursor-grok-4.6-high`. Never Fast, never `inherit`, never another family.
- Work on a feature branch / git worktree (create via superpowers:using-git-worktrees at execution time). Never commit to `master`.
- `workflowStage.stageChrome('digitize')` still reports both `showAutoDigitize: true` and `showCurveList: true`. App ANDs those flags with `digitizeMethodChrome`. Do not change Image / Axes chrome.
- Magnifier stays in the right column on every stage. On Digitize it sits **above** the method tabs.
- Default method is `curves`. Reset to that default when the session identity changes (same `useEffect` that lands the workflow stage). Switching Image / Axes / Digitize inside one session keeps the last Auto/Curves choice.
- `DIGITIZE_EXCLUSIVE_MODES` on `workflowStage` stays the union. Auto exclusive = `segment-fill`, `point-match`, `mask-box`, `mask-pen`, `mask-erase`. Curves exclusive = `place`.
- Version bump happens only in the docs task: feature → `2.19.0`. Do not edit `UPDATES.md` / `README.md` / `frontend/README.md` in earlier tasks.
- Do not create any markdown except the docs task’s edits to existing `README.md`, `UPDATES.md`, and `frontend/README.md`.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/digitizeMethod.ts` | Create | Method ids, tab labels, chrome flags, exclusive-mode clamp |
| `frontend/src/lib/__tests__/digitizeMethod.test.ts` | Create | Those helpers |
| `frontend/src/components/DigitizeMethodTabs.tsx` | Create | Auto / Curves tablist (copy `StageTabs` pattern) |
| `frontend/src/App.tsx` | Modify | Method state, mode clamp, Digitize aside order |
| `frontend/src/components/AutoDigitizePanel.tsx` | Modify | Fill remaining height and scroll (`flex-1 min-h-0 overflow-y-auto`) |
| `frontend/src/lib/__tests__/digitizeMethodWiring.test.ts` | Create | Source-scan App / tabs / panel layout + clamp wiring |
| `README.md` | Modify | Digitize step mentions Auto / Curves tabs |
| `frontend/README.md` | Modify | Layout table + `digitizeMethod.ts` |
| `UPDATES.md` | Modify | `[2.19.0]` entry |

Do **not** modify `frontend/src/lib/workflowStage.ts` or its tests. Stage chrome on digitize continues to expose both panels; the method helper decides which one is visible.

---

### Task 1: digitizeMethod helper

**Files:**
- Create: `frontend/src/lib/digitizeMethod.ts`
- Test: `frontend/src/lib/__tests__/digitizeMethod.test.ts`

**Interfaces:**
- Consumes: `CanvasMode` from `frontend/src/types.ts`; `DIGITIZE_EXCLUSIVE_MODES` from `frontend/src/lib/workflowStage.ts`
- Produces: exact exports below. Later tasks import these names verbatim.

```ts
import type { CanvasMode } from '../types'
import { DIGITIZE_EXCLUSIVE_MODES } from './workflowStage'

export type DigitizeMethod = 'auto' | 'curves'

export const DEFAULT_DIGITIZE_METHOD: DigitizeMethod = 'curves'

export const DIGITIZE_METHOD_TABS: { id: DigitizeMethod; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'curves', label: 'Curves' },
]

export type DigitizeMethodChrome = {
  showAutoDigitize: boolean
  showCurveList: boolean
}

export function digitizeMethodChrome(method: DigitizeMethod): DigitizeMethodChrome

export const AUTO_EXCLUSIVE_MODES: readonly CanvasMode[]
export const CURVES_EXCLUSIVE_MODES: readonly CanvasMode[]

/** Keep `mode` if this method allows it; a mode exclusive to the other method becomes `select`. */
export function canvasModeAllowedOnDigitizeMethod(
  method: DigitizeMethod,
  mode: CanvasMode,
): CanvasMode
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/digitizeMethod.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DIGITIZE_EXCLUSIVE_MODES } from '../workflowStage'
import {
  AUTO_EXCLUSIVE_MODES,
  CURVES_EXCLUSIVE_MODES,
  DEFAULT_DIGITIZE_METHOD,
  DIGITIZE_METHOD_TABS,
  canvasModeAllowedOnDigitizeMethod,
  digitizeMethodChrome,
} from '../digitizeMethod'

describe('DIGITIZE_METHOD_TABS', () => {
  it('is Auto, Curves in that order', () => {
    expect(DIGITIZE_METHOD_TABS.map((t) => t.id)).toEqual(['auto', 'curves'])
    expect(DIGITIZE_METHOD_TABS.map((t) => t.label)).toEqual(['Auto', 'Curves'])
  })
})

describe('DEFAULT_DIGITIZE_METHOD', () => {
  it('defaults to curves', () => {
    expect(DEFAULT_DIGITIZE_METHOD).toBe('curves')
  })
})

describe('digitizeMethodChrome', () => {
  it('shows only auto digitize on auto', () => {
    expect(digitizeMethodChrome('auto')).toEqual({
      showAutoDigitize: true,
      showCurveList: false,
    })
  })

  it('shows only the curves list on curves', () => {
    expect(digitizeMethodChrome('curves')).toEqual({
      showAutoDigitize: false,
      showCurveList: true,
    })
  })
})

describe('exclusive modes', () => {
  it('splits digitize exclusive modes into auto vs curves with no leftovers', () => {
    expect([...AUTO_EXCLUSIVE_MODES]).toEqual([
      'segment-fill',
      'point-match',
      'mask-box',
      'mask-pen',
      'mask-erase',
    ])
    expect([...CURVES_EXCLUSIVE_MODES]).toEqual(['place'])
    expect(new Set([...AUTO_EXCLUSIVE_MODES, ...CURVES_EXCLUSIVE_MODES])).toEqual(
      new Set(DIGITIZE_EXCLUSIVE_MODES),
    )
  })
})

describe('canvasModeAllowedOnDigitizeMethod', () => {
  it('keeps auto tools on auto and cancels place', () => {
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'mask-pen')).toBe('mask-pen')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'segment-fill')).toBe('segment-fill')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'point-match')).toBe('point-match')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'place')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'select')).toBe('select')
  })

  it('keeps place on curves and cancels auto tools', () => {
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'place')).toBe('place')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'mask-box')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'mask-erase')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'segment-fill')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'point-match')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'select')).toBe('select')
  })

  it('does not clamp modes that belong to other stages', () => {
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'axis')).toBe('axis')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'pick-color')).toBe('pick-color')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/digitizeMethod.test.ts`

Expected: FAIL (module `../digitizeMethod` not found, or exports missing).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/digitizeMethod.ts`:

```ts
import type { CanvasMode } from '../types'
import { DIGITIZE_EXCLUSIVE_MODES } from './workflowStage'

export type DigitizeMethod = 'auto' | 'curves'

export const DEFAULT_DIGITIZE_METHOD: DigitizeMethod = 'curves'

export const DIGITIZE_METHOD_TABS: { id: DigitizeMethod; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'curves', label: 'Curves' },
]

export type DigitizeMethodChrome = {
  showAutoDigitize: boolean
  showCurveList: boolean
}

export function digitizeMethodChrome(method: DigitizeMethod): DigitizeMethodChrome {
  if (method === 'auto') {
    return { showAutoDigitize: true, showCurveList: false }
  }
  return { showAutoDigitize: false, showCurveList: true }
}

export const AUTO_EXCLUSIVE_MODES: readonly CanvasMode[] = [
  'segment-fill',
  'point-match',
  'mask-box',
  'mask-pen',
  'mask-erase',
]

export const CURVES_EXCLUSIVE_MODES: readonly CanvasMode[] = ['place']

const EXCLUSIVE_BY_METHOD: Record<DigitizeMethod, readonly CanvasMode[]> = {
  auto: AUTO_EXCLUSIVE_MODES,
  curves: CURVES_EXCLUSIVE_MODES,
}

export function canvasModeAllowedOnDigitizeMethod(
  method: DigitizeMethod,
  mode: CanvasMode,
): CanvasMode {
  if (EXCLUSIVE_BY_METHOD[method].includes(mode)) return mode
  for (const [other, modes] of Object.entries(EXCLUSIVE_BY_METHOD) as [
    DigitizeMethod,
    readonly CanvasMode[],
  ][]) {
    if (other !== method && modes.includes(mode)) return 'select'
  }
  return mode
}
```

The test file imports `DIGITIZE_EXCLUSIVE_MODES` from `workflowStage` for the set-equality assertion. `digitizeMethod.ts` does not import it.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd frontend && npm test -- src/lib/__tests__/digitizeMethod.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Skip. Files: `frontend/src/lib/digitizeMethod.ts`, `frontend/src/lib/__tests__/digitizeMethod.test.ts`.

---

### Task 2: Digitize aside tabs and mode clamp

**Files:**
- Create: `frontend/src/components/DigitizeMethodTabs.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AutoDigitizePanel.tsx` (section `className` only)
- Test: `frontend/src/lib/__tests__/digitizeMethodWiring.test.ts`

**Interfaces:**
- Consumes: Task 1 exports (`DigitizeMethod`, `DEFAULT_DIGITIZE_METHOD`, `DIGITIZE_METHOD_TABS`, `digitizeMethodChrome`, `canvasModeAllowedOnDigitizeMethod`)
- Produces: `DigitizeMethodTabs` props `{ method: DigitizeMethod; onChange: (method: DigitizeMethod) => void; disabled?: boolean }`. App holds `digitizeMethod` state.

Copy the tab button markup from `frontend/src/components/StageTabs.tsx` (role=tablist, `aria-selected`, same selected/unselected classes). Do not extract a shared tab component.

- [ ] **Step 1: Write the failing wiring test**

Create `frontend/src/lib/__tests__/digitizeMethodWiring.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
const tabs = readFileSync(join(srcRoot, 'components/DigitizeMethodTabs.tsx'), 'utf8')
const panel = readFileSync(join(srcRoot, 'components/AutoDigitizePanel.tsx'), 'utf8')

describe('DigitizeMethodTabs', () => {
  it('is a tablist driven by DIGITIZE_METHOD_TABS', () => {
    expect(tabs).toContain("role=\"tablist\"")
    expect(tabs).toContain('DIGITIZE_METHOD_TABS')
    expect(tabs).toContain('aria-selected')
  })
})

describe('App digitize method wiring', () => {
  it('defaults to DEFAULT_DIGITIZE_METHOD and resets on session identity change', () => {
    expect(app).toContain('DigitizeMethodTabs')
    expect(app).toContain('useState<DigitizeMethod>(DEFAULT_DIGITIZE_METHOD)')
    expect(app).toMatch(/if \(next !== null\)[\s\S]*setDigitizeMethod\(DEFAULT_DIGITIZE_METHOD\)/)
  })

  it('clamps canvas mode when switching method and when landing on digitize', () => {
    expect(app).toContain('canvasModeAllowedOnDigitizeMethod')
    expect(app).toMatch(
      /handleDigitizeMethodChange[\s\S]*canvasModeAllowedOnDigitizeMethod\(next, canvasMode\)/,
    )
    expect(app).toMatch(
      /handleWorkflowStageChange[\s\S]*canvasModeAllowedOnDigitizeMethod\(digitizeMethod/,
    )
    expect(app).toMatch(
      /if \(next !== null\)[\s\S]*canvasModeAllowedOnDigitizeMethod\(DEFAULT_DIGITIZE_METHOD/,
    )
  })

  it('puts magnifier above method tabs, then only the selected panel', () => {
    const mag = app.indexOf('<MagnifierView')
    const methodTabs = app.indexOf('<DigitizeMethodTabs')
    const auto = app.indexOf('<AutoDigitizePanel')
    const curves = app.indexOf('<CurveList')
    expect(mag).toBeGreaterThan(0)
    expect(methodTabs).toBeGreaterThan(mag)
    expect(auto).toBeGreaterThan(methodTabs)
    expect(curves).toBeGreaterThan(auto)
    expect(app).toContain('digitizeMethodChrome(digitizeMethod)')
    expect(app).toContain('chrome.showAutoDigitize && methodChrome.showAutoDigitize')
    expect(app).toContain('chrome.showCurveList && methodChrome.showCurveList')
    expect(app).toContain('chrome.showAutoDigitize || chrome.showCurveList')
  })

  it('does not persist digitizeMethod on the session workspace', () => {
    expect(app).not.toMatch(/workspace:[\s\S]{0,200}digitizeMethod/)
    expect(app).not.toMatch(/digitize_method/)
  })
})

describe('AutoDigitizePanel height', () => {
  it('fills the tab pane and scrolls', () => {
    expect(panel).toMatch(/<section className="[^"]*flex-1[^"]*min-h-0[^"]*overflow-y-auto/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/__tests__/digitizeMethodWiring.test.ts`

Expected: FAIL (`DigitizeMethodTabs.tsx` missing and/or App / panel strings absent).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/DigitizeMethodTabs.tsx`:

```tsx
import type { DigitizeMethod } from '../lib/digitizeMethod'
import { DIGITIZE_METHOD_TABS } from '../lib/digitizeMethod'

interface Props {
  method: DigitizeMethod
  onChange: (method: DigitizeMethod) => void
  disabled?: boolean
}

export function DigitizeMethodTabs({ method, onChange, disabled }: Props) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {DIGITIZE_METHOD_TABS.map((tab) => {
        const selected = method === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={`rounded px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              selected ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
```

In `frontend/src/components/AutoDigitizePanel.tsx`, change the root `<section>` `className` from:

```
rounded-lg border border-slate-700 bg-slate-800/50 p-3
```

to:

```
flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50 p-3
```

Keep the existing `h3` “Auto digitize”. Do not change CurveList.

In `frontend/src/App.tsx`:

1. Import `DigitizeMethodTabs` from `./components/DigitizeMethodTabs`.
2. Extend the `./lib/workflowStage` import is unchanged. Add:

```ts
import {
  canvasModeAllowedOnDigitizeMethod,
  DEFAULT_DIGITIZE_METHOD,
  digitizeMethodChrome,
  type DigitizeMethod,
} from './lib/digitizeMethod'
```

3. After `const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('image')` add:

```ts
  const [digitizeMethod, setDigitizeMethod] = useState<DigitizeMethod>(DEFAULT_DIGITIZE_METHOD)
```

4. In the session-identity `useEffect`, inside `if (next !== null)`, reset the method and clamp through both helpers. Replace:

```ts
      setWorkflowStage(next)
      sessionLandingIdRef.current = session?.id ?? null
      sessionLandingReasonRef.current = 'restore'
      setCanvasMode((mode) => canvasModeAllowedOnStage(next, mode))
```

with:

```ts
      setWorkflowStage(next)
      setDigitizeMethod(DEFAULT_DIGITIZE_METHOD)
      sessionLandingIdRef.current = session?.id ?? null
      sessionLandingReasonRef.current = 'restore'
      setCanvasMode((mode) => {
        const afterStage = canvasModeAllowedOnStage(next, mode)
        if (next !== 'digitize') return afterStage
        return canvasModeAllowedOnDigitizeMethod(DEFAULT_DIGITIZE_METHOD, afterStage)
      })
```

Leave the `shouldResetAxisPlacementOnStage` block as it is.

5. Replace `handleWorkflowStageChange` with:

```ts
  const handleWorkflowStageChange = (next: WorkflowStage) => {
    if (next === workflowStage) return
    let nextMode = canvasModeAllowedOnStage(next, canvasMode)
    if (next === 'digitize') {
      nextMode = canvasModeAllowedOnDigitizeMethod(digitizeMethod, nextMode)
    }
    if (nextMode !== canvasMode) handleCanvasModeChange(nextMode)
    if (shouldResetAxisPlacementOnStage(next)) {
      setAxisPlaceStep(null)
      setPreciseMode(false)
      setScaleBarStep(null)
    }
    setWorkflowStage(next)
  }
```

6. Add after `handleWorkflowStageChange`:

```ts
  const handleDigitizeMethodChange = (next: DigitizeMethod) => {
    if (next === digitizeMethod) return
    const nextMode = canvasModeAllowedOnDigitizeMethod(next, canvasMode)
    if (nextMode !== canvasMode) handleCanvasModeChange(nextMode)
    setDigitizeMethod(next)
  }
```

7. Near `const chrome = stageChrome(workflowStage)` add:

```ts
  const methodChrome = digitizeMethodChrome(digitizeMethod)
```

8. Reorder the Digitize aside. Magnifier stays **unconditional** (every stage). Method tabs and the two panels follow it. The Image curve picker and Axes figure fields stay **above** the magnifier as they are today.

Replace the current AutoDigitize → Magnifier → CurveList stretch with this order (picker / figure fields unchanged above):

```tsx
          <div className="mb-2 flex h-[160px] shrink-0 items-center justify-center">
            <MagnifierView
              imageUrl={imageUrl}
              cursor={hoverPixel}
              imageW={imageWidth}
              imageH={imageHeight}
            />
          </div>
          {(chrome.showAutoDigitize || chrome.showCurveList) && (
            <div className="mb-2 shrink-0">
              <DigitizeMethodTabs
                method={digitizeMethod}
                onChange={handleDigitizeMethodChange}
                disabled={!session}
              />
            </div>
          )}
          {chrome.showAutoDigitize && methodChrome.showAutoDigitize && (
            <AutoDigitizePanel
              /* existing props unchanged */
            />
          )}
          {chrome.showCurveList && methodChrome.showCurveList && (
            <CurveList
              /* existing props unchanged */
            />
          )}
```

Copy the existing `AutoDigitizePanel` and `CurveList` prop lists verbatim from the current `App.tsx`. Do not omit props. Do not leave a second copy of those panels above the magnifier.

- [ ] **Step 4: Run the tests and make sure they pass**

Run:

```
cd frontend && npm test -- src/lib/__tests__/digitizeMethod.test.ts src/lib/__tests__/digitizeMethodWiring.test.ts src/lib/__tests__/autoDigitizeWiring.test.ts src/lib/__tests__/workflowStage.test.ts
```

Expected: PASS. If the persist regex is too greedy, tighten it so it only forbids a `workspace` object that includes `digitizeMethod` / `digitize_method`; do not weaken the other assertions.

- [ ] **Step 5: Commit**

Skip. Files: `frontend/src/components/DigitizeMethodTabs.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AutoDigitizePanel.tsx`, `frontend/src/lib/__tests__/digitizeMethodWiring.test.ts`.

---

### Task 3: Docs

**Files:**
- Modify: `UPDATES.md` (new `[2.19.0]` at top of Changelog)
- Modify: `README.md` (How It Works item 3; Typical Workflow steps 4–5)
- Modify: `frontend/README.md` (Layout table + Key libraries)

**Interfaces:**
- Consumes: behaviour shipped in Tasks 1–2
- Produces: none

- [ ] **Step 1: Write the failing doc assertions as the edit checklist, then apply the edits**

There is no unit test for docs. Apply these exact content changes.

`UPDATES.md` — insert above the current newest changelog entry (`[2.18.6]`):

```
## [2.19.0] — 2026-09-13
### Added
- Digitize right column: **Auto** / **Curves** tabs share the pane under the magnifier (default Curves). Switching Auto cancels mask / segment-fill / point-match; switching Curves cancels Place points. Choice is session-local, not saved in the project.
```

`README.md` How It Works item 3 — replace the current Digitize sentence with:

```
3. **Digitize** — right-column **Auto** / **Curves** tabs (default Curves). **Curves:** **Place** points on each curve; bind each curve with the per-curve Axes select. **Auto:** draw a **region mask** (box / pen / erase), run **Averaging window** (ΔX/ΔY px), **Sample Δx** in data space, **Extract this colour** after a colour pick (or **Propose curves from colours**), segment-fill along ink, or **point-match** for scatter markers (sample one marker, accept/reject ranked candidates).
```

`README.md` Typical Workflow steps 4–5 — replace with:

```
4. On **Digitize**, the **Curves** tab is selected. **Add curves** and turn on **Place points** to click seed points on each curve. Bind each curve with the per-curve Axes select in the Curves list.
5. Switch to **Auto** for **Averaging window**, **Sample Δx**, **Segment fill**, colour extract, or point-match. Optional region mask (Box / Pen / Erase) ANDs with the colour filter; **Clear region** restores the full image. Use **Improve** / **Densify** on the Curves tab.
```

Keep steps 6–9 as they are. Do not bump the README Status line off `v2.18`; change Status to **v2.19** and mention Auto / Curves tabs:

Current Status starts with `**v2.18** — editor stages as tabs`. Replace that opening with:

```
**v2.19** — Digitize Auto / Curves tabs share the right column; editor stages as tabs (Image / Axes / Digitize); Open / Save JSON / CSV / Import in
the header.
```

Keep the rest of the Status paragraph (`Clipboard paste… Current version: see UPDATES.md`).

`frontend/README.md` Layout table — add a row after `CurveList.tsx`:

```
| `DigitizeMethodTabs.tsx` | Digitize stage: Auto / Curves tablist under the magnifier |
```

Change the `CurveList.tsx` role cell to: `Digitize stage, Curves tab: curves, place-points mode, Improve / Densify, per-curve Axes select`

Change the `App.tsx` architecture line in root README if it still says `AutoDigitize/Curves` as a stacked pair. In the ASCII diagram, keep names; it is still accurate.

In `frontend/README.md` Key libraries, add:

```
- `src/lib/digitizeMethod.ts` — Digitize Auto / Curves tab ids, chrome flags, exclusive canvas-mode clamp
```

- [ ] **Step 2: Re-read the three files and confirm the strings exist**

Run:

```
grep -n "2.19.0" UPDATES.md README.md
grep -n "Auto\*\* / \*\*Curves" README.md
grep -n "DigitizeMethodTabs" frontend/README.md
grep -n "digitizeMethod.ts" frontend/README.md
```

Expected: each command prints at least one match. (`grep` for README Auto/Curves may need `Digitize right-column` / `Curves** tab is selected` instead if markdown bolding differs; confirm the paragraphs from Step 1 are present.)

- [ ] **Step 3: Run frontend tests that this branch owns**

Run: `cd frontend && npm test -- src/lib/__tests__/digitizeMethod.test.ts src/lib/__tests__/digitizeMethodWiring.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

Skip. Files: `UPDATES.md`, `README.md`, `frontend/README.md`.

---

## Self-review

**Spec coverage:**
- Nested Auto | Curves tabs under magnifier → Task 2 aside order + `DigitizeMethodTabs`
- Default Curves → `DEFAULT_DIGITIZE_METHOD` Task 1 + App `useState` Task 2
- Session-local, not saved → wiring test forbids `digitize_method` / workspace write; no backend
- Leave Auto cancels mask / segment-fill / point-match → `canvasModeAllowedOnDigitizeMethod('curves', …)`
- Leave Curves cancels Place points → `canvasModeAllowedOnDigitizeMethod('auto', 'place')`
- Auto panel can fill and scroll → AutoDigitizePanel `flex-1 min-h-0 overflow-y-auto`
- Stage chrome unchanged → `workflowStage.ts` not modified
- Docs / 2.19.0 → Task 3

**Placeholders:** none.

**Types:** `DigitizeMethod = 'auto' | 'curves'` is used in helper, tabs, and App. `DigitizeMethodChrome` fields match `stageChrome` names so App can AND them.
