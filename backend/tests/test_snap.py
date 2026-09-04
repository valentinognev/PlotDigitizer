from __future__ import annotations

import math

import numpy as np
import pytest


def _stroke_mask(h: int, w: int, y_center: float, x0: int, x1: int, half_width: float = 1.2) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        if abs((y + 0.5) - y_center) <= half_width:
            mask[y, x0:x1] = 255
    return mask


def test_snap_recovers_subpixel_centerline():
    from app.cv.snap import snap_to_ink

    errors: list[float] = []
    for true_y in (20.15, 20.35, 20.50, 21.20, 30.80):
        mask = _stroke_mask(60, 80, true_y, 10, 70, half_width=1.5)
        snapped = snap_to_ink(mask, (40.0, true_y - 2.0), window=7)
        errors.append(abs(snapped[1] - true_y))
        assert snapped[0] == pytest.approx(40.0, abs=2.0)
    assert float(np.mean(errors)) <= 0.35


def test_snap_with_direction_beats_isotropic_on_diagonal():
    from app.cv.snap import snap_to_ink

    mask = np.zeros((80, 80), dtype=np.uint8)
    for t in range(10, 70):
        x = t
        y = t
        mask[max(0, y - 1) : y + 2, max(0, x - 1) : x + 2] = 255
    seed = (40.0, 36.0)
    isotropic = snap_to_ink(mask, seed, window=7, direction=None)
    directed = snap_to_ink(mask, seed, window=7, direction=(1.0, 1.0))
    true = (38.0, 38.0)
    err_iso = math.hypot(isotropic[0] - true[0], isotropic[1] - true[1])
    err_dir = math.hypot(directed[0] - true[0], directed[1] - true[1])
    assert err_dir < err_iso


def test_snap_empty_window_is_noop():
    from app.cv.snap import snap_to_ink

    mask = np.zeros((40, 40), dtype=np.uint8)
    assert snap_to_ink(mask, (12.5, 8.25), window=7) == (12.5, 8.25)
