from __future__ import annotations

import numpy as np


def averaging_window(
    mask: np.ndarray,
    dx: float = 10.0,
    dy: float = 10.0,
) -> list[tuple[float, float]]:
    """Thin a binary mask to blob centres spaced by an axis-aligned window.

    Each column is split into contiguous ink runs. A run from y0 (inclusive)
    to y1 (exclusive) becomes the centre ``(x + 0.5, 0.5 * (y0 + y1))``.
    Centres are walked left-to-right; a point is kept if no already-kept
    point lies inside the open window ``abs(x - xk) < dx and abs(y - yk) < dy``.
    """
    if mask.size == 0:
        return []

    blobs = _blob_centres(mask)
    blobs.sort(key=lambda p: (p[0], p[1]))

    kept: list[tuple[float, float]] = []
    for x, y in blobs:
        if _inside_any_window(x, y, kept, dx, dy):
            continue
        kept.append((x, y))
    return kept


def _blob_centres(mask: np.ndarray) -> list[tuple[float, float]]:
    height, width = mask.shape[:2]
    ink = mask > 0
    blobs: list[tuple[float, float]] = []
    for x in range(width):
        col = ink[:, x]
        y = 0
        while y < height:
            if not col[y]:
                y += 1
                continue
            y0 = y
            while y < height and col[y]:
                y += 1
            blobs.append((x + 0.5, 0.5 * (y0 + y)))
    return blobs


def _inside_any_window(
    x: float,
    y: float,
    kept: list[tuple[float, float]],
    dx: float,
    dy: float,
) -> bool:
    for xk, yk in kept:
        if abs(x - xk) < dx and abs(y - yk) < dy:
            return True
    return False
