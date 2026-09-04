from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

CORNER_TURN_DEG = 30.0
COLLINEAR_FOLD_DEG = 8.0
COLLINEAR_FOLD_DIST_PX = 0.75
VERTICAL_RUN_MIN_PX = 12
SIMPLIFY_EPSILON_PX = 1.25
THIN_RUN_MAX_PX = 5


@dataclass
class Segment:
    points: list[tuple[float, float]]
    length: float


class _Run:
    __slots__ = ("x", "y0", "y1", "left", "right", "sole", "corridor")

    def __init__(self, x: int, y0: int, y1: int, sole: bool = False) -> None:
        self.x = x
        self.y0 = y0
        self.y1 = y1
        self.left: list[_Run] = []
        self.right: list[_Run] = []
        self.sole = sole
        self.corridor = False

    @property
    def pt(self) -> tuple[float, float]:
        return (float(self.x), 0.5 * (self.y0 + self.y1))


def _runs_in_column(col: np.ndarray) -> list[tuple[int, int]]:
    ys = np.flatnonzero(col)
    if ys.size == 0:
        return []
    runs: list[tuple[int, int]] = []
    start = prev = int(ys[0])
    for raw in ys[1:]:
        y = int(raw)
        if y == prev + 1:
            prev = y
            continue
        runs.append((start, prev))
        start = prev = y
    runs.append((start, prev))
    return runs


