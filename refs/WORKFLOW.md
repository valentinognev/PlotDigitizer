# PlotDigitizer — Implementation Workflow

> **This document is the authoritative build specification for the implementing agent.**
> Read it fully before writing any code. Build in the phase order given. Do not skip the
> acceptance criteria at the end of each phase.

---

## 0. Mandatory Agent Protocol (READ FIRST)

These rules are **non-negotiable** and apply to every agent that touches this repo.

1. **`UPDATES.md` is mandatory reading and maintaining.**
   - **Before starting any work**, read `UPDATES.md` to learn the current version and recent
     history.
   - **After completing any change** (feature, fix, refactor), append an entry to `UPDATES.md`
     and bump the version.
2. **Versioning uses the `ver.subver.subsubver` pattern** (semantic-style):
   - `subsubver` → bug fixes / patches / docs / small tweaks.
   - `subver` → new feature, new component, or notable enhancement.
   - `ver` → milestone or breaking change.
   - The project starts at **`0.1.0`**.
3. **Never commit secrets.** API keys live in `config/settings.json`, which is gitignored.
4. **Keep components small and single-purpose.** If a file grows past a few hundred lines or
   takes on a second responsibility, split it.
5. **Tests accompany logic.** Calibration math, merge rules, schema validation, and exports must
   have unit tests. The VLM provider is always **mocked** in tests — no live API calls.
6. **Pixel coordinates are the source of truth.** Data-space values are always *derived* through
   the current calibration, never stored as the primary value.
7. **AI is additive, never destructive.** AI output must never overwrite points the user has
   manually edited unless the user explicitly re-detects that curve.

---

## 1. Project Overview

PlotDigitizer extracts numerical data points from a static image of a plot containing one or
more curves. It is **AI-assisted and human-in-the-loop**:

- A **Vision LLM (VLM)** understands the plot semantically (axes, tick labels, legend, which
  curves exist, rough point locations).
- **Classical computer vision (CV)** refines those rough seed points to precise pixel positions.
- A **calibration** transform maps pixels to real data values (linear or log).
- The **user** corrects everything interactively and asks the AI to iterate on problem areas
  until all curves are fully digitized.
- The result exports to **CSV** and **JSON**.

### Core flow (one iteration)

```
1. Upload image                  → POST /sessions                  → sessionId
2. AI auto-detect axes + curves  → POST /sessions/{id}/detect
3. User confirms/edits calibration (AI-detected, or manual 2-point mode)
4. User edits points on canvas (drag / add / remove / reassign)
5. User asks AI for help on a region:
     - region hint → POST /sessions/{id}/refine  (bbox)
     - text hint   → POST /sessions/{id}/refine  (instruction)
     - resample    → POST /sessions/{id}/resample (CV only, no VLM)
6. Repeat 4–5 until satisfied
7. Export                        → GET /sessions/{id}/export?format=csv|json
```

---

## 2. Tech Stack (fixed decisions)

| Layer            | Choice                                                                 |
|------------------|------------------------------------------------------------------------|
| Backend          | **Python + FastAPI** (async, Pydantic models, auto OpenAPI docs)       |
| AI brain         | **Provider-agnostic VLM abstraction** (one default impl, swappable)    |
| CV               | **OpenCV + NumPy** (segmentation, tracing, refinement, resampling)     |
| Persistence      | **In-memory session store** (designed swappable; no DB in v1)          |
| Frontend         | **React + Tailwind CSS**                                               |
| Image editing UI | **Konva.js / react-konva** (image layer + draggable point overlay)     |
| Preview chart    | **Plotly** (clean replot of extracted data, live)                      |
| Config/secrets   | **Plaintext `config/settings.json`** in program dir (gitignored)       |
| Exports          | **CSV, JSON**                                                          |

---

## 3. Repository Layout (target)

