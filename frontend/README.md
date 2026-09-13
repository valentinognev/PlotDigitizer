# PlotDigitizer — Frontend

React + TypeScript + Vite UI for manual plot digitization. See the root [`README.md`](../README.md)
for setup and workflow.

## Layout

| Component            | Role                                                                 |
|----------------------|----------------------------------------------------------------------|
| `App.tsx`            | Session state, stage chrome, calibration placement, unskew preview, mesh grid, curve edits |
| `StageTabs.tsx`      | Image / Axes / Digitize tablist (always reachable when a session exists) |
| `EditorCanvas.tsx`   | Konva image canvas — points, calibration marks, unskew/mesh preview warp |
| `UnskewPanel.tsx`    | Image stage: Perspective / Mesh; preview corrected / Apply / Cancel / Reset mesh |
| `MeshGridOverlay.tsx`| 4×4 boundary grid editor (mesh mode, hidden during preview)          |
| `CalibrationPanel.tsx` | Axes stage: named axes list (Add / Rename / Delete); place bounds; the selected set is `session.calibration` |
| `FigureFields.tsx`   | Axes stage: figure title / xlabel / ylabel |
| `CurvePicker.tsx`    | Image stage: compact active-curve switcher |
| `CurveList.tsx`      | Digitize stage: curves, place-points mode, Improve / Densify, per-curve Axes select |
| `PreviewChart.tsx`   | Axes / Digitize: Plotly live preview in data-space (dual-Y overlay when two cartesian cals) |
| `ExportPanel.tsx`    | Header: Open / Save JSON / CSV / Import (`variant="header"`) |

Toolbar: header export (Open / Save JSON / CSV / Import) + stage tabs, not Unskew → Calibration → Export.

## Key libraries

- `src/lib/workflowStage.ts` — stage ids, chrome flags, landing tab, exclusive canvas-mode clamp
- `src/lib/transform.ts` — pixel ↔ data calibration (mirrors backend)
- `src/lib/calibration.ts` — axis bound placement helpers
- `src/lib/unskew.ts` — homography from axis bounds; preview warp; mirrors `backend/app/cv/unskew.py`
- `src/lib/meshWarp.ts` — mesh grid, hybrid warp, point mapping; mirrors `backend/app/cv/mesh_warp.py`
- `src/lib/sessionPatch.ts` — optimistic local curve/point updates
- `src/api/client.ts` — typed REST client (includes `applyUnskew` with perspective or mesh mode); CSV export also saves a sidecar PNG
- `src/lib/clipboardPaste.ts` — clipboard image → `File` for Ctrl+V / Cmd+V upload
- `src/lib/exportFlow.ts` — pre-export preference flush; CSV sidecar PNG filename

## Unskew preview

Preview runs entirely in the browser.

| Mode          | Preview function        | Apply (backend)                    |
|---------------|-------------------------|------------------------------------|
| Perspective   | `warpImageToCanvas`     | OpenCV homography warp             |
| Mesh          | `warpImageMeshToCanvas` | Hybrid homography + mesh patch     |

**Apply** calls `POST /sessions/{id}/unskew/apply` so the backend warp becomes the working image
and all calibration marks / curve pixels are remapped. During preview, stored coordinates stay in
original image space; the canvas maps clicks and drags through the inverse transform.

### Coordinate systems

- **Logical source space** — `session.image_meta.width` × `session.image_meta.height`. Calibration
  marks and mesh vertices live here; Konva stretches the loaded image to these dimensions.
- **Corrected (display) space** — warped output during preview only. Overlays use forward/inverse
  mapping from `lib/unskew.ts` or `lib/meshWarp.ts`, scaled down if the warped canvas exceeds
  Konva’s max texture size (4096 px).

Preview warp functions accept an optional source size and rasterize the image into logical space
via `buildSourceImageData` before sampling, so marks stay aligned even when the PNG’s natural
pixel dimensions differ from `image_meta`.

## Development

```bash
npm install
npm run dev      # http://127.0.0.1:5173 — proxies /sessions and /health to :8000
npm run build    # output in dist/ (used by ./start.sh)
```

Backend must be running on port 8000 (`uvicorn` from `backend/`).
