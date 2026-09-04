# UPDATES

> **MANDATORY for every agent / contributor.**
>
> - **Read this file before starting any work** to learn the current version and recent history.
> - **Update this file after every change** (feature, bug fix, refactor, docs) with a new entry
>   and a version bump.
> - Newest entries go at the **top** of the Changelog.

---

## Versioning Policy

Versions follow the **`ver.subver.subsubver`** pattern:

| Segment       | Bump when…                                                        |
|---------------|-------------------------------------------------------------------|
| `subsubver`   | bug fix, patch, docs tweak, or small change (e.g. `0.1.0 → 0.1.1`)|
| `subver`      | new feature, new component, or notable enhancement (`0.1.0 → 0.2.0`) |
| `ver`         | milestone or breaking change (`0.x.y → 1.0.0`)                    |

- The project starts at **`0.1.0`**.
- When `subver` bumps, reset `subsubver` to `0`. When `ver` bumps, reset `subver` and `subsubver`
  to `0`.

### Entry format

Each Changelog entry should use this template:

```
## [ver.subver.subsubver] — YYYY-MM-DD
### Added | Changed | Fixed | Removed
- <concise what + why>
```

Group bullets under the relevant headings (`Added`, `Changed`, `Fixed`, `Removed`). Reference the
relevant build phase from `refs/WORKFLOW.md` when applicable.

---

## Changelog

## [2.3.1] — 2026-09-04
### Fixed
- Last-session / project restore of `canvas_mode: axis` now reopens cartesian Precise (and drops map axis to select); Place points clears the Precise checkbox.

## [2.3.0] — 2026-09-04 — Affine, projective, polar and map calibration
### Added
- 2D transform solver (orthogonal / affine / projective, `auto`) plus polar and map adapters; precise 3+ axis points; axes checker overlay; graph-units-per-pixel readout.
### Changed
- Four-bound cartesian sessions keep producing the same numbers as the old 1D fit (exact to 1e-12).

## [2.2.4] — 2026-09-04
### Fixed
- **SynthPlot.truth** now records only drawn samples (`ymin <= y <= ymax`); clipped segments are omitted so later RMS gates cannot score undrawn points.

## [2.2.3] — 2026-09-04
### Added
- **Precision-toolkit test foundation (Phase 0):** Engauge reference-corpus parser
  (`backend/tests/reference/`, optional `PLOTDIG_REF_DIR`, never vendored), analytic
  synthetic plot generator (`backend/tests/synth/plotgen.py`), metrics/baseline harness
  with `--update-baselines`, and frontend Vitest plus a committed orthogonal
  Python↔TS transform-parity fixture.

## [2.2.2] — 2026-07-05
### Changed
- Mesh overlay: removed tangent handle controls on boundary nodes; only draggable position
  handles remain.

## [2.2.1] — 2026-07-05
### Added
- **Configurable mesh sections:** Unskew mesh mode now exposes − / + controls to change subdivisions
  per edge (default 3, range 2–8); resizing preserves the current boundary shape via Coons
  resampling. `sections` is persisted in workspace mesh payload and sent on apply.

### Changed
- Mesh grid math (frontend `meshWarp.ts`, backend `mesh_warp.py`) generalized from fixed 4×4 to
  variable `(sections + 1)²` vertex grids.

## [2.2.0] — 2026-07-05
### Added
- **Mesh unskew mode:** 4×4 boundary grid (Coons patch) for curved or wavy paper beyond simple
  perspective; draggable boundary vertices with tangent handles; mesh persisted in session
  workspace (`unskew_mode`, `mesh.vertices`).
- Backend `cv/mesh_warp.py`, hybrid homography + mesh warp on apply; frontend `lib/meshWarp.ts`,
  `MeshGridOverlay`, and mesh preview in `EditorCanvas`.
- `POST /sessions/{id}/unskew/apply` accepts `{ "mode": "mesh", "mesh": { "vertices": … } }`.

### Fixed
- Mesh preview: axis bound marks (Xmin/Xmax/Ymin/Ymax) stay aligned with the corrected image when
  **Preview corrected** is on — warp sampling now rasterizes the source into the logical
  calibration coordinate system (`image_meta` dimensions) so marks track the same pixels as the
  displayed canvas.
