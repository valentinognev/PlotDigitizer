# Precision Toolkit — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute each phase plan task-by-task. This master file is the controller's map: it carries
> the pre-flight, the phase order, the model/reviewer assignments and the definition of done.
> The executable steps live in the five phase plans indexed in §4.

**Goal:** Port Engauge Digitizer's precision techniques and missing plot kinds into
PlotDigitizer — a real 2D calibration transform, colour/grid image conditioning, subpixel
snapping, automatic segment-fill tracing, scatter point matching, and polar/map coordinate
systems — all gated by a wide test suite that measures accuracy against synthetic ground truth
and the reference project's example corpus.

**Architecture:** One transform solver (orthogonal / affine / projective) with three coordinate
adapters (cartesian / polar / map) replaces the per-axis 1D fit; one shared binary mask
(per-curve colour filter + optional grid removal) feeds every automatic tool; the React canvas
grows a single mode union for the new interactions. Pixels stay the source of truth.

**Tech Stack:** Python 3 · FastAPI · Pydantic v2 · NumPy · OpenCV (headless) · Pillow · pytest
· React 19 · TypeScript · Konva · Plotly · Tailwind · Vite · Vitest (new)

**Spec:** `docs/superpowers/specs/2026-09-04-precision-toolkit-design.md`

---

## Global Constraints

Copied verbatim from spec §3. Every task's requirements implicitly include these.

1. **Licence hygiene.** Engauge is GPL-2.0+. Do **not** copy or transcribe Engauge source code
   into this repo, and do **not** vendor its images, `.dig`/`.xml` docs, or expected CSVs.
   Algorithms are implemented from the documented behaviour in `help/*.html` plus standard
   OpenCV/NumPy technique. Reference assets are read from an external directory at test time
   only.
2. **Reference corpus is optional at runtime.** Tests that read the corpus resolve
   `PLOTDIG_REF_DIR` (default `/home/valentin/Projects/t/engauge-digitizer`) and `pytest.skip`
   when it is absent. `pytest -q` must pass on a clean checkout without the reference project
   present.
3. **Pixels remain the source of truth.** `Point.pixel` stays canonical; every data value is
   derived through the active calibration. No feature may invert this.
4. **Backward compatibility.** Existing sessions and `.pdproj.json` projects must load
   unchanged, and an existing four-bound linear/log calibration must produce **numerically
   identical** results after the transform rewrite (regression-tested, exact to 1e-12).
5. **TDD.** No production code without a failing test first. Every task ends with an
   independently runnable test command and its observed output recorded in the task report.
6. **Backend/frontend geometry parity.** Any transform implemented in Python and mirrored in
   TypeScript must agree to 1e-9 on a committed vector fixture.
7. **Dependency floor.** Backend: existing `backend/requirements.txt` only (`numpy>=2.1`,
   `opencv-python-headless>=4.10`, `pillow>=11`, `fastapi>=0.115`, `pydantic>=2.9`,
   `pytest>=8.3`, `httpx>=0.27`). No SciPy, no scikit-image, no FFTW. Frontend: adding
   `vitest` + `@vitest/coverage-v8` as devDependencies is permitted; no other new runtime
   dependency.
8. **Docs.** `UPDATES.md` gets one new top entry per completed phase with a version bump
   (feature → `subver`). `README.md` changes only when architecture changes. No other markdown
   files may be created.
9. **No commits to `master`.** All work happens on a feature branch / worktree. Never
   `git push`, never merge, without the user's explicit request.

---

## 1. Pre-flight (controller, before Task 1 of Phase 0)

- [ ] **Working tree is dirty.** At planning time `master` had 13 modified files from the v2.2
      mesh-unskew work (`README.md`, `UPDATES.md`, `backend/app/cv/mesh_warp.py`,
      `backend/app/models/schemas.py`, `backend/app/pipeline/pipeline.py`,
      `backend/tests/test_mesh_warp.py`, `backend/tests/test_unskew.py`,
      `frontend/src/App.tsx`, `frontend/src/api/client.ts`,
      `frontend/src/components/MeshGridOverlay.tsx`,
      `frontend/src/components/UnskewPanel.tsx`, `frontend/src/lib/meshWarp.ts`,
      `frontend/src/types.ts`). These must be committed or stashed by the **user** before
      branching — the agent-permissions rule forbids committing them unasked. Confirm the tree
      is clean, then create the branch/worktree.
