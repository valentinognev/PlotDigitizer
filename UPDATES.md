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
