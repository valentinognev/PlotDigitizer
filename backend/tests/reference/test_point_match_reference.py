from __future__ import annotations

import math
import os

import cv2
import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.cv.point_match import match_points
from app.models.schemas import ColorFilter
from metrics import assert_not_worse
from tests.reference.refcorpus import sample_image

pytestmark = pytest.mark.reference

# Engauge samples/README documents Discretize intensity on a 0..100 scale:
# triangles 90–99, diamonds 10–50. Our ColorFilter.low/high are 0..1.
TRIANGLE_FILTER = ColorFilter(mode="intensity", low=0.90, high=0.99)
DIAMOND_FILTER = ColorFilter(mode="intensity", low=0.10, high=0.50)


@pytest.fixture
def ref_dir(plotdig_ref_dir):
    return plotdig_ref_dir


def _centroids(mask: np.ndarray, min_area: int = 8) -> list[tuple[float, float]]:
    binary = (mask > 0).astype(np.uint8)
    n, _labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    out: list[tuple[float, float]] = []
    for i in range(1, n):
        if int(stats[i, cv2.CC_STAT_AREA]) < min_area:
            continue
        out.append((float(centroids[i][0]), float(centroids[i][1])))
    return out


def _greedy_match(candidates, truth, cutoff: float) -> tuple[float, float, float]:
    used = [False] * len(truth)
    tp = 0
    distances: list[float] = []
    for cand in candidates:
        cx, cy = cand.pixel
        best_i = -1
        best_d = cutoff + 1.0
        for i, (tx, ty) in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cx - tx, cy - ty)
            if d < best_d:
                best_d = d
                best_i = i
        if best_i >= 0 and best_d <= cutoff:
            used[best_i] = True
            tp += 1
            distances.append(best_d)
    fp = len(candidates) - tp
    recall = tp / max(len(truth), 1)
    fp_rate = fp / max(tp + fp, 1)
    mean_d = float(sum(distances) / len(distances)) if distances else 999.0
    return recall, fp_rate, mean_d


def _run_class(img_bgr: np.ndarray, flt: ColorFilter, key: str) -> None:
    mask = build_filter_mask(img_bgr, flt)
    truth = _centroids(mask)
    assert len(truth) >= 3
    sample = truth[0]
    size = int(os.environ.get("PLOTDIG_POINT_MATCH_SIZE", "24"))
    out = match_points(mask, sample, sample_radius=max(4, size // 2), max_point_size=size)
    recall, fp_rate, mean_d = _greedy_match(out, truth, cutoff=1.5)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    assert mean_d <= 1.5
    assert_not_worse(f"point_match.{key}.recall", recall, lower_is_better=False)
    assert_not_worse(f"point_match.{key}.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse(f"point_match.{key}.centroid_px", mean_d, lower_is_better=True)


def test_pointplot_bmp_triangles_and_diamonds(ref_dir):
    img = sample_image(ref_dir, "pointplot.bmp")
    _run_class(img, TRIANGLE_FILTER, "pointplot.triangles")
    _run_class(img, DIAMOND_FILTER, "pointplot.diamonds")


def test_pointmatch_jpg_fuzzy_markers(ref_dir):
    img = sample_image(ref_dir, "pointmatch.jpg")
    mask = build_filter_mask(img, ColorFilter(mode="intensity", low=0.0, high=0.45))
    truth = _centroids(mask, min_area=4)
    assert len(truth) >= 3
    out = match_points(mask, truth[0], sample_radius=8, max_point_size=32)
    assert len(out) >= 1
    recall, fp_rate, mean_d = _greedy_match(out, truth, cutoff=2.5)
    assert recall > 0.0
    assert mean_d <= 2.5
    assert_not_worse("point_match.pointmatch_jpg.recall", recall, lower_is_better=False)
    assert_not_worse("point_match.pointmatch_jpg.fp_rate", fp_rate, lower_is_better=True)
    assert_not_worse("point_match.pointmatch_jpg.centroid_px", mean_d, lower_is_better=True)