- [ ] **Isolated workspace.** Use superpowers:using-git-worktrees. Never implement on
      `master`.
- [ ] **Rebuild the backend venv — currently broken (BLOCKER).** `backend/.venv` was created
      2026-06-06 against a Python 3.13 that no longer exists: `readlink -f
      backend/.venv/bin/python` resolves to nothing and `backend/.venv/bin/pytest` fails with
      `cannot execute: required file not found`. Every test command in all five phase plans is
      `cd backend && .venv/bin/pytest …`, so nothing is runnable until this is fixed. The
      system interpreter is now Python 3.14.6. Rebuild with `./install.sh` (which also
      installs frontend deps and builds), or backend-only:
      `cd backend && rm -rf .venv && python3 -m venv .venv && .venv/bin/pip install -r
      requirements.txt`. `backend/.venv/` is git-ignored (`.gitignore:11`), so this touches no
      tracked file. Note that Phase 0 Task 4 additionally runs `npm install` for `vitest`.
- [ ] **Baseline green.** `cd backend && .venv/bin/pytest -q` passes before any change; record
      the count in the ledger. This is only meaningful after the venv rebuild above.
- [ ] **Reference corpus present.** `ls "$PLOTDIG_REF_DIR/test" "$PLOTDIG_REF_DIR/samples"`
      resolves (default `/home/valentin/Projects/t/engauge-digitizer`). If absent, reference
      tests skip and only the synthetic layer runs — record that in the ledger, because the
      precision gates in spec §10.4 that depend on the corpus cannot then be verified.
- [ ] **Ledger.** Create `<workspace>/progress.md` with
      `# SDD ledger — plan: docs/superpowers/plans/2026-09-04-precision-toolkit-<phase>.md`
      per phase. One ledger per phase plan; never share a ledger between plans.
- [ ] **Pre-flight conflict scan.** Run the plan-conflict scan from
      superpowers:subagent-driven-development over the phase plan you are about to execute, and
      write the table to the ledger. The known cross-phase contact points to check are listed
      in §5.

## 2. What is being changed, in one table

| Track | Engauge technique | Lands as | Phase |
|---|---|---|---|
| A | 3-point affine / floating-axes transform | `orthogonal`/`affine`/`projective` solver — skewed plots digitize correctly **without** warping pixels | 1 |
| A | Axes checker | implied-axis overlay after calibration changes | 1 |
| A | Status-bar resolution | graph units per pixel readout | 1 |
| A | Discretize (colour filter) | per-curve `ColorFilter`, five modes, mask overlay | 2 |
| A | Grid removal + healing | `detect_grid` / `remove_grid` on the mask | 2 |
| A | (accuracy floor discussion) | subpixel intensity-centroid `snap_to_ink` | 2 |
| A | Segment-fill precision | `Improve` v2 rebuilt on the shared mask + snap | 3 |
| B | Segment fill | click a stroke → evenly spaced points, optional corner fill | 3 |
| B | Curve erase workflow | existing `remove-from-plot` route finally gets UI | 3 |
| D | Point match (FFT correlation) | `match_points` via OpenCV `TM_CCORR_NORMED` + accept/reject UX | 4 |
| D | Point graphs | `connect_as: "scatter"` curves | 4 |
| D | Polar coordinates | polar adapter, θ units, log radius, non-zero origin radius | 1 + 4 |
| D | Scale bar / maps | map adapter, two-point bar + length | 1 + 4 |

Deliberately **not** ported: date/time and DMS units, multiple coordinate systems per image,
cubic-spline and shared-X export, geometry/area windows, polynomial fitting, guidelines,
PDF/JPEG2000 import, CLI batch mode. See spec §2.

## 3. Test strategy in brief

Three layers, all required, detailed in spec §10.

1. **Synthetic unit tests** — `backend/tests/synth/plotgen.py` renders analytic plots whose
   pixel↔data mapping is known exactly, so every precision claim is a measured number.
