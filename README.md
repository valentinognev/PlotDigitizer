# PlotDigitizer

**AI-assisted, human-in-the-loop digitization of plots.** Upload a picture of a figure that
contains one or more curves, let an AI propose the data points, correct them interactively, and
iterate with the AI until every curve is digitized. Export the result as CSV or JSON.

> **For contributors / agents:** [`refs/WORKFLOW.md`](refs/WORKFLOW.md) is the authoritative build
> spec, and **[`UPDATES.md`](UPDATES.md) is mandatory reading and maintaining** — read it before
> any work and update it (with a version bump) after every change.

---

## Background & Motivation

Scientific and engineering data is often locked inside published figures with no accompanying raw
data. Recovering those numbers by hand is tedious and error-prone. Fully automatic digitizers
struggle with overlapping curves, dashed lines, log axes, and busy legends; fully manual tools are
slow. PlotDigitizer combines both: an AI does the heavy lifting and understands the figure
semantically, while the user stays in control and corrects the AI, iterating until the result is
correct.

---

## How It Works

PlotDigitizer uses a **hybrid pipeline**:

1. **Vision LLM (VLM)** reads the image semantically — locates axes and tick labels, reads the
   legend, identifies which curves exist (color/style), and proposes rough seed points.
2. **Computer vision (OpenCV)** refines those seed points by snapping them to the actual curve
   pixels, and traces/resamples curves on demand.
3. **Calibration** maps pixel coordinates to real data values (linear or log), either AI-detected
   (and user-confirmed) or set manually.
4. **The user** corrects everything interactively — dragging, adding, removing, and reassigning
   points — and asks the AI to re-detect problem regions, add missed curves, or densify points.
5. The loop repeats until the user is satisfied, then exports **CSV / JSON**.

A key design rule: **pixel coordinates are the source of truth** and data values are always
*derived* through the current calibration, so re-calibrating instantly remaps all points without
re-running the AI. Another: **AI is additive and never destroys the user's manual corrections.**

---

## Architecture

```
┌──────────────────────────── Frontend (React + Tailwind) ────────────────────────────┐
│  EditorCanvas (Konva)          PreviewChart (Plotly)                                   │
│  image + draggable points  ──▶  live replot in data-space                              │
│  CalibrationPanel · CurveList · AIAssistBar · SettingsPanel · ExportPanel              │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ typed REST (JSON)
┌────────────────────────────── Backend (Python + FastAPI) ──────────────────────────────┐
│  api/         routers: sessions, settings                                                │
│  pipeline/    orchestrates detect / refine / resample + merge rules                      │
│  vlm/         provider-agnostic VLM abstraction (swappable) + factory                    │
│  cv/          trace · refine · resample (OpenCV + NumPy)                                  │
│  calibration/ pixel <-> data transforms (linear / log)                                   │
│  store/       in-memory SessionStore (swappable interface)                               │
│  settings/    SettingsStore  →  config/settings.json (gitignored)                        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer            | Choice                                                            |
|------------------|-------------------------------------------------------------------|
| Backend          | Python + FastAPI (Pydantic, async, OpenAPI)                       |
| AI brain         | Provider-agnostic VLM abstraction (swappable; one default impl)  |
| Computer vision  | OpenCV + NumPy                                                    |
| Persistence      | In-memory (designed swappable; no database in v1)                |
| Frontend         | React + Tailwind CSS                                              |
| Image editing UI | Konva.js / react-konva                                           |
| Preview chart    | Plotly                                                            |
| Config / secrets | Plaintext `config/settings.json` (gitignored)                    |
| Exports          | CSV, JSON                                                        |

---

## API Keys

PlotDigitizer calls a Vision LLM, so you provide your own API key:

1. Open the **Settings** panel in the UI.
2. Choose a provider and paste your API key.
3. The key is saved to `backend/config/settings.json` (plaintext, gitignored) and **persists across
   restarts** — no need to re-enter it after closing the program.

Keys are stored **per provider**, so you can switch the active provider without re-entering them.
The key is never sent back to the browser after being saved — the UI only shows a masked `•••• set`
status. **Never commit `config/settings.json`.**

---

## Getting Started

> The repository is currently a specification. The sections below describe the intended setup once
> the implementation (per `refs/WORKFLOW.md`) lands.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # or: pip install -e .
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the dev server URL, set your API key in **Settings**, upload a plot image, and start
digitizing.

---

## Typical Workflow

1. Upload a plot image.
2. Run **Detect** — the AI proposes axes, curves, and points.
3. Confirm or adjust **calibration** (AI-detected, or manual 2-points-per-axis; linear or log).
4. **Correct** points on the canvas: drag, add, remove, reassign to a different curve.
5. **Ask the AI to iterate** on problem areas: draw a box over a missed curve, give a text hint
   (e.g. "the red dashed curve is missing"), or resample a correct curve for more density.
6. Watch the **preview chart** update live in data-space.
7. **Export** to CSV or JSON when satisfied.

---

## Project Documents

- [`refs/WORKFLOW.md`](refs/WORKFLOW.md) — authoritative implementation spec and build phases.
- [`UPDATES.md`](UPDATES.md) — version history and bug log (**mandatory** to read and maintain).

---

## Status

Pre-implementation. Current version: see [`UPDATES.md`](UPDATES.md). Target for v1 (`1.0.0`):
upload a multi-curve plot, AI-detect, interactively correct, iterate with AI, and export accurate
CSV/JSON.
