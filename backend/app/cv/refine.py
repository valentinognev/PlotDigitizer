from __future__ import annotations

import math

from app.cv.trace import trace_curve_path
from app.models.schemas import BBox, Point


def _nearest_on_path(
    px: float, py: float, path: list[tuple[float, float]]
) -> tuple[float, float]:
    if not path:
        return px, py
    best = path[0]
    best_d = math.inf
    for x, y in path:
        d = (x - px) ** 2 + (y - py) ** 2
        if d < best_d:
            best_d = d
            best = (x, y)
    return best


def refine_seed_points(
    image_bytes: bytes,
    color_hex: str,
    seed_points: list[tuple[float, float]],
    region: BBox | None = None,
) -> list[Point]:
    region_tuple = None
    if region:
        region_tuple = (
            int(region.x),
            int(region.y),
            int(region.width),
            int(region.height),
        )
    path = trace_curve_path(image_bytes, color_hex, region_tuple)
    refined: list[Point] = []
    for sx, sy in seed_points:
        if region and not (
            region.x <= sx <= region.x + region.width
            and region.y <= sy <= region.y + region.height
        ):
            continue
        rx, ry = _nearest_on_path(sx, sy, path)
        refined.append(Point(pixel=(rx, ry), origin="ai"))
    if not refined and path:
        step = max(1, len(path) // max(len(seed_points), 1))
        for i in range(0, len(path), step):
            x, y = path[i]
            refined.append(Point(pixel=(x, y), origin="ai"))
    return refined
