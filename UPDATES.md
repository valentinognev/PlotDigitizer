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