- Mesh preview: wait for the warped texture before transforming overlays; downscale large warped
  canvases to Konva’s max texture size with consistent mark placement.

### Changed
- Unskew panel: **Perspective** / **Mesh** mode toggle; **Reset mesh** when boundary was adjusted.
- Updated `README.md`, `refs/WORKFLOW.md`, and `frontend/README.md` for v2.2 mesh unskew.

## [2.1.3] — 2026-07-03
### Changed
- Updated `README.md`, `refs/WORKFLOW.md`, and `frontend/README.md` for v2.1 unskew workflow.

## [2.1.2] — 2026-07-03
### Fixed
- Unskew preview toggle: replaced hard-to-use checkbox with a button; enabled once axis bounds
  are placed; shows a toast when geometry is invalid.

## [2.1.1] — 2026-07-03
### Fixed
- Unskew preview/apply no longer crops to the axis quad — the full image is preserved so
  data outside axis limits remains visible.
- Unskew Y orientation: Ymax now appears above Ymin (correct image coordinates, y-down).

## [2.1.0] — 2026-07-03
### Added
- **Unskew panel:** preview and apply perspective correction from calibration axis bounds
  (Xmin/Xmax/Ymin/Ymax); remaps working image, calibration marks, and curve points on apply.
- `POST /sessions/{id}/unskew/apply` backend endpoint with undo support.

## [2.0.5] — 2026-07-03
### Changed
- Updated `README.md`, `refs/WORKFLOW.md`, and `frontend/README.md` for v2.0 manual-only workflow.

## [2.0.4] — 2026-07-03
### Changed
- Calibration min/max fields hide browser stepper arrows (plain text-style inputs).

## [2.0.3] — 2026-07-03
### Fixed
- Calibration min/max fields accept a leading minus while typing (e.g. `-0.25`).

## [2.0.2] — 2026-07-03
### Changed
- Calibration panel: two rows (X scale + Xmin/Xmax, Y scale + Ymin/Ymax) with title and actions on top.

## [2.0.1] — 2026-07-03
### Changed
- Calibration panel uses a single compact row (title, place bounds, scales, min/max inputs, save)
  instead of stacked sections.

## [2.0.0] — 2026-07-03
### Removed
- All AI / VLM integration: detect, refine, settings API, provider packages, and AI assist UI.
- AI-based curve removal from plot; OpenCV erase remains for manual remove-from-plot workflow.

### Added
- **Place axis bounds** button: click X min, X max, Y min, Y max on the plot image, then enter numeric
  axis values manually.
- Per-curve **Densify** control in the curve list (moved from the removed AI bar).

### Changed
- Calibration is manual-only (`source: manual`); linear/log scale and four bound markers on the plot.
- App subtitle and workflow are fully manual digitization (upload → calibrate → place points → export).

## [1.8.13] — 2026-06-26
### Fixed
- Detect axes no longer clears manually placed curves when the VLM returns an empty curve list.
- Preview chart: measured panel height, axis autorange, plot revision on data changes, and log-scale
  point filtering so curves render reliably after edits.
- Curve patch responses no longer drop saved calibration when the API omits it.

## [1.8.12] — 2026-06-26
### Added
- Place-points mode: Delete or Backspace removes the last point placed on the active curve.

## [1.8.11] — 2026-06-26
### Fixed
- Middle-mouse drag pans the plot in place-points mode (and other modes); left-click still
  places points when that mode is active.

## [1.8.10] — 2026-06-26
### Fixed
- Editor canvas data-point markers and calibration marks keep a constant on-screen size while
  zooming (inverse scale applied to radius, stroke, and hit area).

## [1.8.9] — 2026-06-26
### Changed
- Curve display colors use golden-ratio steps around the hue wheel so nearby curves stay
  visually distinct; lightly alternate saturation/lightness for extra separation.
- Sessions with clustered similar hues are auto-recolored to the new palette on load.

