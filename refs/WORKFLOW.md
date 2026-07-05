# PlotDigitizer — Implementation Workflow

> **This document is the authoritative build specification for the implementing agent.**
> Read it fully before writing any code. Current product version: **v2.0** (manual-only).

---

## 0. Mandatory Agent Protocol (READ FIRST)

These rules are **non-negotiable** and apply to every agent that touches this repo.

1. **`UPDATES.md` is mandatory reading and maintaining.**
   - **Before starting any work**, read `UPDATES.md` to learn the current version and recent
     history.
   - **After completing any change** (feature, fix, refactor, docs), append an entry to
     `UPDATES.md` and bump the version.
2. **Versioning uses the `ver.subver.subsubver` pattern** (semantic-style):
   - `subsubver` → bug fixes / patches / docs / small tweaks.
   - `subver` → new feature, new component, or notable enhancement.
   - `ver` → milestone or breaking change.
3. **Keep components small and single-purpose.** If a file grows past a few hundred lines or
   takes on a second responsibility, split it.
4. **Tests accompany logic.** Calibration math, schema validation, exports, and CV helpers must
   have unit tests.
5. **Pixel coordinates are the source of truth.** Data-space values are always *derived* through
   the current calibration, never stored as the primary value.

---

## 1. Project Overview (v2.0)

PlotDigitizer extracts numerical data points from a static image of a plot containing one or
more curves. It is **manual and human-in-the-loop**:

- The **user** calibrates axes by placing four bounds on the plot and entering numeric min/max
  values (linear or log per axis).
- The **user** places seed points on each curve and edits them interactively.
- **Classical computer vision (OpenCV)** can trace between seed points (**Improve**) and
  densify along a curve (**Resample / Densify**).
- A **calibration** transform maps pixels to real data values.
- Results export to **CSV**, **JSON**, and full **project** files (`.pdproj.json`).

### Core flow

```
1. Upload image           → POST /sessions                         → sessionId
2. Place axis bounds      → PATCH /sessions/{id}/preferences     (calibration)
3. User places/edits points on canvas
4. Optional CV refine     → POST /sessions/{id}/curves/{id}/cv-improve
5. Optional densify       → POST /sessions/{id}/resample
6. Repeat edits until satisfied
7. Export                 → GET /sessions/{id}/export?format=csv|json
                          → project save via export JSON / load-project
```

---

## 2. Tech Stack

| Layer            | Choice                                                                 |
|------------------|------------------------------------------------------------------------|
| Backend          | **Python + FastAPI** (async, Pydantic models, auto OpenAPI docs)       |
| CV               | **OpenCV + NumPy** (tracing, improvement, resampling, erase)           |
| Persistence      | **In-memory session store** + last-session dir + project files       |
| Frontend         | **React + Tailwind CSS** + **Vite**                                    |
| Image editing UI | **Konva.js / react-konva**                                             |
| Preview chart    | **Plotly**                                                             |
| Exports          | **CSV, JSON, project (`.pdproj.json`)**                                |

> **v2.0 note:** Vision LLM / API-key settings were removed. Legacy `vlm/` and `settings/`
> directories may still exist on disk but are **not mounted** by `main.py` and must not be
> reintroduced without an explicit product decision.

---

## 3. Repository Layout (current)

```
PlotDigitizer/
├── README.md
├── UPDATES.md                # MANDATORY maintain
├── refs/WORKFLOW.md          # this file
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, sessions router only
│   │   ├── api/sessions.py   # all session routes
│   │   ├── models/schemas.py
│   │   ├── store/            # session_store, persistence, temp images
│   │   ├── cv/               # improve, resample, erase, trace, order, unskew
│   │   ├── calibration/
│   │   ├── export/           # export, import_curves, project_io
│   │   └── pipeline/pipeline.py
│   └── tests/
└── frontend/
    └── src/
        ├── App.tsx
        ├── api/client.ts
        ├── types.ts
        ├── lib/              # transform, calibration, unskew, sessionPatch, colors, …
        └── components/
            ├── EditorCanvas.tsx
            ├── PreviewChart.tsx
            ├── UnskewPanel.tsx
            ├── CalibrationPanel.tsx
            ├── CurveList.tsx
            └── ExportPanel.tsx
```

---

## 4. Data Models (authoritative)

Implement as Pydantic on the backend; mirror as TypeScript types on the frontend.

