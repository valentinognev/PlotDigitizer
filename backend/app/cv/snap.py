from __future__ import annotations

import math

import numpy as np


def snap_to_ink(
    mask: np.ndarray,
    pixel: tuple[float, float],
    window: int = 7,
    direction: tuple[float, float] | None = None,
) -> tuple[float, float]:
    h, w = mask.shape[:2]
    px, py = float(pixel[0]), float(pixel[1])
    half = max(1, int(window) // 2)
    x0 = max(0, int(math.floor(px)) - half)
    x1 = min(w, int(math.floor(px)) + half + 1)
    y0 = max(0, int(math.floor(py)) - half)
    y1 = min(h, int(math.floor(py)) + half + 1)
    patch = mask[y0:y1, x0:x1]
    ys, xs = np.nonzero(patch > 0)
    if xs.size == 0:
        return (px, py)
    weights = patch[ys, xs].astype(np.float64)
    xs_f = xs.astype(np.float64) + x0 + 0.5
    ys_f = ys.astype(np.float64) + y0 + 0.5
    wsum = float(weights.sum())
    cx = float((xs_f * weights).sum() / wsum)
    cy = float((ys_f * weights).sum() / wsum)
    if direction is None:
        return (cx, cy)
    dx, dy = float(direction[0]), float(direction[1])
    norm = math.hypot(dx, dy)
    if norm < 1e-9:
        return (cx, cy)
    tx, ty = dx / norm, dy / norm
    nx, ny = -ty, tx
    along = px * tx + py * ty
    across = cx * nx + cy * ny
    return (along * tx + across * nx, along * ty + across * ny)