2. **Reference-corpus example tests** — `backend/tests/reference/refcorpus.py` parses the
   Engauge example documents as *data* (78 embedded images, ground-truth axis and curve
   points, 81 expected CSVs, 9 pixel-aligned grid/no-grid sample pairs) and checks our output
   against them. Marked `@pytest.mark.reference`, skipped when the corpus is absent.
3. **Precision baselines** — `backend/tests/metrics.py` + `baselines/metrics.json` record the
   achieved accuracy per fixture and fail when a change makes it worse.

## 4. Phase index

Each phase plan is self-contained and ships working software.

| Phase | Plan file | Tasks | Depends on |
|---|---|---|---|
| 0 | `2026-09-04-precision-toolkit-phase0-test-foundation.md` | 4 | — |
| 1 | `2026-09-04-precision-toolkit-phase1-calibration.md` | 8 | 0 |
| 2 | `2026-09-04-precision-toolkit-phase2-conditioning.md` | 6 | 0 |
| 3 | `2026-09-04-precision-toolkit-phase3-autodigitize.md` | 5 | 0, 2 |
| 4 | `2026-09-04-precision-toolkit-phase4-scatter-polar.md` | 5 | 0, 1, 2, 3 |

```
0 ──┬──▶ 1 ──────────────┐
    └──▶ 2 ──▶ 3 ────────┴──▶ 4
```

**Execute strictly in phase order 1 → 2 → 3 → 4.** Phases 1 and 2 have no technical
dependency on each other, but they share `schemas.py`, `api/sessions.py`, `pipeline.py`,
`types.ts`, `App.tsx` and `EditorCanvas.tsx`, so they cannot run concurrently anyway; fixing
the order also fixes the `UPDATES.md` version each phase claims (see the rulings log).

Execute one phase plan per subagent-driven-development run: setup → per-task loop → final
whole-branch review → `UPDATES.md` entry → stop and report to the user.

## 5. Cross-phase contact points (check these in every pre-flight scan)

| File | Touched by | Risk |
|---|---|---|
| `backend/app/models/schemas.py` | 1, 2, 3, 4 | concurrent field additions; each phase must re-read the file, never assume its Phase-0-era contents |
| `backend/app/api/sessions.py` | 1, 2, 3, 4 | route ordering and shared error contract |
| `backend/app/pipeline/pipeline.py` | 2, 3, 4 | `build_curve_mask` is the interface Phases 3 and 4 consume |
| `backend/app/cv/improve.py` | 3 | must keep its current public entry point for `run_cv_improve` |
| `backend/tests/reference/baselines/metrics.json` | 1, 2, 3, 4 | append-only in practice; never regenerate wholesale to make a gate pass |
| `frontend/src/types.ts`, `api/client.ts`, `App.tsx` | 1, 2, 3, 4 | additive only |
| `frontend/src/components/EditorCanvas.tsx` | 1, 2, 3, 4 | one canvas-mode union; each phase adds exactly one mode |
| `frontend/src/components/AutoDigitizePanel.tsx` | 3 creates, 4 extends | Phase 4 must extend, not rewrite |
| `UPDATES.md` | every phase | newest entry on top, one version bump per phase |

## 6. Execution protocol — subagents and reviewers

Follow superpowers:subagent-driven-development exactly. Model assignments for this project,
per the user's instruction to use Grok:

| Seat | Model | Notes |
|---|---|---|
| Implementer (all tasks) | `cursor-grok-4.6-high` | one task per dispatch, never parallel |
| Task reviewer (all tasks) | `cursor-grok-4.6-high` | fresh subagent, spec-compliance + quality verdicts both required |
| Scoped re-reviewer (fix rounds) | `cursor-grok-4.6-high` | verdicts each finding ADDRESSED / NOT ADDRESSED |
| Fix-loop rounds 4–5 | `cursor-grok-4.6-high`, fresh subagent | fresh eyes on the same task |
| Final whole-branch review | `cursor-grok-4.6-high` | uses superpowers:requesting-code-review's `code-reviewer.md` |

Banned by the workspace agent-permissions rule: Composer 2.5 **fast** and Kimi 3 as subagents.
Always name the model explicitly in every dispatch — an omitted model silently inherits the
controller's.

