from __future__ import annotations

import numpy as np
import pytest

from tests.synth.plotgen import render_plot


def _grid_mask(
    h: int,
    w: int,
    *,
    start_x: float,
    step_x: float,
    count_x: int,
    start_y: float,
    step_y: float,
    count_y: int,
    thickness: int = 1,
) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    for i in range(count_x):
        x = int(round(start_x + i * step_x))
        if 0 <= x < w:
            x0 = max(0, x - thickness + 1)
            x1 = min(w, x + thickness)
            mask[:, x0:x1] = 255
    for j in range(count_y):
        y = int(round(start_y + j * step_y))
        if 0 <= y < h:
            y0 = max(0, y - thickness + 1)
            y1 = min(h, y + thickness)
            mask[y0:y1, :] = 255
    return mask


def test_detect_grid_recovers_step_and_offset():
    from app.cv.grid_removal import detect_grid

    cases = [
        (12.0, 25.0, 14, 8.0, 30.0, 10),
        (5.0, 40.0, 9, 20.0, 18.0, 16),
        (0.0, 50.0, 8, 1.0, 45.0, 8),
    ]
    for start_x, step_x, count_x, start_y, step_y, count_y in cases:
        mask = _grid_mask(
            320,
            400,
            start_x=start_x,
            step_x=step_x,
            count_x=count_x,
            start_y=start_y,
            step_y=step_y,
            count_y=count_y,
        )
        geom = detect_grid(mask)
        assert geom is not None, (start_x, step_x)
        assert geom.step_x == pytest.approx(step_x, abs=0.5)
        assert geom.step_y == pytest.approx(step_y, abs=0.5)
        assert geom.start_x == pytest.approx(start_x, abs=1.0)
        assert geom.start_y == pytest.approx(start_y, abs=1.0)
        assert geom.count_x >= count_x - 1
        assert geom.count_y >= count_y - 1


def test_detect_grid_returns_none_on_grid_free_plot():
    from app.cv.color_filter import build_filter_mask
    from app.cv.grid_removal import detect_grid
    from app.models.schemas import ColorFilter

    plot = render_plot(lambda x: 0.3 * x + 1.0, x_range=(0.0, 10.0), y_range=(0.0, 5.0), grid=None)
    mask = build_filter_mask(plot.image, ColorFilter(mode="intensity", low=0.0, high=0.4))
    assert detect_grid(mask) is None


def test_detect_grid_rejects_log_spaced_lines():
    from app.cv.grid_removal import detect_grid

    mask = np.zeros((200, 400), dtype=np.uint8)
    for x in (10, 20, 40, 80, 160, 320):
        mask[:, x] = 255
    for y in (8, 16, 32, 64, 128):
        mask[y, :] = 255
    assert detect_grid(mask) is None


def test_detect_grid_recovers_synth_plot_grid():
    from app.cv.color_filter import build_filter_mask
    from app.cv.grid_removal import detect_grid
    from app.models.schemas import ColorFilter

    nx, ny = 8, 6
    width, height = 800, 600
    plot = render_plot(
        lambda x: 0.3 * x + 1.0,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(width, height),
        grid=(nx, ny),
    )
    # Gray grid luminance is ~0.78; keep grid+curve, reject white paper.
    mask = build_filter_mask(plot.image, ColorFilter(mode="intensity", low=0.0, high=0.85))
    geom = detect_grid(mask)
    assert geom is not None
    x0 = 0.12 * width
    x1 = width - x0
    y_top = 0.12 * height
    y_bot = height - y_top
    assert geom.step_x == pytest.approx((x1 - x0) / (nx + 1), abs=1.0)
    assert geom.step_y == pytest.approx((y_bot - y_top) / (ny + 1), abs=1.0)
    assert geom.count_x >= nx - 1
    assert geom.count_y >= ny - 1


def test_remove_grid_erases_lines_and_heals_crossing():
    from app.cv.grid_removal import GridGeometry, remove_grid

    h, w = 80, 120
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[30, 10:110] = 255  # horizontal curve
    for x in (20, 50, 80):
        mask[:, x] = 255  # vertical grid
    geom = GridGeometry(start_x=20.0, step_x=30.0, count_x=3, start_y=0.0, step_y=0.0, count_y=0)
    out = remove_grid(mask, geom, close_distance=10)
    assert out.dtype == np.uint8
    assert out[10, 50] == 0
    assert out[30, 50] == 255
    assert out[30, 40] == 255


def test_remove_grid_heals_vertical_curve_across_horizontal_grid():
    from app.cv.grid_removal import GridGeometry, remove_grid

    mask = np.zeros((90, 70), dtype=np.uint8)
    mask[5:85, 35] = 255
    for y in (20, 45, 70):
        mask[y, :] = 255
    geom = GridGeometry(start_x=0.0, step_x=0.0, count_x=0, start_y=20.0, step_y=25.0, count_y=3)
    out = remove_grid(mask, geom, close_distance=10)
    assert out[45, 10] == 0
    assert out[45, 35] == 255


def test_remove_grid_does_not_assume_function_of_x():
    from app.cv.grid_removal import GridGeometry, remove_grid

    # Closed ring crossing a vertical grid line twice — polar-like, not y=f(x).
    mask = np.zeros((100, 100), dtype=np.uint8)
    yy, xx = np.ogrid[:100, :100]
    ring = np.abs(np.hypot(xx - 50, yy - 50) - 25) < 1.5
    mask[ring] = 255
    mask[:, 50] = 255
    geom = GridGeometry(start_x=50.0, step_x=0.0, count_x=1, start_y=0.0, step_y=0.0, count_y=0)
    out = remove_grid(mask, geom, close_distance=10)
    assert out[50, 50] == 0
    assert out[25, 50] == 255
    assert out[75, 50] == 255
