# PlotDigitizer

**Manual, human-in-the-loop digitization of plots.** Upload a figure image, calibrate the axes,
place and refine data points on each curve, and export the result as CSV or JSON.

> **For contributors / agents:** [`refs/WORKFLOW.md`](refs/WORKFLOW.md) is the authoritative build
> spec, and **[`UPDATES.md`](UPDATES.md) is mandatory reading and maintaining** — read it before
> any work and update it (with a version bump) after every change.

---

## Background & Motivation

Scientific and engineering data is often locked inside published figures with no accompanying raw
data. Recovering those numbers by hand is tedious and error-prone. PlotDigitizer gives you a
focused canvas for placing points on curves, with OpenCV-assisted tracing and resampling, live
data-space preview, and project save/load — without relying on external AI services.

---

## How It Works

PlotDigitizer uses a **manual-first pipeline**:

1. **Upload** a plot image (including photos taken at an angle).
2. **Calibrate** axes manually: click four bounds on the plot (X min, X max, Y min, Y max) and
   enter the corresponding numeric values (linear or log per axis).
3. **Unskew** *(optional)*: preview and apply correction from those same axis bounds
   to straighten rotated or skewed photos. Choose **Perspective** (homography) for mild
   skew, or **Mesh** (adjustable boundary grid, default 3×3 cells) for curved or wavy paper edges; the full image
   is kept (content outside axis limits remains visible).
4. **Place points** on each curve on the canvas; drag, select, delete, and reassign as needed.
5. **Refine** with OpenCV: **Improve** traces the line between your seed points; **Densify**
   interpolates evenly spaced points along the curve.
6. Watch the **preview chart** update live in data-space.
7. **Export** CSV / JSON, or save a full **project** (`.pdproj.json`) for later restore.

**Pixel coordinates are the source of truth.** Data-space values are always derived through the
current calibration, so re-calibrating instantly remaps all points.

---

## Architecture

```
┌──────────────────────────── Frontend (React + Tailwind) ────────────────────────────┐
│  EditorCanvas (Konva)          PreviewChart (Plotly)                                   │
│  image + draggable points  ──▶  live replot in data-space                              │
│  UnskewPanel · CalibrationPanel · CurveList · ExportPanel                              │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ typed REST (JSON)
┌────────────────────────────── Backend (Python + FastAPI) ──────────────────────────────┐
│  api/         sessions router (upload, curves, calibration, unskew, CV, export, …)   │
│  pipeline/    orchestrates CV improve, resample, remove-from-plot, unskew apply    │
│  cv/          trace · improve · resample · erase · unskew (OpenCV + NumPy)           │
│  calibration/ pixel ↔ data 2D transform (orthogonal / affine / projective; cartesian, polar, map)                                   │
│  export/      CSV, JSON, project save/load, curve import                             │
│  store/       in-memory SessionStore + last-session persistence                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer            | Choice                                                            |
|------------------|-------------------------------------------------------------------|
| Backend          | Python + FastAPI (Pydantic, async, OpenAPI)                       |
| Computer vision  | OpenCV + NumPy                                                    |
| Persistence      | In-memory sessions; last session + project files on disk          |
| Frontend         | React + Tailwind CSS                                              |
| Image editing UI | Konva.js / react-konva                                           |
| Preview chart    | Plotly                                                            |
| Exports          | CSV, JSON, project (`.pdproj.json`)                              |

---

## Getting Started

### Quick start (recommended)

```bash
./install.sh   # once
./start.sh     # starts in background, returns to shell
./kill.sh      # stop servers
```

Open http://127.0.0.1:5173

### Manual dev mode

Run the backend and frontend in two terminals.

#### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173, upload a plot image, and start digitizing.

### Tests

```bash
cd backend && .venv/bin/pytest -q
```

---

## Typical Workflow

1. **Upload** a plot image.
2. Click **Place bounds** in the Calibration panel, then click the plot four times: X min, X max,
   Y min, Y max. Optional: **Precise (3+ points)** for affine/projective, **Polar**, or **Map**
   (scale bar) calibration.
3. Enter the **numeric axis values** (and choose linear/log per axis).
4. *(Optional, skewed/rotated photos)* In the **Unskew** panel, choose **Perspective** or
   **Mesh**, adjust the mesh boundary if needed, click **Preview corrected** to review the
   straightened image, then **Apply** to commit (or **Cancel preview** to revert the view).
   Axis bounds must cross; invalid geometry shows a toast.
5. **Add curves** and turn on **Place points** to click seed points on each curve.
6. Use **Improve** (OpenCV trace) or **Densify** to refine a curve.
7. **Drag** points to correct positions; use box-select, Delete, and curve reassignment as needed.
8. Watch the **preview chart** update in data-space.
9. **Export** CSV/JSON or **Save JSON** project when satisfied.

---

## Project Documents

- [`refs/WORKFLOW.md`](refs/WORKFLOW.md) — implementation spec and build phases.
- [`UPDATES.md`](UPDATES.md) — version history and bug log (**mandatory** to read and maintain).
- [`frontend/README.md`](frontend/README.md) — frontend layout and dev notes.

---

## Status

**v2.2** — manual digitization with optional image unskew (perspective or mesh) for camera
photos; mesh subdivisions are adjustable (default 3 per edge). Current version: see [`UPDATES.md`](UPDATES.md).