**Loop mechanics** (from the skill, restated so the controller does not have to re-read it):
record `BASE = git rev-parse HEAD` before each dispatch; hand the implementer a task brief file
(`scripts/task-brief PLAN_FILE N`) and a report file path, never the whole plan; hand the
reviewer the brief, the report and a review package (`scripts/review-package PLAN_FILE BASE
HEAD`); five fix rounds maximum per task, rounds 1–3 resume the same implementer; log every
task's outcome to the ledger; adjudicate only at the cap and record every ruling.

**Project-specific reviewer lens.** In addition to the reviewer template's own rubric, every
task reviewer for this project must be handed these checks:

1. **Licence.** No Engauge source code copied or transcribed; no Engauge asset added to the
   repo. Reference data is read from `PLOTDIG_REF_DIR` at test time only.
2. **Backward compatibility.** Existing four-bound calibration numbers unchanged (1e-12);
   existing sessions and `.pdproj.json` projects still load; `Improve` / `Densify` still work
   through their current API and UI.
3. **Test honesty.** Tests assert on real behaviour, not on mocks. Precision gates measure
   against synthetic ground truth or corpus expectations — a test that computes a metric and
   asserts nothing, or that loosens a spec §10.4 gate without recorded evidence, is a defect.
   Baseline files must not be regenerated to make a failing gate pass.
4. **Corpus-optional.** Reference tests are marked and skip cleanly; `pytest -q` passes with
   `PLOTDIG_REF_DIR` pointing nowhere.
5. **Dependency floor.** No new backend dependency; frontend additions limited to `vitest` and
   `@vitest/coverage-v8`.
6. **Scope.** Nothing from spec §2's non-goals sneaks in.
7. **Pixels canonical.** No feature stores data-space values as the primary truth.

## 7. Definition of done (whole project)

- [ ] All five phase plans executed, each with a clean final whole-branch review.
- [ ] `cd backend && .venv/bin/pytest -q` green **with** the reference corpus present.
- [ ] `cd backend && PLOTDIG_REF_DIR=/nonexistent .venv/bin/pytest -q` green (corpus-optional).
- [ ] `cd frontend && npm test` green; `cd frontend && npm run build` and `npm run lint` clean.
- [ ] Every spec §10.4 acceptance gate either met, or reported with the measured value and a
      recorded ruling explaining why the target moved.
- [ ] `backend/tests/reference/baselines/metrics.json` populated with the achieved metrics for
      every gated capability.
- [ ] A skewed photo digitizes accurately through `affine`/`projective` calibration **without**
      applying unskew, demonstrated by a passing test.
- [ ] `UPDATES.md` carries one entry per phase, newest on top, versions bumped per the
      project's `ver.subver.subsubver` policy; `README.md` reflects the new coordinate systems,
      image conditioning, segment fill and point match.
- [ ] Branch left unmerged and unpushed, presented to the user via
      superpowers:finishing-a-development-branch.

## 8. Rulings log (controller fills in during execution)

Every decision taken on the user's behalf goes here as
`Ruling: <what was decided> — <why> — <cost if wrong>`, mirrored from the phase ledgers so the
user has one place to review them.

- **Ruling: `build_curve_mask` is `(session: Session, image_bytes: bytes, curve_id: str) -> np.ndarray`.**
  Phase 2's brief said `(session, curve_id)`, which cannot work — `Session` carries no pixels;
  `backend/app/store` keeps image bytes outside the model and every existing pipeline entry
  point (`run_cv_improve`, `run_resample`, `run_remove_curve_from_plot`, `run_unskew_apply`)
  takes `(session, image_bytes, …)`. Phase 3 independently noticed this and proposed
  `(session, curve_id, img)` with a decoded array, which fixes the omission but breaks the
  house argument order and the bytes-not-ndarray convention at the pipeline boundary.
  Decided: match `run_cv_improve` exactly. Decoding stays inside the pipeline function.
  *Cost if wrong:* a mechanical signature change across `pipeline.py` and its callers in
  Phases 2–4, caught by the first task that consumes the mask.
