# PlotDigitizer — Frontend

React + TypeScript + Vite UI for manual plot digitization. See the root [`README.md`](../README.md)
for setup and workflow.

## Layout

| Component            | Role                                                                 |
|----------------------|----------------------------------------------------------------------|
| `App.tsx`            | Session state, calibration placement, unskew preview, curve edits    |
| `EditorCanvas.tsx`   | Konva image canvas — points, calibration marks, unskew preview warp |
| `UnskewPanel.tsx`    | Preview corrected / Apply / Cancel — perspective fix from axis bounds |
| `CalibrationPanel.tsx` | Manual axis bounds: place on plot, enter min/max values            |
| `CurveList.tsx`      | Curves, place-points mode, Improve / Densify per curve               |
| `PreviewChart.tsx`   | Plotly live preview in data-space                                    |
| `ExportPanel.tsx`    | Open/save project, CSV/JSON export, curve import                     |

Top toolbar order: **Unskew** → **Calibration** → **Export**.

## Key libraries

- `src/lib/transform.ts` — pixel ↔ data calibration (mirrors backend)
- `src/lib/calibration.ts` — axis bound placement helpers
- `src/lib/unskew.ts` — homography from axis bounds; preview warp; mirrors `backend/app/cv/unskew.py`
- `src/lib/sessionPatch.ts` — optimistic local curve/point updates
- `src/api/client.ts` — typed REST client (includes `applyUnskew`)

## Unskew preview

Preview runs entirely in the browser (`warpImageToCanvas`). **Apply** calls
`POST /sessions/{id}/unskew/apply` so the backend OpenCV warp becomes the working image and all
calibration marks / curve pixels are remapped. During preview, stored coordinates stay in original
image space; the canvas maps clicks and drags through the inverse homography.

## Development

```bash
npm install
npm run dev      # http://127.0.0.1:5173 — proxies /sessions and /health to :8000
npm run build    # output in dist/ (used by ./start.sh)
```

Backend must be running on port 8000 (`uvicorn` from `backend/`).
