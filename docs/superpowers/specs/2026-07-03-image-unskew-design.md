# Image Unskew Design

**Date:** 2026-07-03  
**Status:** Approved  
**Version target:** 2.1.3 (implemented)

---

## Problem

Users may upload plot photos taken at an angle (rotation + linear skew / mild perspective). The current workflow assumes an axis-aligned image: calibration bounds are placed on skewed axis lines, but the image itself is not corrected, making point placement and OpenCV tracing harder.

## Goal

Add an **Unskew** panel at the top of the workspace that rectifies the plot image using the four existing calibration bound points (Xmin, Xmax, Ymin, Ymax), with a **preview-first** workflow and an explicit **Apply** step.

## Decisions (user-confirmed)

| Topic | Decision |
|-------|----------|
| Point source | Reuse calibration axis-bound pixels (no separate picker) |
| Preview mode | Preview corrected view on canvas; original image remains source of truth until Apply |
| Toggle UI | Button (not checkbox); enabled when axis bounds placed; toast on invalid geometry |
| Full image | Warp canvas includes entire source image — no crop to plot quad |
| Y orientation | Ymax at top, Ymin at bottom (image coordinates, y-down) |
| On Apply | Warp working image **and** remap calibration marks + curve points into new coordinates |
| Architecture | Frontend preview (instant) + backend apply (OpenCV, undo support) |

## Geometry

### Inputs

Four pixel points from calibration bounds:

- **Xmin, Xmax** — define the X-axis line  
- **Ymin, Ymax** — define the Y-axis line  

### Algorithm

1. Fit line **Lx** through Xmin and Xmax.  
2. Fit line **Ly** through Ymin and Ymax.  
3. Compute **origin** `O` = intersection of Lx and Ly. Fail if lines are parallel.  
4. **X direction:** unit vector from O toward Xmax along Lx.  
5. **Y direction:** Gram–Schmidt — take direction from O toward Ymax along Ly, remove component parallel to X, normalize. This enforces orthogonal axes in the output while keeping the X-axis line exact.  
6. **Source quadrilateral** (plot area in skewed image):  
   - `BL = O`  
   - `BR` = projection of Xmax onto Lx (typically Xmax itself)  
   - `TL` = projection of Ymax onto Ly (typically Ymax itself)  
   - `TR = BL + (BR - BL) + (TL - BL)`  
7. **Destination rectangle:** axis-aligned plot area with **Ymax at top** (image y-down): origin
   → bottom-left, Xmax corner → bottom-right, Ymax → top-left.
8. **Homography** `H` maps source quad → destination plot rect.
9. **Full canvas:** warp all four image corners with `H`, compute bounding box, prepend translation
   so the entire source image is visible (no crop to plot quad).

### Validation

Preview toggle enabled when axis bounds are placed. Geometry must validate before preview renders
or apply succeeds:

- Fewer than four bounds or degenerate axis refs  
- Lx and Ly are parallel (no intersection)  
- Source quad area ≤ epsilon  

Optional warning (non-blocking): pre-correction angle between Lx and Ly exceeds ~15°.

## UI

### Unskew panel (top bar, left of Calibration)

```
┌─ Unskew ──────────────────────────────────────────────┐
│ [Preview corrected]  [Apply]  [Cancel preview]        │
│ Status line                                           │
└───────────────────────────────────────────────────────┘
```

| Control | Behavior |
|---------|----------|
| Preview corrected | Button toggle (`Preview on` when active); enabled when bounds placed |
| Apply | Commits warp + coordinate remap; requires preview on + valid geometry |
| Cancel preview | Turns off preview; no mutation |
| Status | Contextual guidance (incl. toast when geometry invalid) |

### Workflow

1. Upload skewed image  
2. Calibration → Place bounds (Xmin, Xmax, Ymin, Ymax)  
3. Unskew → Preview corrected  
4. Optionally adjust bounds while previewing (live update)  
5. Apply → straightened image becomes working image  
6. Continue digitizing  

## Coordinate systems (preview)

| Space | Role |
|-------|------|
| **Original** | Stored in session — image bytes, calibration pixels, curve pixels |
| **Corrected (display)** | Warped image + forward-transformed overlays during preview only |

During preview:

- Canvas shows corrected image and forward-transformed marks/points  
- User interactions inverse-map through `H⁻¹` before persisting to session  
- On Apply, forward-transform all coordinates once; dual-coordinate mode ends  

## Backend

### Endpoint

```
POST /sessions/{session_id}/unskew/apply
```

- Recomputes homography server-side from session calibration (client does not send matrix).  
- `cv2.warpPerspective` on working image.  
- Forward-transform calibration `ref_points` and all curve `pixel` coords.  
- Update `image_meta.width`, `image_meta.height`, bump `revision`.  
- Push undo history (same pattern as remove-from-plot).

### Module

`backend/app/cv/unskew.py` — shared logic with frontend via identical test vectors.

## Frontend

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/unskew.ts` | Homography math, quad construction, warp/inverse point helpers |
| `frontend/src/components/UnskewPanel.tsx` | Top-bar controls + status |
| `frontend/src/components/EditorCanvas.tsx` | Preview rendering, transformed overlays, inverse click mapping |
| `frontend/src/App.tsx` | Preview state, apply handler |
| `frontend/src/api/client.ts` | `applyUnskew(sessionId)` |

## Error handling

- Degenerate geometry → toast on preview attempt; apply returns HTTP 400  
- Undo/redo restores pre-apply image and coordinates  

## Testing

- Backend unit tests: Y orientation, full-image bounding box, API apply  
- Frontend: `lib/unskew.ts` parity with backend fixture; preview warp in `EditorCanvas`  

## Out of scope (v1)

- Barrel / nonlinear lens distortion  
- Separate 4-point picker  
- Auto-preview without toggle  
- Side-by-side original vs corrected split view  

## Documentation

- Current version: **2.1.3** — see `UPDATES.md`  
- `README.md`, `refs/WORKFLOW.md`, `frontend/README.md` document unskew workflow
