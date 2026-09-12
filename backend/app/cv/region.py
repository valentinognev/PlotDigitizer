from __future__ import annotations

import cv2
import numpy as np

from app.models.schemas import RegionBox, RegionMask


def rasterize_region(width: int, height: int, region: RegionMask | None) -> np.ndarray:
    """Rasterize a curve region to a uint8 mask {0, 255}.

    None or empty (no boxes, no strokes) is unrestricted: all 255.
    Otherwise start from zeros, fill boxes and strokes, then erase.
    """
    if region is None or (not region.boxes and not region.strokes):
        return np.full((height, width), 255, dtype=np.uint8)

    mask = np.zeros((height, width), dtype=np.uint8)
    for box in region.boxes:
        _fill_box(mask, box)
    _paint_strokes(mask, region.strokes, 255, region.stroke_width)
    _paint_strokes(mask, region.erase_strokes, 0, region.stroke_width)
    return mask


def _fill_box(mask: np.ndarray, box: RegionBox) -> None:
    height, width = mask.shape[:2]
    x0 = int(round(box.x))
    y0 = int(round(box.y))
    x1 = int(round(box.x + box.w)) - 1
    y1 = int(round(box.y + box.h)) - 1
    if x1 < 0 or y1 < 0 or x0 >= width or y0 >= height:
        return
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(width - 1, x1)
    y1 = min(height - 1, y1)
    if x1 < x0 or y1 < y0:
        return
    cv2.rectangle(mask, (x0, y0), (x1, y1), 255, thickness=-1)


def _paint_strokes(
    mask: np.ndarray,
    strokes: list[list[tuple[float, float]]],
    color: int,
    stroke_width: float,
) -> None:
    thickness = max(1, int(round(stroke_width)))
    radius = max(1, (thickness - 1) // 2)
    for stroke in strokes:
        pts = np.array(
            [[int(round(x)), int(round(y))] for x, y in stroke],
            dtype=np.int32,
        )
        if len(pts) >= 2:
            cv2.polylines(mask, [pts], False, color, thickness=thickness)
        for pt in pts:
            cv2.circle(mask, (int(pt[0]), int(pt[1])), radius, color, thickness=-1)