## [1.8.8] — 2026-06-26
### Fixed
- Editor canvas markers use each curve's display color again; user-edited points keep a gold
  outer ring instead of turning fully amber.
- Detect restores rainbow display colors and finalized point counts on newly detected curves.
- Sessions with duplicate curve display colors are auto-recolored to a distinct rainbow palette.

## [1.8.7] — 2026-06-12
### Fixed
- Preview chart uses log axes when calibration has log scale on X and/or Y.

## [1.8.6] — 2026-06-12
### Fixed
- Export uses the native **Save as** dialog when the browser supports it (avoids “download
  blocked”); otherwise falls back to form → hidden iframe.

## [1.8.5] — 2026-06-12
### Fixed
- Export downloads no longer blocked by the browser (synchronous navigation link
  instead of async blob download).

## [1.8.4] — 2026-06-12
### Fixed
- CSV and JSON export can be triggered repeatedly without reloading (programmatic
  download instead of a static link).

## [1.8.3] — 2026-06-12
### Changed
- CSV export no longer includes the `origin` column (user/ai). Import still accepts it when present.

## [1.8.2] — 2026-06-12
### Changed
- Plot interaction hint now mentions middle-mouse drag to pan the picture.

## [1.8.1] — 2026-06-12
### Added
- Interaction hint bar at the top of the plot panel (mouse buttons, Shift/Ctrl, pan, zoom).

## [1.8.0] — 2026-06-12
### Added
- **Project save/load (JSON):** export embeds the plot image (base64), source filename/path,
  calibration, all curves (pixel + data coords), manual-calibration flag, and workspace
  (active curve, AI hint, resample count, AI toggle). Use **Save JSON** / **Open** in the
  Project panel. `POST /sessions/load-project` restores a full session.
### Changed
- JSON export no longer requires calibration (CSV still does). Curve-only **Import** still
  accepts legacy data JSON/CSV; full project files must use **Open**.

## [1.7.5] — 2026-06-12
### Changed
- AI toggle in the Curves panel is **off** by default (Improve / Remove from plot use CV until enabled).

## [1.7.4] — 2026-06-12
### Added
- Rectangle (marquee) selection on the plot: drag on empty area to select points inside
  the box. Hold Shift/Ctrl/Cmd while dragging to add to the current selection.
### Changed
- Pan the plot with **Space + drag** (left-drag on empty area now draws a selection box).

## [1.7.3] — 2026-06-12
### Fixed
- Shift/Ctrl/Cmd multi-select on points: selection now applies on pointer down
  (mousedown was clearing the selection before the click handler ran).

## [1.7.2] — 2026-06-12
### Changed
- Plot clicks no longer add points by default; enable **Place points** in the Curves panel
  (active curve) then click the image to add points. Clicks on empty plot clear selection.

## [1.7.1] — 2026-06-12
### Added
- Multi-select data points with **Shift/Ctrl+click**; drag any selected point to move the
  whole selection together.

## [1.7.0] — 2026-06-12
### Added
- **Import curves** from CSV or JSON using the same format as export; replaces all curves on the
  current plot (data-space `x`/`y` mapped through the active calibration).
- `POST /sessions/{id}/import-curves` endpoint and **Import** button in the Export panel.

## [1.6.9] — 2026-06-12
### Fixed
- Manual calibration toggle no longer snaps off after enabling: manual mode is read from
  session state (with optimistic updates) and preserved when other session saves complete.

## [1.6.8] — 2026-06-12
### Added
- Session stores **manual calibration mode** (`manual_calibration`) with the figure; restored on
  reload together with axis mark positions and curve points.
- `PATCH /sessions/{id}/preferences` autosaves calibration and manual mode without flooding undo.

### Changed
- Manual axis mark moves, limit edits, and the Manual toggle now persist to the session
  automatically (same as curve point edits).

## [1.6.7] — 2026-06-12
### Fixed
- Deleting a curve (or other curve-only edits) no longer resets manual calibration mark
  positions; the draft calibration is only reloaded when the session changes or after
  Detect / Save calibration / Undo.

