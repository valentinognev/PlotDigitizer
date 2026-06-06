from __future__ import annotations

import math

from app.cv.trace import trace_curve_path
from app.models.schemas import Point


def _arc_length(path: list[tuple[float, float]]) -> list[float]:
    if not path:
        return []
    lengths = [0.0]
    for i in range(1, len(path)):
        x0, y0 = path[i - 1]
        x1, y1 = path[i]
        lengths.append(lengths[-1] + math.hypot(x1 - x0, y1 - y0))
    return lengths


def resample_curve(
    image_bytes: bytes,
    color_hex: str,
    target_count: int,
    existing_points: list[tuple[float, float]] | None = None,
) -> list[Point]:
    path = trace_curve_path(image_bytes, color_hex)
    if not path and existing_points:
        path = list(existing_points)
    if len(path) < 2:
        return [Point(pixel=p, origin="ai") for p in path]

    lengths = _arc_length(path)
    total = lengths[-1]
    if total < 1e-6:
        return [Point(pixel=path[0], origin="ai")]

    target_count = max(2, target_count)
    samples: list[Point] = []
    for i in range(target_count):
        target_len = (total * i) / (target_count - 1)
        idx = 0
        while idx < len(lengths) - 1 and lengths[idx + 1] < target_len:
            idx += 1
        if idx >= len(path) - 1:
            samples.append(Point(pixel=path[-1], origin="ai"))
            continue
        seg_len = lengths[idx + 1] - lengths[idx]
        t = 0.0 if seg_len < 1e-9 else (target_len - lengths[idx]) / seg_len
        x0, y0 = path[idx]
        x1, y1 = path[idx + 1]
        px = x0 + t * (x1 - x0)
        py = y0 + t * (y1 - y0)
        samples.append(Point(pixel=(px, py), origin="ai"))
    return samples
