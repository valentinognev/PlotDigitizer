from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.cv.segments import build_segments, fill_segment, segment_at
from app.models.schemas import ColorFilter
from metrics import assert_not_worse, rms_error
from tests.synth.plotgen import render_plot


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


def _consecutive_spacings(points: list[tuple[float, float]]) -> list[float]:
    return [
        math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
        for i in range(len(points) - 1)
    ]


def test_fill_segment_spacing_on_straight_stroke():
    mask = _line_mask((40, 260), (10, 20), (250, 20), width=2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    filled = fill_segment(segs[0], separation=25.0, fill_corners=False)
    assert filled[0] == pytest.approx(segs[0].points[0], abs=1.5)
    assert filled[-1] == pytest.approx(segs[0].points[-1], abs=1.5)
    assert len(filled) >= 5
    gaps = _consecutive_spacings(filled)
    for gap in gaps[:-1]:
        assert gap == pytest.approx(25.0, abs=3.0)
    assert gaps[-1] <= 25.0 + 3.0


def test_fill_segment_spacing_on_curved_stroke():
    mask, _analytic = _sine_mask()
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    filled = fill_segment(segs[0], separation=25.0, fill_corners=False)
    assert len(filled) >= 8
    gaps = _consecutive_spacings(filled)
    for gap in gaps[:-1]:
        assert 15.0 <= gap <= 35.0


def test_fill_corners_captures_zigzag_vertices_plain_spacing_misses():
    mask = np.zeros((120, 220), dtype=np.uint8)
    corners = [(10, 60), (50, 20), (90, 100), (130, 20), (170, 100), (210, 60)]
    for i in range(len(corners) - 1):
        cv2.line(mask, corners[i], corners[i + 1], 255, 2)
    segs = build_segments(mask, min_length=2.0)
    assert len(segs) == 1
    plain = fill_segment(segs[0], separation=40.0, fill_corners=False)
    with_corners = fill_segment(segs[0], separation=40.0, fill_corners=True)
    assert len(with_corners) > len(plain)

    inner = corners[1:-1]

    def _hit(samples: list[tuple[float, float]], corner: tuple[int, int], rad: float) -> bool:
        cx, cy = float(corner[0]), float(corner[1])
        return any(math.hypot(px - cx, py - cy) <= rad for px, py in samples)

    missed_plain = [c for c in inner if not _hit(plain, c, 6.0)]
    assert missed_plain, "plain spacing should skip at least one sharp corner"
    for c in inner:
        assert _hit(with_corners, c, 4.0)


def _y_rms_vs_truth(
    pred: list[tuple[float, float]], truth: list[tuple[float, float]]
) -> float:
    """Y-RMS of pred vs truth interpolated onto pred x (point counts differ)."""
    pred_a = np.asarray(pred, dtype=np.float64)
    truth_a = np.asarray(truth, dtype=np.float64)
    order = np.argsort(truth_a[:, 0])
    iy = np.interp(pred_a[:, 0], truth_a[order, 0], truth_a[order, 1])
    return rms_error(pred_a[:, 1], iy)


def test_segment_fill_synthetic_sine_rms_within_half_percent_y_range():
    plot = render_plot(
        lambda x: math.sin(x),
        x_range=(0.0, 2.0 * math.pi),
        y_range=(-1.5, 1.5),
        size=(800, 600),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
    )
    mask = build_filter_mask(plot.image, ColorFilter())
    segs = build_segments(mask, min_length=20.0)
    assert segs, "expected the sine stroke to produce a segment"
    seg = max(segs, key=lambda s: s.length)
    filled = fill_segment(seg, separation=25.0, fill_corners=False, mask=mask)
    pred = [plot.data_of(px, py) for px, py in filled]
    err = _y_rms_vs_truth(pred, plot.truth)
    y_span = 3.0
    assert err <= 0.005 * y_span
    assert_not_worse("segment_fill_synth_sine_rms", err, lower_is_better=True)
