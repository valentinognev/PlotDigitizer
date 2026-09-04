from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.cv.segments import build_segments, segment_at


def _line_mask(
    size: tuple[int, int],
    a: tuple[int, int],
    b: tuple[int, int],
    width: int = 2,
) -> np.ndarray:
    mask = np.zeros(size, dtype=np.uint8)
    cv2.line(mask, a, b, 255, width)
    return mask


def _sine_mask() -> tuple[np.ndarray, list[tuple[float, float]]]:
    h, w = 400, 500
    mask = np.zeros((h, w), dtype=np.uint8)
    xs = np.linspace(50.0, 450.0, 401)
    ys = 200.0 + 40.0 * np.sin(2.0 * np.pi * (xs - 50.0) / 400.0)
    analytic = list(zip(xs.tolist(), ys.tolist(), strict=True))
    for i in range(len(xs) - 1):
        cv2.line(
            mask,
            (int(round(xs[i])), int(round(ys[i]))),
            (int(round(xs[i + 1])), int(round(ys[i + 1]))),
            255,
            2,
        )
    return mask, analytic


def _nearest_analytic_dist(
    px: float, py: float, analytic: list[tuple[float, float]]
) -> float:
    return min(math.hypot(px - ax, py - ay) for ax, ay in analytic)


def _point_to_line_dist(
    px: float,
    py: float,
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    denom = math.hypot(dx, dy)
    if denom < 1e-9:
        return math.hypot(px - ax, py - ay)
    return abs((px - ax) * dy - (py - ay) * dx) / denom


def test_single_stroke_is_one_segment_tracking_analytic_sine():
    mask, analytic = _sine_mask()
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    seg = segs[0]
    assert len(seg.points) >= 4
    assert seg.length == pytest.approx(
        sum(
            math.hypot(
                seg.points[i + 1][0] - seg.points[i][0],
                seg.points[i + 1][1] - seg.points[i][1],
            )
            for i in range(len(seg.points) - 1)
        ),
        rel=1e-9,
    )
    # Compact polyline: not one vertex per column.
    assert len(seg.points) < 200
    for px, py in seg.points:
        assert _nearest_analytic_dist(px, py, analytic) <= 2.5


def test_crossing_strokes_are_two_segments_not_one():
    """Two diagonals that share a pixel must not fuse or swap branches.

    Expected count is exactly 2. Every vertex of each segment must stay
    within 2.5 px of one and the same analytic line (the infinite line
    through that stroke's endpoints). A linker that swaps arms at the
    junction still yields two segments, but each segment's vertices
    split across both lines and fail this check.
    """
    main_a, main_b = (20.0, 20.0), (180.0, 180.0)
    anti_a, anti_b = (20.0, 180.0), (180.0, 20.0)
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.line(mask, (20, 20), (180, 180), 255, 2)
    cv2.line(mask, (20, 180), (180, 20), 255, 2)
    segs = build_segments(mask, min_length=20.0)
    assert len(segs) == 2

    jump_tol_px = 2.5

    def _on_line(seg, a: tuple[float, float], b: tuple[float, float]) -> bool:
        return all(
            _point_to_line_dist(px, py, a, b) <= jump_tol_px
            for px, py in seg.points
        )

    assigned = []
    for seg in segs:
        on_main = _on_line(seg, main_a, main_b)
        on_anti = _on_line(seg, anti_a, anti_b)
        assert on_main ^ on_anti, (
            "segment jumped between the two strokes "
            "(vertices are not all on one analytic line)"
        )
        assigned.append("main" if on_main else "anti")
    assert sorted(assigned) == ["anti", "main"]


def test_doubling_back_stroke_is_one_segment():
    """A U that is not a function of x must stay a single polyline."""
    mask = np.zeros((160, 200), dtype=np.uint8)
    cv2.line(mask, (30, 20), (30, 140), 255, 2)
    cv2.line(mask, (30, 140), (170, 140), 255, 2)
    cv2.line(mask, (170, 140), (170, 20), 255, 2)
    segs = build_segments(mask, min_length=10.0)
    assert len(segs) == 1
    assert segs[0].length == pytest.approx(120 + 140 + 120, abs=25.0)
    xs = [p[0] for p in segs[0].points]
    assert min(xs) < 50 and max(xs) > 150


def test_short_speckles_below_min_length_are_dropped():
    mask = np.zeros((80, 80), dtype=np.uint8)
    mask[10:12, 10:12] = 255
    mask[40:43, 50:52] = 255
    cv2.line(mask, (5, 70), (75, 70), 255, 2)
    segs = build_segments(mask, min_length=10.0)
    assert len(segs) == 1
    assert segs[0].length >= 60.0


def test_segment_at_picks_nearest_and_none_beyond_max_distance():
    mask = _line_mask((100, 200), (10, 50), (190, 50), width=2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    hit = segment_at(segs, (100.0, 50.0), max_distance=12.0)
    assert hit is segs[0]
    miss = segment_at(segs, (100.0, 80.0), max_distance=12.0)
    assert miss is None


def test_segment_at_chooses_closer_of_two_parallel_strokes():
    mask = np.zeros((80, 200), dtype=np.uint8)
    cv2.line(mask, (10, 20), (190, 20), 255, 2)
    cv2.line(mask, (10, 60), (190, 60), 255, 2)
    segs = build_segments(mask, min_length=20.0)
    assert len(segs) == 2
    hit = segment_at(segs, (100.0, 22.0), max_distance=12.0)
    assert hit is not None
    ys = [p[1] for p in hit.points]
    assert sum(ys) / len(ys) < 40.0


def test_y_junction_does_not_double_walk_the_stem():
    """A stem with two arms must not appear as two full-trunk polylines."""
    mask = np.zeros((120, 200), dtype=np.uint8)
    cv2.line(mask, (20, 60), (90, 60), 255, 2)
    cv2.line(mask, (90, 60), (170, 25), 255, 2)
    cv2.line(mask, (90, 60), (170, 95), 255, 2)
    segs = build_segments(mask, min_length=20.0)

    def _covers_stem(seg) -> bool:
        return any(p[0] < 70.0 and abs(p[1] - 60.0) <= 4.0 for p in seg.points)

    assert sum(1 for s in segs if _covers_stem(s)) == 1