def _overlaps(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return not (a[1] < b[0] or b[1] < a[0])


def _turn_deg(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
) -> float:
    v1 = (p1[0] - p0[0], p1[1] - p0[1])
    v2 = (p2[0] - p1[0], p2[1] - p1[1])
    n1 = math.hypot(v1[0], v1[1])
    n2 = math.hypot(v2[0], v2[1])
    if n1 < 1e-9 or n2 < 1e-9:
        return 0.0
    cross = v1[0] * v2[1] - v1[1] * v2[0]
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    return abs(math.degrees(math.atan2(cross, dot)))


def _rdp(
    points: list[tuple[float, float]], epsilon: float
) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return list(points)
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    denom = math.hypot(dx, dy)
    max_d = -1.0
    max_i = 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        dist = (
            math.hypot(x - ax, y - ay)
            if denom < 1e-9
            else abs((x - ax) * dy - (y - ay) * dx) / denom
        )
        if dist > max_d:
            max_d = dist
            max_i = i
    if max_d <= epsilon:
        return [points[0], points[-1]]
    left = _rdp(points[: max_i + 1], epsilon)
    right = _rdp(points[max_i:], epsilon)
    return left[:-1] + right


def _fold_collinear(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return list(points)
    pts = list(points)
    changed = True
    while changed and len(pts) > 2:
        changed = False
        i = 1
        while i < len(pts) - 1:
            turn = _turn_deg(pts[i - 1], pts[i], pts[i + 1])
            x0, y0 = pts[i - 1]
            x1, y1 = pts[i + 1]
            x, y = pts[i]
            dx, dy = x1 - x0, y1 - y0
            denom = math.hypot(dx, dy)
            dist = (
                0.0
                if denom < 1e-9
                else abs((x - x0) * dy - (y - y0) * dx) / denom
            )
            if turn <= COLLINEAR_FOLD_DEG and dist <= COLLINEAR_FOLD_DIST_PX:
                pts.pop(i)
                changed = True
                continue
            i += 1
    return pts


def _arc_length(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        total += math.hypot(
            points[i + 1][0] - points[i][0],
            points[i + 1][1] - points[i][1],
        )
    return total


def _arc_length_prefix(points: list[tuple[float, float]]) -> list[float]:
    lengths = [0.0]
    for i in range(1, len(points)):
        lengths.append(
            lengths[-1]
            + math.hypot(
                points[i][0] - points[i - 1][0],
                points[i][1] - points[i - 1][1],
            )
        )
    return lengths


def _point_at_arclength(
    points: list[tuple[float, float]],
    lengths: list[float],
    target: float,
) -> tuple[float, float]:
    if target <= 0.0:
        return points[0]
    if target >= lengths[-1]:
        return points[-1]
    idx = 0
    while idx < len(lengths) - 1 and lengths[idx + 1] < target:
        idx += 1
    span = lengths[idx + 1] - lengths[idx]
    t = 0.0 if span < 1e-9 else (target - lengths[idx]) / span
    x0, y0 = points[idx]
    x1, y1 = points[idx + 1]
    return (x0 + t * (x1 - x0), y0 + t * (y1 - y0))


def _point_to_segment_dist(
    px: float,
    py: float,
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 < 1e-12:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _point_to_polyline_dist(
    pixel: tuple[float, float], points: list[tuple[float, float]]
) -> float:
    if not points:
        return math.inf
    if len(points) == 1:
        return math.hypot(pixel[0] - points[0][0], pixel[1] - points[0][1])
    return min(
        _point_to_segment_dist(pixel[0], pixel[1], points[i], points[i + 1])
        for i in range(len(points) - 1)
    )


def _neighbors(run: _Run) -> list[_Run]:
    return run.left + run.right


def _build_run_graph(mask: np.ndarray) -> list[_Run]:
    binary = mask > 0
    _, width = binary.shape[:2]
    cols: list[list[_Run]] = []
    all_runs: list[_Run] = []
    for x in range(width):
        spans = _runs_in_column(binary[:, x])
        runs = [
            _Run(x, y0, y1, sole=len(spans) == 1) for y0, y1 in spans
        ]
        cols.append(runs)
        all_runs.extend(runs)
    for x in range(width - 1):
        for left in cols[x]:
            for right in cols[x + 1]:
                if _overlaps((left.y0, left.y1), (right.y0, right.y1)):
                    left.right.append(right)
                    right.left.append(left)
    _mark_corridors(all_runs)
    return all_runs


def _mark_corridors(all_runs: list[_Run]) -> None:
    seen: set[int] = set()
    for seed in all_runs:
        if id(seed) in seen or not seed.sole:
            continue
        stack = [seed]
        comp: list[_Run] = []
        while stack:
            node = stack.pop()
            if id(node) in seen or not node.sole:
                continue
            seen.add(id(node))
            comp.append(node)
            for nbr in _neighbors(node):
                if nbr.sole and id(nbr) not in seen:
                    stack.append(nbr)
        if any(len(_neighbors(run)) >= 3 for run in comp):
            for run in comp:
                run.corridor = True


def _run_height(run: _Run) -> int:
    return run.y1 - run.y0 + 1


def _is_thin(run: _Run) -> bool:
    return _run_height(run) <= THIN_RUN_MAX_PX


def _edge_capacity(a: _Run, b: _Run) -> int:
    if a.corridor and b.corridor:
        return 2
    return 1


def _choose_next(path: list[_Run], node: _Run, cands: list[_Run]) -> _Run:
    if len(cands) == 1:
        return cands[0]
    prev = path[-2] if len(path) >= 2 else None
    if prev is None:
        return cands[0]
    dx = node.x - prev.x
    if dx != 0:
        forward = [c for c in cands if (c.x - node.x) * dx > 0]
        if forward:
            cands = forward
    if len(cands) == 1:
        return cands[0]
    thins = [r for r in path[:-1] if _is_thin(r)]
    if len(thins) >= 2:
        a, b = thins[-2], thins[-1]
        p0 = a.pt
        if b.x != a.x:
            t = (node.x - a.x) / (b.x - a.x)
            p1 = (float(node.x), a.pt[1] + t * (b.pt[1] - a.pt[1]))
        else:
            p1 = node.pt
    else:
        p0, p1 = prev.pt, node.pt
    return min(cands, key=lambda n: _turn_deg(p0, p1, n.pt))


def _chain_to_points(chain: list[_Run]) -> list[tuple[float, float]]:
    if not chain:
        return []
    pts: list[tuple[float, float]] = []
    i = 0
    n = len(chain)
    while i < n:
        if _run_height(chain[i]) < VERTICAL_RUN_MIN_PX:
            pts.append(chain[i].pt)
            i += 1
            continue
        j = i + 1
        while j < n and _run_height(chain[j]) >= VERTICAL_RUN_MIN_PX:
            j += 1
        block = chain[i:j]
        x = sum(float(b.x) for b in block) / len(block)
        y0 = float(min(b.y0 for b in block))
        y1 = float(max(b.y1 for b in block))
        top, bot = (x, y0), (x, y1)
        next_run = chain[j] if j < n else None
        prev_pt = pts[-1] if pts else None
        if next_run is not None:
            ref_y = next_run.pt[1]
        elif prev_pt is not None:
            ref_y = prev_pt[1]
        else:
            ref_y = y0
        connect_top = abs(ref_y - y0) <= abs(ref_y - y1)
        near, far = (top, bot) if connect_top else (bot, top)
        if prev_pt is None:
            pts.append(far)
            pts.append(near)
        else:
            pts.append(near)
            pts.append(far)
        i = j
    return pts


def _edge_exhausted(
    a: _Run, b: _Run, used: dict[tuple[int, int], int]
) -> bool:
    return used.get((id(a), id(b)), 0) >= _edge_capacity(a, b)


def _mark_edge(a: _Run, b: _Run, used: dict[tuple[int, int], int]) -> None:
    used[(id(a), id(b))] = used.get((id(a), id(b)), 0) + 1
    used[(id(b), id(a))] = used.get((id(b), id(a)), 0) + 1


def _walk_path(
    start: _Run, used: dict[tuple[int, int], int]
) -> list[_Run]:
    def unused(node: _Run) -> list[_Run]:
        return [n for n in _neighbors(node) if not _edge_exhausted(node, n, used)]

    path = [start]
    prev: _Run | None = None
    node = start
    while True:
        cands = unused(node)
        if prev is not None:
            cands = [c for c in cands if c is not prev]
        if not cands:
            break
        nxt = _choose_next(path, node, cands)
        _mark_edge(node, nxt, used)
        path.append(nxt)
        prev, node = node, nxt
    return path


def _should_start(run: _Run, unused: list[_Run]) -> bool:
    if not unused or run.corridor:
        return False
    if not _is_thin(run) and len(_neighbors(run)) > 1:
        return False
    return True


def build_segments(mask: np.ndarray, min_length: float = 2.0) -> list[Segment]:
    if mask.size == 0:
        return []
    all_runs = _build_run_graph(mask)
    used: dict[tuple[int, int], int] = {}
    polylines: list[list[tuple[float, float]]] = []

    def unused_neighbors(run: _Run) -> list[_Run]:
        return [n for n in _neighbors(run) if not _edge_exhausted(run, n, used)]

    starts = [r for r in all_runs if len(_neighbors(r)) == 1]
    starts.extend(r for r in all_runs if r not in starts)

    for start in starts:
        if not _neighbors(start):
            pts = [(float(start.x), float(start.y0))]
            if start.y1 != start.y0:
                pts.append((float(start.x), float(start.y1)))
            polylines.append(pts)
            continue
        unused = unused_neighbors(start)
        if not _should_start(start, unused):
            continue
        chain = _walk_path(start, used)
        polylines.append(_chain_to_points(chain))

    segments: list[Segment] = []
    for raw in polylines:
        points = _rdp(_fold_collinear(raw), SIMPLIFY_EPSILON_PX)
        length = _arc_length(points)
        if length + 1e-9 < min_length:
            continue
        segments.append(Segment(points=points, length=length))
    return segments


def segment_at(
    segments: list[Segment],
    pixel: tuple[float, float],
    max_distance: float = 12.0,
) -> Segment | None:
    best: Segment | None = None
    best_d = max_distance
    for seg in segments:
        d = _point_to_polyline_dist(pixel, seg.points)
        if d <= best_d:
            best_d = d
            best = seg
    return best
