from __future__ import annotations

import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.cv.grid_removal import detect_grid, remove_grid
from app.models.schemas import ColorFilter
from metrics import assert_not_worse, mask_f1, mask_recall
from tests.reference.refcorpus import sample_image

pytestmark = pytest.mark.reference

PAIRS = [
    "gnuplot_theta_r_lines",
    "gnuplot_theta_r_linespoints",
    "gnuplot_theta_r_points",
    "gnuplot_x_log_y_lines",
    "gnuplot_x_log_y_linespoints",
    "gnuplot_x_log_y_points",
    "gnuplot_x_y_lines",
    "gnuplot_x_y_linespoints",
    "gnuplot_x_y_points",
]

FILTER = ColorFilter(mode="intensity", low=0.0, high=0.85)


@pytest.fixture
def ref_dir(plotdig_ref_dir):
    return plotdig_ref_dir


def _filtered(ref_dir, name: str) -> np.ndarray:
    return build_filter_mask(sample_image(ref_dir, name), FILTER)


@pytest.mark.parametrize("base", PAIRS)
def test_grid_nogrid_mask_gate(ref_dir, base: str):
    grid_mask = _filtered(ref_dir, f"{base}_grid.png")
    truth = _filtered(ref_dir, f"{base}_nogrid.png")
    geom = detect_grid(grid_mask)
    assert geom is not None
    pred = remove_grid(grid_mask, geom, close_distance=10)
    f1 = mask_f1(pred, truth)
    recall = mask_recall(pred, truth)
    assert f1 >= 0.90, f"{base} f1={f1:.4f}"
    assert recall >= 0.95, f"{base} recall={recall:.4f} (curve ink eaten?)"
    assert_not_worse(f"grid_removal/{base}/f1", f1, lower_is_better=False)
    assert_not_worse(f"grid_removal/{base}/recall", recall, lower_is_better=False)


@pytest.mark.parametrize("name", ["gridlines.gif", "gridlines_log.gif"])
def test_gridlines_samples_remove_most_grid_ink(ref_dir, name: str):
    img = sample_image(ref_dir, name)
    mask = build_filter_mask(img, FILTER)
    before = int(np.count_nonzero(mask))
    geom = detect_grid(mask)
    if geom is None:
        pytest.skip(f"no uniform grid detected on {name}")
    after_mask = remove_grid(mask, geom, close_distance=10)
    after = int(np.count_nonzero(after_mask))
    assert after < 0.55 * before
