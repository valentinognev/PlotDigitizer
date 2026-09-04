from __future__ import annotations

import numpy as np
import pytest

from app.cv.color_filter import build_filter_mask
from app.models.schemas import ColorFilter
from tests.metrics import mask_f1
from tests.reference.refcorpus import color_filter_from_engauge, iter_docs, sample_image

pytestmark = pytest.mark.reference


def test_pointplot_documented_ranges_separate_marker_classes(plotdig_ref_dir):
    img = sample_image(plotdig_ref_dir, "pointplot.bmp")
    h, w = img.shape[:2]
    area = h * w
    triangles = build_filter_mask(img, ColorFilter(mode="intensity", low=0.90, high=0.99))
    diamonds = build_filter_mask(img, ColorFilter(mode="intensity", low=0.10, high=0.50))
    n_tri = int(np.count_nonzero(triangles))
    n_dia = int(np.count_nonzero(diamonds))
    assert n_tri > 50
    assert n_dia > 50
    overlap = mask_f1(triangles, diamonds)
    assert overlap < 0.25
    intersection = int(np.count_nonzero((triangles > 0) & (diamonds > 0)))
    assert intersection < 0.10 * min(n_tri, n_dia)
    assert n_tri < 0.20 * area
    assert n_dia < 0.20 * area


def test_reference_doc_color_filter_converts(plotdig_ref_dir):
    docs = list(iter_docs(plotdig_ref_dir))
    assert docs
    converted = color_filter_from_engauge(docs[0].color_filter)
    assert converted.mode in {"intensity", "foreground", "hue", "saturation", "value"}
    assert 0.0 <= converted.low <= 1.0
    assert 0.0 <= converted.high <= 1.0
