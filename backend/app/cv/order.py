from __future__ import annotations

import math


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _path_length(path: list[tuple[float, float]]) -> float:
    return sum(_dist(path[i], path[i + 1]) for i in range(len(path) - 1))


def _ordering_score(path: list[tuple[float, float]]) -> tuple[float, int]:
    length = _path_length(path)
    rightward = sum(1 for i in range(len(path) - 1) if path[i + 1][0] > path[i][0])
    return (length, -rightward)


def _two_opt(path: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(path) < 4:
        return list(path)

    ordered = list(path)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(ordered) - 2):
            for j in range(i + 1, len(ordered)):
                if j - i == 1:
                    continue
                before = _dist(ordered[i - 1], ordered[i]) + _dist(ordered[j - 1], ordered[j])
                after = _dist(ordered[i - 1], ordered[j - 1]) + _dist(ordered[i], ordered[j])
                if after + 1e-9 < before:
                    ordered[i:j] = reversed(ordered[i:j])
                    improved = True
    return ordered


def _order_by_projection(
    points: list[tuple[float, float]],
    start_idx: int,
    end_idx: int,
) -> list[tuple[float, float]]:
    ax, ay = points[start_idx]
    bx, by = points[end_idx]
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy

    def param(idx: int) -> float:
        px, py = points[idx]
        if len2 < 1e-9:
            return 0.0
        return ((px - ax) * dx + (py - ay) * dy) / len2

    return [points[i] for i in sorted(range(len(points)), key=param)]


def _projection_seed(points: list[tuple[float, float]]) -> list[tuple[float, float]] | None:
    if len(points) < 3:
        return None

    spread = max(_dist(points[i], points[j]) for i in range(len(points)) for j in range(i + 1, len(points)))
    perp_limit = max(12.0, spread * 0.35)
    best: list[tuple[float, float]] | None = None
    best_span = -1.0

    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            ax, ay = points[i]
            bx, by = points[j]
            dx, dy = bx - ax, by - ay
            chord = math.hypot(dx, dy)
            if chord < 1e-6:
                continue

            ok = True
            for k, (px, py) in enumerate(points):
                if k in (i, j):
                    continue
                t = ((px - ax) * dx + (py - ay) * dy) / (chord * chord)
                if t < -0.08 or t > 1.08:
                    ok = False
                    break
                perp = abs((px - ax) * dy - (py - ay) * dx) / chord
                if perp > perp_limit:
                    ok = False
                    break

            if ok and chord > best_span:
                best_span = chord
                best = _order_by_projection(points, i, j)

    return best


def _greedy_nearest_neighbor(
    points: list[tuple[float, float]],
    start_idx: int,
) -> list[tuple[float, float]]:
    ordered = [points[start_idx]]
    remaining = [i for i in range(len(points)) if i != start_idx]
    while remaining:
        lx, ly = ordered[-1]
        best_idx = min(
            remaining,
            key=lambda i: _dist(points[i], (lx, ly)),
        )
        ordered.append(points[best_idx])
        remaining.remove(best_idx)
    return ordered


def _seed_orderings(points: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    seeds: list[list[tuple[float, float]]] = [sorted(points, key=lambda p: (p[0], p[1]))]

    projection = _projection_seed(points)
    if projection:
        seeds.append(projection)
        seeds.append(list(reversed(projection)))

    for start_idx in range(len(points)):
        nn = _greedy_nearest_neighbor(points, start_idx)
        seeds.append(nn)
        seeds.append(list(reversed(nn)))

    return seeds


def order_points_along_curve(
    points: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Reorder scattered points into a single polyline along the curve."""
    if len(points) <= 2:
        return list(points)

    candidates: list[list[tuple[float, float]]] = []
    for seed in _seed_orderings(points):
        optimized = _two_opt(seed)
        candidates.append(optimized)
        candidates.append(list(reversed(optimized)))

    return min(candidates, key=_ordering_score)