```
PlotDigitizer/
├── README.md                 # architecture + background (maintain)
├── UPDATES.md                # version history + bug log (MANDATORY maintain)
├── .gitignore
├── refs/
│   └── WORKFLOW.md           # this file
├── backend/
│   ├── pyproject.toml        # or requirements.txt with pinned versions
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, router mounting, startup load
│   │   ├── api/
│   │   │   ├── sessions.py   # session + detect/refine/resample/export routes
│   │   │   └── settings.py   # API-key / provider settings routes
│   │   ├── models/
│   │   │   └── schemas.py    # Pydantic models (Session, Curve, Point, Calibration...)
│   │   ├── store/
│   │   │   └── session_store.py  # in-memory store, swappable interface
│   │   ├── settings/
│   │   │   └── settings_store.py # read/write config/settings.json
│   │   ├── vlm/
│   │   │   ├── base.py       # VLMProvider interface + response schema
│   │   │   ├── openai_provider.py   # default impl (example)
│   │   │   ├── anthropic_provider.py
│   │   │   ├── gemini_provider.py
│   │   │   └── factory.py    # build active provider from settings
│   │   ├── cv/
│   │   │   ├── refine.py     # snap VLM seed points to real pixels
│   │   │   ├── trace.py      # color segmentation + curve tracing
│   │   │   └── resample.py   # densify points along a traced path
│   │   ├── calibration/
│   │   │   └── calibration.py # pixel<->data transforms (linear/log)
│   │   └── pipeline/
│   │       └── pipeline.py   # orchestrate detect/refine/resample + merge rules
│   ├── config/
│   │   └── settings.json     # created at runtime (gitignored)
│   └── tests/
│       ├── fixtures/         # sample plot images + canned VLM JSON
│       ├── test_calibration.py
│       ├── test_merge.py
│       ├── test_schema.py
│       ├── test_cv.py
│       └── test_export.py
└── frontend/
    ├── package.json
    ├── index.html
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/client.ts          # typed backend client
        ├── types.ts               # TS mirror of backend schemas
        ├── state/                 # session reducer (points/curves/calibration/history)
        ├── lib/transform.ts       # pixel<->data transforms (mirror of backend)
        └── components/
            ├── EditorCanvas.tsx   # Konva image + draggable points + region draw
            ├── PreviewChart.tsx   # Plotly replot of extracted data
            ├── CalibrationPanel.tsx
            ├── CurveList.tsx      # rename/recolor/visibility/active curve
            ├── AIAssistBar.tsx    # text hint / region hint / resample / re-detect
            ├── SettingsPanel.tsx  # provider select + API key entry (masked)
            └── ExportPanel.tsx    # CSV / JSON download
```

---

## 4. Data Models (authoritative)

Implement as Pydantic on the backend and mirror as TypeScript types on the frontend.

```python
class CalibrationAxis:
    scale: Literal["linear", "log"]
    ref_points: list[RefPoint]      # >= 2; each {pixel:(x,y), value:float}

class Calibration:
    x: CalibrationAxis
    y: CalibrationAxis
    source: Literal["ai", "manual"]

class Point:
    id: str
    pixel: tuple[float, float]      # SOURCE OF TRUTH (image space)
    origin: Literal["ai", "user"]   # user points are protected from AI overwrite
    # data-space (x, y) is DERIVED via Calibration, never stored

class Curve:
    id: str
    label: str                      # editable; from legend if detected
    color: str                      # hex
    style: Literal["solid", "dashed", "dotted", "unknown"]
    visible: bool
    points: list[Point]

class Session:
    id: str
    image_meta: ImageMeta           # width, height, original + downscale factor
    calibration: Calibration | None
    curves: list[Curve]
    history: list[HistoryEntry]     # undo/redo + UPDATES traceability
```

**Coordinate rule:** Always store/edit `pixel`. Compute data values on demand through
`calibration`. Recalibrating instantly remaps every point with no AI re-run.

---

## 5. VLM Contract

The VLM MUST return strict JSON (no prose). The backend validates against a Pydantic schema and
performs **one automatic JSON-repair retry** before surfacing an error.

```jsonc
{
  "axes": {
    "x": { "scale": "linear", "ticks": [ {"pixel": [x, y], "value": 0}, ... ] },
    "y": { "scale": "log",    "ticks": [ ... ] }
  },
  "curves": [
    {
      "label": "Series A",
      "color_hex": "#d62728",
      "style": "solid",
      "seed_points": [[x, y], ...]   // rough, sparse pixel positions
    }
  ],
  "notes": "free-text caveats, e.g. 'two curves overlap near x=5'"
}
```

- **detect**: full image → full structure above.
- **refine**: image + region bbox **or** text instruction → only the new/corrected curve(s).
- **resample**: **does not call the VLM** — pure CV interpolation along an existing curve.

### VLMProvider interface (`vlm/base.py`)

```python
class VLMProvider(Protocol):
    def detect(self, image: bytes) -> VLMResponse: ...
    def refine(self, image: bytes, *, region: BBox | None,
               instruction: str | None, existing: list[Curve]) -> VLMResponse: ...
```

`factory.py` reads the active provider + key from settings and returns the right impl. Adding a
new provider = one new file implementing the interface. Default provider: choose one (e.g.
OpenAI vision); keep all three stubs in place behind the interface.

---

## 6. Iteration & Merge Rules (critical correctness logic)