- **Ruling: Phase 1 owns the `addPointMode` → `canvasMode` migration; later phases only add
  mode values.** Spec §5.3 calls for *one* mode union on `EditorCanvas`, but no phase claimed
  the migration of today's `addPointMode` boolean. The result was a three-way seam: Phase 1
  introduces `canvasMode` (18 references) without mentioning `addPointMode`; Phase 2 keeps
  both alive in parallel (`(addPointMode || canvasMode === 'pick-color')`, and
  `setStageDraggable(!addPointMode && canvasMode !== 'pick-color' && …)`); Phase 3 states
  "Do not pass `addPointMode`. Place-points is `canvasMode === 'place'`". Two coexisting mode
  mechanisms can disagree, which is precisely the class of bug this project has already paid
  for in canvas interactions. Decided: Phase 1 Task 8 removes `addPointMode` /
  `onAddPointModeChange` entirely and replaces them with `canvasMode: CanvasMode` +
  `onCanvasModeChange`, wiring `'select' | 'place' | 'axis'` through `App.tsx`,
  `CurveList.tsx` and `EditorCanvas.tsx`; Phase 2 adds only `'pick-color'`, Phase 3 only
  `'segment-fill'`, Phase 4 only `'point-match'`, and none of them may reference
  `addPointMode`. *Cost if wrong:* Phase 1's UI task grows by one prop rename across three
  components, and Phase 2's `EditorCanvas` edits need rebasing onto the union.
- **Ruling: phases execute strictly 1 → 2 → 3 → 4, and versions are fixed per phase.**
  Phase 2 hardcoded `2.3.0` while Phase 4 independently assigned `2.3.0`–`2.6.0` by phase
  number; with Phases 1 and 2 free to run in either order, both cannot be right. Rather than
  make each docs task read-and-bump at completion time (my first instinct), the simpler fix
  is to remove the freedom that created the ambiguity: the phases already cannot run
  concurrently (they share `schemas.py`, `api/sessions.py`, `pipeline.py`, `types.ts`,
  `App.tsx`, `EditorCanvas.tsx`), so a fixed order costs nothing. Adopt Phase 4's table:
  Phase 1 → `2.3.0` "Affine, projective, polar and map calibration"; Phase 2 → `2.4.0`
  "Colour filter, grid removal and subpixel snap"; Phase 3 → `2.5.0` "Segment-fill
  auto-digitize"; Phase 4 → `2.6.0` "Scatter point-match, polar/map preview and export".
  Phase 2's plan is corrected from `2.3.0` to `2.4.0`. Phase 0 also claimed `2.3.0`; it is
  corrected to `2.2.3`, because it ships test and build infrastructure only — no user-facing
  feature and no change to application behaviour — which the project's policy scores as a
  subsubver bump. *Cost if wrong:* if the user reorders
  phases, one `UPDATES.md` entry needs renumbering — visible in that phase's final review.
- **Ruling: the crossing-strokes gate asserts 2 segments AND no cross-diagonal jump.**
  Phase 3 specified "exactly 2 segments" for two crossing strokes. Column-scan run-linking
  sees the two strokes merge into a single run at the junction, so producing exactly 2
  correctly-paired polylines requires direction-based disambiguation at merge points. The
  property that actually matters for digitization is that no segment jumps from one diagonal
  to the other; a bare count can pass while pairing is wrong. Decided: keep the count of 2 as
  the gate but add the no-jump assertion beside it, so the test cannot pass with swapped
  branches. *Cost if wrong:* the junction-disambiguation work is larger than the task
  estimate and lands as a fix round rather than first-pass.
- **Ruling: any test that records a `metrics.json` baseline must exercise the shipped code
  path.** Phase 4's three `test_pipeline_*` reference tests called Phase 3's
  `fill_segment` without `mask=`, which skips the `snap_to_ink` pass that the real
  auto-digitize pipeline always performs. The tests still asserted production gates
  (1% peak and RMS) and still wrote `pipeline.*` baselines, so they would have frozen
  numbers from a path that never ships and gone blind to subpixel-snap regressions.
  Corrected to pass `mask=mask` in all three. Generalized: when a precision test calls a
  CV primitive directly rather than through the pipeline, its arguments must match what the
  pipeline passes. *Cost if wrong:* baselines recorded on the first run are slightly tighter
  than the un-snapped path, so a later deliberate removal of snapping needs an explicit
  `--update-baselines`.
