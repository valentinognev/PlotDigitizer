from __future__ import annotations

import numpy as np
import pytest

from app.cv.averaging_window import averaging_window


def test_horizontal_line_samples_every_dx():
    mask = np.zeros((40, 60), dtype=np.uint8)
    mask[20, 10:51] = 255
    pts = averaging_window(mask, dx=10.0, dy=10.0)
    assert 4 <= len(pts) <= 6
    assert all(abs(y - 20.5) < 1 for _, y in pts)
    xs = sorted(x for x, _ in pts)
    assert xs[0] == pytest.approx(10.5, abs=1.0)
    for i, expected in enumerate([10.5, 20.5, 30.5, 40.5, 50.5][: len(xs)]):
        assert xs[i] == pytest.approx(expected, abs=1.5)


def test_two_horizontal_lines_keep_two_series():
    mask = np.zeros((70, 60), dtype=np.uint8)
    mask[20, 10:51] = 255
    mask[50, 10:51] = 255
    pts = averaging_window(mask, dx=10.0, dy=10.0)
    low = [p for p in pts if abs(p[1] - 20.5) < 1]
    high = [p for p in pts if abs(p[1] - 50.5) < 1]
    assert len(low) >= 4
    assert len(high) >= 4


def test_empty_mask_returns_empty():
    mask = np.zeros((30, 40), dtype=np.uint8)
    assert averaging_window(mask) == []
