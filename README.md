# PlotDigitizer

**Manual, human-in-the-loop digitization of plots.** Upload or paste a figure image, calibrate the
axes, place and refine data points on each curve, and export CSV (with a sidecar PNG) or JSON.

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

PlotDigitizer uses a **manual-first pipeline** in three editor stages (tabs stay reachable):

1. **Image** — **Upload or paste** a plot (Ctrl+V / Cmd+V; including photos taken at an angle). Colour-filter and optional grid removal; toggle the binary mask overlay. Optional **Unskew** (perspective or mesh) once axis bounds exist — place them on **Axes** first, then return here to preview/apply.
2. **Axes** — **Calibrate** in Cartesian (four bounds or 3+ precise axis points, linear, log, or date), **Polar** (θ units, radius scale, origin radius), **Map** (two-point scale bar), or **Bar** (two-point value axis, optional rotated/horizontal). Affine/projective models map rotated or perspective photos without resampling ink. Add extra named axes; set figure title / xlabel / ylabel. Preview lives on Axes and Digitize.
3. **Digitize** — right-column **Auto** / **Curves** tabs (default Curves). **Curves:** **Place** points on each curve; bind each curve with the per-curve Axes select. **Auto:** draw a **region mask** (box / pen / erase), run **Averaging window** (ΔX/ΔY px), **Sample Δx** in data space, **Extract this colour** after a colour pick (or **Propose curves from colours**), segment-fill along ink, or **point-match** for scatter markers (sample one marker, accept/reject ranked candidates).
4. **Refine** line curves with **Improve** (mask corridor) and **Densify**. Scatter curves (`connect_as: scatter`) stay markers-only.
5. Watch the **preview chart** in data space (cartesian, polar θ/R, map units, or bar labels vs values). Two cartesian axes overlay a second Y (`yaxis2`).
6. **Export** from the header: CSV (numbers plus a sidecar PNG of the working plot, same stem) or **Save JSON** project (`.pdproj.json`, image embedded). CSV columns follow the coordinate system (`x,y` / `theta,R` / `x,y` plus units / `label,value` for bar).

**Pixel coordinates are the source of truth.** Data-space values are always derived through the
current calibration, so re-calibrating instantly remaps all points.

---

## Architecture

```
┌──────────────────────────── Frontend (React + Tailwind) ────────────────────────────┐
│  EditorCanvas (Konva)          PreviewChart (Plotly) + DataTablePanel (Axes / Digitize) │
│  image + draggable points  ──▶  live replot in data-space + numeric table                │
│  Image · Axes · Digitize  — Unskew/Filter · Calibration/FigureFields · AutoDigitize/Curves │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ typed REST (JSON)
┌────────────────────────────── Backend (Python + FastAPI) ──────────────────────────────┐
│  api/         sessions router (upload, curves, calibration, unskew, CV, export, …)   │
│  pipeline/    orchestrates CV improve, resample, remove-from-plot, unskew apply    │
│  cv/          trace · improve · resample · erase · unskew · color_filter · grid_removal · snap · segments · point_match │
│  calibration/ 2D transform + cartesian / polar / map / bar adapters (linear / log / date)                                              │
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
| Exports          | CSV (+ sidecar PNG), JSON project (`.pdproj.json`, image embedded) |

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

Open http://127.0.0.1:5173, upload or paste a plot image, and start digitizing.

### Tests

```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm test
```

---

## Typical Workflow

1. **Upload** a plot image, **paste** one (Ctrl+V / Cmd+V; ignored while typing in a text field), or **drop** an image file onto the window. After load, the **Image** tab is selected.
2. On **Image**, condition the curve with **Filter** (colour / grid) and optionally **Unskew**.
   Unskew still needs placed axis bounds — switch to **Axes** first, place the bounds, then return
   to Image to preview/apply. Choose **Perspective** or **Mesh**, adjust the mesh boundary if
   needed, click **Preview corrected**, then **Apply** (or **Cancel preview**). Axis bounds must
   cross; invalid geometry shows a toast.
3. On **Axes**, click **Place bounds**, then click the plot four times: X min, X max, Y min,
   Y max. Optional: **Precise (3+ points)** for affine/projective, **Polar**, **Map** (scale bar),
   or **Bar** (P1/P2 on the value axis, v1/v2, Rotated/horizontal). **Add** extra named axes when a
   figure needs a second Y. Enter the **axis values** (linear, log, or date per axis) and the
   figure **title / labels**. Date axes store Unix days from 1970-01-01 UTC; type tokens like `YYYY/MM/DD`.
4. On **Digitize**, the **Curves** tab is selected. **Add curves** and turn on **Place points** to click seed points on each curve. Bind each curve with the per-curve Axes select in the Curves list.
5. Switch to **Auto** for **Averaging window**, **Sample Δx**, **Segment fill**, colour extract, or point-match. Optional region mask (Box / Pen / Erase) ANDs with the colour filter; **Clear region** restores the full image. Use **Improve** / **Densify** on the Curves tab.
6. *(Optional)* **Remove from plot** erases the active curve from the working image (Undo restores
   it) so overlapping strokes can be traced next.
7. **Drag** points to correct positions; **arrow keys** nudge a selection 1 px (Shift: 10). The
   **magnifier** (right column) zooms 5× around the cursor; the readout under the
   canvas shows pixel (and data when calibrated). Box-select, Delete, and curve reassignment as needed.
8. Watch the **preview chart** update in data-space (cartesian, polar, map, or bar). **View data** (under the chart) lists the same points; **Copy** puts TSV on the clipboard.
9. **CSV** writes `*.csv` plus a sidecar `*.png` of the working plot (`label,value` for bar). **Save JSON** embeds the image with calibration, curves, and workspace.

---

## Project Documents

- [`refs/WORKFLOW.md`](refs/WORKFLOW.md) — implementation spec and build phases.
- [`UPDATES.md`](UPDATES.md) — version history and bug log (**mandatory** to read and maintain).
- [`frontend/README.md`](frontend/README.md) — frontend layout and dev notes.

---

## Status

**v2.19** — Digitize Auto / Curves tabs share the right column; editor stages as tabs (Image / Axes / Digitize); Open / Save JSON / CSV / Import in
the header. Clipboard paste to start a session; CSV export writes a sidecar PNG; JSON still embeds
the image. Precision toolkit (v2.6+): affine/projective/polar/map calibration, colour-filter + grid
conditioning, segment-fill and point-match, scatter curves. Current version: see [`UPDATES.md`](UPDATES.md).