Every AI call is **stateless and merge-based**. The pipeline merges AI proposals into the session
using these rules:

1. New curves → **append**.
2. `refine` with a region/instruction → **replace only the targeted curve/region**.
3. Points tagged `origin: "user"` are **protected**: AI never moves or deletes them unless the
   user explicitly triggers a full re-detect of that curve.
4. Every merge pushes a `HistoryEntry` → supports **undo/redo**.

Implement merge as a **pure function**: `merge(session, vlm_response, op) -> session`, fully unit
tested (`test_merge.py`), independent of any network/AI call.

---

## 7. Calibration (`calibration/calibration.py`)

- Build transform from `>= 2` reference points per axis.
- Support **linear** and **log** scales (log: validate all values `> 0`, transform in log space).
- Provide both directions: `pixel_to_data(px) -> (x, y)` and `data_to_pixel(x, y) -> px`.
- Round-trip must be accurate to floating tolerance — test it (`test_calibration.py`).
- **Modes:**
  - *AI*: seed `ref_points` from VLM-detected ticks; user confirms/edits in `CalibrationPanel`.
  - *Manual*: user clicks `>=2` points per axis on the canvas and types values; sets
    `source: "manual"`.
- **Guards:** fewer than 2 ref points, collinear/degenerate points, or non-positive values on a
  log axis → reject with a clear error; **export is disabled until calibration is valid.**

---

## 8. CV Layer

- **`trace.py`** — color segmentation (cluster by VLM-reported `color_hex` and proximity) +
  curve tracing to produce dense pixel paths per curve.
- **`refine.py`** — snap each VLM seed point onto the nearest traced pixel for the matching curve;
  handle region re-detection (only operate inside the requested bbox).
- **`resample.py`** — given a curve's traced path and a target density, produce evenly spaced
  points along it (no VLM).
- **Failure**: if a region yields nothing, return empty + a `note`; the UI then suggests a text
  hint or manual points.
- **Resolution**: VLM may receive a downscaled image; CV always uses original resolution. Track
  the scale factor in `image_meta` and convert seed pixels accordingly.

---

## 9. API Endpoints

| Method | Path                          | Purpose                                             |
|--------|-------------------------------|-----------------------------------------------------|
| POST   | `/sessions`                   | Upload image → create session → return `sessionId`  |
| GET    | `/sessions/{id}`              | Fetch full session state                            |
| POST   | `/sessions/{id}/detect`       | Run VLM→CV detect, set calibration + curves         |
| POST   | `/sessions/{id}/calibration`  | Set/replace calibration (AI confirm or manual)      |
| POST   | `/sessions/{id}/refine`       | Region bbox or text-hint re-detection (merge)       |
| POST   | `/sessions/{id}/resample`     | CV resample/densify a curve                         |
| PATCH  | `/sessions/{id}/curves`       | User edits (drag/add/remove/reassign/rename/recolor)|
| POST   | `/sessions/{id}/undo`         | Undo last history entry                             |
| POST   | `/sessions/{id}/redo`         | Redo                                                |
| GET    | `/sessions/{id}/export`       | `?format=csv|json` (blocked if calibration invalid) |
| GET    | `/settings`                   | Active provider + which providers have a saved key (masked) |
| PUT    | `/settings`                   | Set active provider / store-update key per provider |
| DELETE | `/settings/key/{provider}`    | Clear a provider's stored key                       |

All responses are typed Pydantic models. Errors return a structured
`{ "error": { "code", "message", "hint" } }`.

---

## 10. Settings & API Key Management

- The user enters an API key + selects a provider in `SettingsPanel`.
- Keys persist to **`backend/config/settings.json`** (plaintext, gitignored) so they survive
  program restarts — no re-entry after closing.
- **Multi-provider**: store one key per provider; switching the active provider does **not**
  require re-entering keys.
- The key is **never returned to the frontend** after being saved. `GET /settings` returns only
  `{ active_provider, providers: [{name, has_key: true|false}] }`. The UI shows `•••• set`.
- On startup, `main.py` loads `settings.json` and the VLM `factory` instantiates the active
  provider. If no key is set, detect/refine return a structured error: *"API key not set — open
  Settings."*

Example `config/settings.json`:

```json
{
  "active_provider": "openai",
  "keys": {
    "openai": "sk-...",
    "anthropic": "",
    "gemini": ""
  }
}
```

---

## 11. Frontend Workspace

Layout: **left = `EditorCanvas` (Konva)**, **right = `PreviewChart` (Plotly)**, with side panels.