```python
class CalibrationAxis:
    scale: Literal["linear", "log"]
    ref_points: list[RefPoint]      # >= 2; each {pixel:(x,y), value:float}

class Calibration:
    x: CalibrationAxis
    y: CalibrationAxis
    source: Literal["manual"]     # v2.0: manual only

class Point:
    id: str
    pixel: tuple[float, float]      # SOURCE OF TRUTH (image space)
    origin: Literal["ai", "user"]   # legacy import may use "ai"; new points are "user"

class Curve:
    id: str
    label: str
    color: str
    style: Literal["solid", "dashed", "dotted", "unknown"]
    visible: bool
    target_point_count: int         # default density for Improve / Densify
    points: list[Point]

class Session:
    id: str
    image_meta: ImageMeta
    calibration: Calibration | None
    manual_calibration: bool
    curves: list[Curve]
    workspace: WorkspaceState | None   # active_curve_id, resample_count
    history: list[HistoryEntry]        # undo/redo
```

**Coordinate rule:** Always store/edit `pixel`. Compute data values on demand through
`calibration`. Recalibrating instantly remaps every point.

---

## 5. Calibration (`calibration/calibration.py`)

- Build transform from reference points per axis (four bounds: xmin, xmax, ymin, ymax mapped to
  ref_points).
- Support **linear** and **log** scales (log: values must be `> 0`).
- Provide `pixel_to_data` and `data_to_pixel`; round-trip within floating tolerance.
- **Manual only:** user places four marks on the plot and types numeric min/max values.
- **Guards:** invalid or degenerate calibration → reject; **export disabled** until valid.

Frontend: `lib/transform.ts` and `lib/calibration.ts` mirror placement and bound editing.

---

## 6. CV Layer

| Module        | Purpose                                                          |
|---------------|------------------------------------------------------------------|
| `improve.py`  | Trace curve between user seed points along image features        |
| `resample.py` | Interpolate evenly spaced points along an existing curve         |
| `erase.py`    | Remove a traced curve from the plot image (remove-from-plot)     |
| `unskew.py`   | Perspective correction from calibration axis bounds (homography) |
| `mesh_warp.py`| Mesh (Coons) warp for curved paper; hybrid with homography       |
| `trace.py`    | Color segmentation / path helpers used by improve              |
| `order.py`    | Order points along curve direction before resample               |

CV operates at **original image resolution**. `image_meta.scale_factor` tracks any downscale
used internally.

---

## 7. API Endpoints (v2.1)

| Method | Path                                        | Purpose                              |
|--------|---------------------------------------------|--------------------------------------|
| GET    | `/health`                                   | Health check                         |
| GET    | `/sessions/last`                            | Restore last persisted session       |
| POST   | `/sessions`                                 | Upload image → create session        |
| GET    | `/sessions/{id}`                            | Fetch session                        |
| GET    | `/sessions/{id}/image`                      | Working plot image                   |
| POST   | `/sessions/{id}/calibration`                | Set/replace calibration              |
| PATCH  | `/sessions/{id}/preferences`                | Calibration + workspace autosave     |
| PATCH  | `/sessions/{id}/curves`                     | Point/curve edits                    |
| POST   | `/sessions/{id}/unskew/apply`               | Apply perspective or mesh warp + remap pixels |
| POST   | `/sessions/{id}/curves/{cid}/cv-improve`    | OpenCV trace along seed points       |
| POST   | `/sessions/{id}/curves/{cid}/remove-from-plot` | Erase curve from image            |
| POST   | `/sessions/{id}/resample`                   | Densify curve to N points            |
| POST   | `/sessions/{id}/import-curves`              | Import curves JSON (not project)     |
| POST   | `/sessions/load-project`                    | Load `.pdproj.json`                  |
| POST   | `/sessions/{id}/undo` / `redo`              | History (includes unskew apply)      |
| GET    | `/sessions/{id}/export?format=csv\|json`    | Export (blocked if cal invalid)      |

Errors return `{ "error": { "code", "message", "hint" } }`.

---

## 8. Frontend Workspace

Layout: **main grid = EditorCanvas + PreviewChart**; **sidebar = CurveList**; **toolbar =
UnskewPanel + CalibrationPanel + ExportPanel**.

- **EditorCanvas:** image background; draggable points; calibration marks (cyan X, magenta Y);
  axis-bound placement mode; optional unskew preview (warped image + inverse-mapped interaction);
  mesh boundary overlay in mesh mode (hidden during preview); zoom/pan; box-select; place-points mode.
- **UnskewPanel:** **Perspective** / **Mesh** mode; **Preview corrected** toggle; **Apply**
  (commits backend warp); **Cancel preview**; **Reset mesh** (mesh mode). Reuses calibration
  bound pixels (Xmin/Xmax/Ymin/Ymax). Preview is client-side; apply remaps image, calibration
  marks, and curve points (undo supported).
- **CalibrationPanel:** Place bounds button; two rows (X scale + Xmin/Xmax, Y scale + Ymin/Ymax);
  Save.
- **CurveList:** add/rename/recolor curves; Place points; Improve; Densify; show/hide.
- **PreviewChart:** live data-space Plotly preview.
- **ExportPanel:** open/save project, CSV/JSON export, curve import.