## [1.6.6] — 2026-06-12
### Changed
- Initial **Detect** (and per-curve **Re-detect**) now produces **9 points** per curve; the VLM
  prompt asks for 9 seed points and the pipeline resamples the traced path to 9.
- Default per-curve **Points** target (`target_point_count`) and Densify default are now **9**
  (was 30 / 50).

## [1.6.5] — 2026-06-12
### Fixed
- Point edits (move, add, delete, reassign) update the UI optimistically without the global
  progress bar, toast, or full-screen busy state, eliminating flicker on each drag.

### Changed
- Preview chart: stable Plotly layout (`uirevision`) and memoized traces to reduce redraw churn.

## [1.6.4] — 2026-06-12
### Fixed
- Improve (AI + CV): reorder hint points along the curve before building the guide polyline
  and resampling, fixing zig-zag polylines when points were placed or stored out of sequence.

## [1.6.3] — 2026-06-06
### Fixed
- Calibration mapping uses **two-point** fits at axis extremes (xmin/xmax/ymin/ymax) instead of
  least-squares over all ticks, fixing points on the plot baseline appearing below Y min in
  Plotly and export.

## [1.6.2] — 2026-06-06
### Added
- Curves panel: **+ Add** to create an empty curve; **×** on each curve to delete it
  (confirms when the curve has points).

## [1.6.1] — 2026-06-06
### Fixed
- Viewport layout: image and Plotly panels stay within the window; curves sidebar fills
  available height (removed fixed `max-h-64` cap).

## [1.6.0] — 2026-06-06
### Changed
- Layout: Settings, AI Assist, Calibration, and Export in a horizontal top bar; Curves sidebar
  on the right with its own scroll; main viewport uses `h-screen` so the page no longer scrolls.
- Preview chart constrained to the available panel height (no oversized Plotly plot).
- Calibration panel shows **X min / X max / Y min / Y max**; manual mode adds draggable marks
  on the plot image (cyan = X, magenta = Y).

## [1.5.2] — 2026-06-06
### Fixed
- **Remove from plot** (AI mode): when the VLM path deviates from user hint points, fall back to
  the tuned hint polyline instead of erasing along the inaccurate model trace; merge nearby VLM
  points only when the trace is trustworthy.

## [1.5.1] — 2026-06-06
### Fixed
- **Remove from plot** (AI mode): pass pixel tuples into the erase step instead of `Point`
  objects, fixing `too many values to unpack (expected 2)`.

## [1.5.0] — 2026-06-06
### Changed
- Per-curve **AI Improve** and **CV Improve** merged into a single **Improve** button; an **AI**
  toggle in the Curves panel selects the VLM or OpenCV path for both **Improve** and
  **Remove from plot**.
- **Remove from plot** with AI on: VLM traces the curve from hints, then erases along that path
  (`POST …/remove-from-plot` body `{ "use_ai": true }`).

## [1.4.2] — 2026-06-06
### Fixed
- **Remove from plot** uses a narrow hint corridor and ink-aware masking so the target curve is
  fully cleared without damaging nearby curves; removed inpainting that smeared neighboring lines.

## [1.4.1] — 2026-06-06
### Fixed
- Undo/redo now restores the working plot image (e.g. after **Remove from plot**), not only curves
  and calibration.

## [1.4.0] — 2026-06-06
### Added
- Per-curve **Remove from plot** button: erases the curve from the working plot image using hint
  points (OpenCV inpaint); original upload is preserved; working copies saved under `temp/{session_id}/`.
- `GET /sessions/{id}/image/original` returns the untouched upload.

## [1.3.3] — 2026-06-06
### Fixed
- CV Improve: snap to traced pixels along the hint polyline (arc-length) instead of x-column
  bucketing, fixing messy results on steep or vertically stacked curves.

## [1.3.2] — 2026-06-06
### Fixed
- CV Improve: sample actual line color from pixels under user hint points (fixes grayscale plots
  with rainbow display colors); disable Canny edge fallback; guide traced path along hint polyline
  instead of median-y-per-x through grid noise.

## [1.3.1] — 2026-06-06
### Changed
- Preview chart (Plotly): standard mode bar enabled (pan, zoom, reset axes, download image, etc.).