- **EditorCanvas**: image as background layer; one draggable point node per `Point`; click empty
  space to add a point to the active curve; click a point to select/delete; reassign selected
  points to another curve; draw a bbox for region hints; zoom/pan. All edits update the session
  reducer; user-moved points get `origin: "user"`.
- **PreviewChart**: replots the extracted curves in **data-space** (via calibration), updating
  live so the user sees digitization quality immediately. Honors per-curve color/visibility.
- **CalibrationPanel**: shows AI-detected axes for confirmation; toggle to manual 2-point mode;
  pick linear/log per axis.
- **CurveList**: rename, recolor, toggle visibility, set the active curve.
- **AIAssistBar**: text-hint input, region-hint toggle, resample density control, re-detect.
- **SettingsPanel**: provider dropdown, masked key entry per provider, save/clear.
- **ExportPanel**: CSV / JSON download (disabled until calibration valid).

`lib/transform.ts` mirrors the backend calibration math so the preview and data-space readouts
are instant client-side.

---

## 12. Error Handling Summary

| Failure                              | Behavior                                                        |
|--------------------------------------|-----------------------------------------------------------------|
| Missing/invalid API key              | Structured error → toast "open Settings"                        |
| VLM malformed JSON                   | One auto JSON-repair retry, then structured error               |
| VLM rate limit / network             | Structured error with retry hint                                |
| Calibration invalid                  | Block at API; export disabled; clear message                    |
| Log axis with non-positive value     | Reject calibration with explanation                             |
| CV finds nothing in region           | Return empty + note; UI suggests text hint / manual points      |
| Oversized image                      | Downscale for VLM, keep original res for CV (track scale factor)|

---

## 13. Build Phases & Acceptance Criteria

Build in order. Bump `UPDATES.md` after each phase.

### Phase 1 — Backend skeleton & models (`0.1.0` → `0.2.0`)
- FastAPI app, CORS, Pydantic schemas, in-memory `SessionStore`, `POST /sessions`,
  `GET /sessions/{id}`.
- **Accept:** can upload an image and fetch the created session; tests for schema validation pass.

### Phase 2 — Calibration (`→ 0.3.0`)
- Calibration math (linear/log, both directions), `POST /sessions/{id}/calibration`, guards.
- **Accept:** `test_calibration.py` round-trips within tolerance; invalid calibrations rejected.

### Phase 3 — Settings & VLM abstraction (`→ 0.4.0`)
- `SettingsStore`, settings routes, `VLMProvider` interface + factory + provider stubs (one real
  default), `config/settings.json` load on startup.
- **Accept:** can set/clear keys per provider; key never leaks to client; missing key yields the
  structured error.

### Phase 4 — Pipeline, CV & merge (`→ 0.5.0`)
- `detect`/`refine`/`resample` endpoints, CV trace/refine/resample, pure `merge()` with protection
  of user points.
- **Accept:** `test_merge.py` proves user points are never overwritten; `test_cv.py` traces sample
  fixtures within tolerance; VLM mocked throughout.

### Phase 5 — Export (`→ 0.6.0`)
- CSV + JSON export, blocked when calibration invalid.
- **Accept:** `test_export.py` verifies formats and the calibration block.

### Phase 6 — Frontend scaffold (`→ 0.7.0`)
- React + Tailwind + Konva + Plotly app shell, typed API client, session reducer, transform lib.
- **Accept:** upload image → see it on canvas → run detect → points render → preview chart shows
  data-space curves.

### Phase 7 — Interactive editing (`→ 0.8.0`)
- Drag / add / remove / reassign; CurveList; CalibrationPanel (AI + manual); SettingsPanel.
- **Accept:** all six correction interactions work; user edits mark points `origin:"user"`;
  preview updates live.

### Phase 8 — AI iteration loop (`→ 0.9.0`)
- AIAssistBar: text hint, region hint, resample, re-detect; undo/redo wired to history.
- **Accept:** a full upload→detect→correct→region/text-hint→re-detect→export loop completes; user
  corrections survive AI iterations.

### Phase 9 — Polish & docs (`→ 1.0.0`)
- README finalized, UPDATES current, error toasts, empty/edge states, sample fixtures committed.
- **Accept:** clean run from `README.md` instructions on a fresh checkout.

---

## 14. Definition of Done (v1)

- Upload a multi-curve plot → AI detects axes + curves → user corrects interactively → iterates
  with AI on problem areas → exports accurate CSV/JSON.
- API keys persist across restarts; never committed; never sent to the client.
- Calibration supports linear & log and is the single source of pixel↔data mapping.
- User corrections are never destroyed by AI iterations.
- `UPDATES.md` reflects the full history and the version is `1.0.0`.