`lib/transform.ts` mirrors backend calibration math for instant preview.
`lib/unskew.ts` mirrors `cv/unskew.py` for perspective preview warp geometry.
`lib/meshWarp.ts` mirrors `cv/mesh_warp.py` for mesh preview warp and point mapping.

---

## 8a. Image unskew (v2.1+)

**Use case:** plot photos taken at an angle (rotation + linear skew / mild perspective), or paper
with curved or wavy edges that a single homography cannot flatten.

**Inputs:** the four calibration bound pixels — X-axis line through Xmin/Xmax, Y-axis line through
Ymin/Ymax, assumed orthogonal in the corrected view.

### Perspective mode (v2.1)

**Geometry:** intersect axes → plot quad → homography to axis-aligned rectangle (Ymax at top in
image coordinates). Expand output canvas to the bounding box of the full warped image so content
outside axis limits is not cropped.

### Mesh mode (v2.2)

**Geometry:** 4×4 boundary grid initialized from the calibration quad; interior derived via Coons
patch. Destination layout uses the same homography-framed plot rectangle; plot interior is re-warped
with mesh UV mapping, blending to homography outside the plot (with margin). Boundary vertices and
tangents are persisted in `workspace.mesh`.

**Preview:** frontend hybrid warp (`warpImageMeshToCanvas`); source rasterized to logical
`image_meta` dimensions before sampling so overlays stay aligned with the canvas.

**Flow:** place bounds → (mesh: adjust boundary) → preview (frontend) → apply (backend + pixel remap).

Design spec: `docs/superpowers/specs/2026-07-03-image-unskew-design.md`.

---

## 9. Error Handling Summary

| Failure                         | Behavior                                           |
|---------------------------------|----------------------------------------------------|
| Calibration invalid             | Block export; preview shows setup message          |
| Unskew geometry invalid         | Preview toggle shows toast; apply returns 400      |
| Mesh apply without vertices     | Apply returns 400 (`unskew_input`)                 |
| Log axis with non-positive value| Reject value on commit                             |
| CV improve with &lt; 2 points   | Button disabled; API returns error if forced       |
| Oversized image                 | Track scale in `image_meta`; CV uses working image |

---

## 10. Build Phases (historical v1 + v2.0)

Phases 1–9 below delivered **v1.x** (AI-assisted). **v2.0** removed VLM/settings and made
calibration fully manual. New work should target v2.0 behavior only.

### v2.2 — Mesh unskew (`2.2.0`)

- Mesh mode: 4×4 boundary grid, Coons patch, hybrid homography + mesh warp on apply.
- Backend `cv/mesh_warp.py`; frontend `lib/meshWarp.ts`, `MeshGridOverlay`.
- Mesh preview axis marks track corrected image (logical source rasterization, texture downscale).
- Workspace persists `unskew_mode` and `mesh.vertices`.
- **Accept:** upload curved/skewed photo → place bounds → adjust mesh → preview → apply → digitize.

### v2.1 — Image unskew (`2.1.0`)

- Unskew panel: preview + apply perspective correction from calibration bounds.
- Backend `cv/unskew.py`, `POST /sessions/{id}/unskew/apply`, undo support.
- Full-image warp (no crop to plot quad); correct Y orientation (Ymax above Ymin).
- **Accept:** upload skewed photo → place bounds → preview → apply → digitize on straightened image.

### v2.0 — Manual-only (`2.0.0`)

- Remove VLM pipeline, settings API, AIAssistBar, SettingsPanel.
- Manual four-bound calibration with numeric entry.
- CV improve / resample / remove-from-plot retained.
- **Accept:** upload → place bounds → enter values → place points → improve → export; no API keys.

### Historical v1 phases (complete)

<details>
<summary>Phases 1–9 (v0.1.0 → v1.0.0, AI-assisted — superseded by v2.0)</summary>

1. Backend skeleton & models  
2. Calibration math  
3. Settings & VLM abstraction *(removed in v2.0)*  
4. Pipeline, CV & merge *(detect/refine removed in v2.0)*  
5. Export  
6. Frontend scaffold  
7. Interactive editing  
8. AI iteration loop *(removed in v2.0)*  
9. Polish & docs  

</details>

---

## 11. Definition of Done (v2.2)

- Upload a multi-curve plot (or skewed/curved photo) → manually calibrate → optionally unskew
  (perspective or mesh) → place and edit points → optionally Improve / Densify → export accurate
  CSV/JSON or save project.
- Calibration is manual-only and is the single source of pixel↔data mapping.
- Unskew is optional; when applied, pixel coordinates and working image stay consistent.
- No external AI API keys or provider configuration required.
- `UPDATES.md` reflects the full history; current version documented in changelog.