## [1.3.0] — 2026-06-06
### Added
- Per-curve **Points** target count (2–200) used when AI/CV improving a line.
- **CV Improve** button: traces the curve inside a bbox and corridor defined by your hint points
  using OpenCV (`POST /sessions/{id}/curves/{curve_id}/cv-improve`).

### Changed
- **AI Improve** (renamed from “Improve with my points”) resamples to the curve's target point
  count and fully replaces the old point list instead of accumulating.

### Fixed
- Improve operations no longer leave previous AI points on the curve after new ones appear.

## [1.2.0] — 2026-06-06
### Added
- Per-curve **Improve with my points** button: sends the curve's current pixel positions and the
  original image to the VLM so it can refine the line using the user's tuned hints.
- `POST /sessions/{id}/curves/{curve_id}/improve` endpoint and `run_improve_from_hints` pipeline.

## [1.1.3] — 2026-06-06
### Fixed
- Editor canvas: dragging a data point no longer pans the whole image off-screen (stage pan is
  disabled while dragging points; only background/image drags pan the view).
- Editor canvas: zoom and click coordinates now account for the fit-to-view scale factor.

## [1.1.2] — 2026-06-06
### Changed
- Curve display colors are always a rainbow spectrum by index; VLM-reported grayscale (or any)
  plot colors are stored separately as `trace_color` for OpenCV tracing only.
- Existing sessions with all-grayscale curve colors are auto-recolored to rainbow on load.

## [1.1.1] — 2026-06-06
### Changed
- Distinct curve colors: detection assigns a unique palette color per curve when the VLM returns
  duplicates or the default blue; new curves from refine avoid colors already in use.
- Editor canvas marks use each curve's color (user-added points keep a gold ring for distinction).
- Preview chart markers match curve line colors.

## [1.1.0] — 2026-06-06
### Added
- `install.sh`: installs backend venv/deps, frontend npm deps, and production build.
- `start.sh`: starts backend (uvicorn) and frontend (vite preview) in the background and returns
  to the shell; PID/log files under `.run/`.
- `kill.sh`: stops background servers using PID files.

### Changed
- `frontend/vite.config.ts`: added `preview.proxy` so API routes work when started via `start.sh`.

## [1.0.0] — 2026-06-06
### Added
- Full backend (Phases 1–5): FastAPI app, Pydantic schemas, in-memory session store, calibration
  (linear/log), provider-agnostic VLM layer (OpenAI, Anthropic, Gemini), OpenCV trace/refine/resample,
  detect/refine/resample/merge pipeline, CSV/JSON export, settings API with persisted keys in
  `backend/config/settings.json`.
- Full frontend (Phases 6–8): React + Tailwind + Vite app with Konva editor canvas, Plotly preview,
  Settings/Calibration/CurveList/AIAssistBar/Export panels, drag/add/delete/reassign points,
  region and text hints, resample, undo/redo.
- Backend tests: calibration, merge, schema, CV trace, export, API session/settings (12 tests).

### Changed
- `README.md`: updated getting-started and status for the implemented application.

### Notes
- v1 milestone complete per `refs/WORKFLOW.md` Definition of Done.

## [0.1.0] — 2026-06-06
### Added
- Initial project specification and documentation.
- `refs/WORKFLOW.md`: authoritative implementation spec — hybrid VLM+CV pipeline, data models,
  VLM JSON contract, iteration/merge rules, calibration, API endpoints, settings/API-key handling,
  frontend workspace, error handling, and 9 build phases with acceptance criteria.
- `README.md`: project background, architecture overview, tech stack, API-key handling, and
  getting-started guide.
- `UPDATES.md`: this file — versioning policy (`ver.subver.subsubver`) and mandatory-maintenance
  protocol.
- `.gitignore`: ignores secrets (`config/settings.json`), Python and Node build artifacts.

### Notes
- No application code yet. Implementation proceeds per the build phases in `refs/WORKFLOW.md`,
  starting with Phase 1 (backend skeleton & models), which should bump this file to `0.2.0`.
