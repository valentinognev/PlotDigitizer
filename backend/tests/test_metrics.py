from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

import metrics


def test_rms_and_max_abs():
    predicted = np.array([1.0, 2.0, 3.0])
    truth = np.array([1.0, 2.0, 4.0])
    assert metrics.rms_error(predicted, truth) == pytest.approx((1.0 / 3.0) ** 0.5)
    assert metrics.max_abs_error(predicted, truth) == pytest.approx(1.0)


def test_mask_f1_and_recall():
    truth = np.array([[0, 255], [255, 0]], dtype=np.uint8)
    pred = np.array([[0, 255], [0, 0]], dtype=np.uint8)
    assert metrics.mask_recall(pred, truth) == pytest.approx(0.5)
    # tp=1, fp=0, fn=1 → precision 1, recall 0.5 → F1 = 2*1*0.5 / 1.5 = 2/3
    assert metrics.mask_f1(pred, truth) == pytest.approx(2.0 / 3.0)


def test_mask_empty_is_perfect():
    z = np.zeros((4, 4), dtype=np.uint8)
    assert metrics.mask_recall(z, z) == 1.0
    assert metrics.mask_f1(z, z) == 1.0


def test_mask_disjoint_nonempty_f1_is_zero():
    pred = np.array([[255, 0], [0, 0]], dtype=np.uint8)
    truth = np.array([[0, 0], [0, 255]], dtype=np.uint8)
    assert metrics.mask_f1(pred, truth) == 0.0


def test_length_mismatch_raises():
    predicted = np.array([1.0, 2.0, 3.0])
    truth = np.array([1.0, 2.0, 3.0, 4.0])
    with pytest.raises(ValueError):
        metrics.rms_error(predicted, truth)
    with pytest.raises(ValueError):
        metrics.max_abs_error(predicted, truth)
    pred = np.zeros((2, 2), dtype=np.uint8)
    mask = np.zeros((2, 3), dtype=np.uint8)
    with pytest.raises(ValueError):
        metrics.mask_f1(pred, mask)
    with pytest.raises(ValueError):
        metrics.mask_recall(pred, mask)


def test_broadcastable_unequal_shapes_raise():
    predicted = np.array([1.0, 2.0, 3.0])
    truth = np.array([1.0])
    with pytest.raises(ValueError):
        metrics.rms_error(predicted, truth)
    with pytest.raises(ValueError):
        metrics.max_abs_error(predicted, truth)
    pred = np.zeros((2, 2), dtype=np.uint8)
    mask = np.zeros((1, 2), dtype=np.uint8)
    with pytest.raises(ValueError):
        metrics.mask_f1(pred, mask)
    with pytest.raises(ValueError):
        metrics.mask_recall(pred, mask)


def test_missing_baseline_passes(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text("{}", encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        metrics.assert_not_worse("synth_rms", 0.12, lower_is_better=True)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_regression_fails_when_worse(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text('{"synth_rms": 0.10}\n', encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        with pytest.raises(AssertionError, match="synth_rms"):
            metrics.assert_not_worse("synth_rms", 0.25, lower_is_better=True)
        metrics.assert_not_worse("synth_rms", 0.05, lower_is_better=True)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_higher_is_better_regression(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text('{"mask_f1": 0.90}\n', encoding="utf-8")
    metrics.configure_baselines(update=False, path=path)
    try:
        with pytest.raises(AssertionError, match="mask_f1"):
            metrics.assert_not_worse("mask_f1", 0.80, lower_is_better=False)
        metrics.assert_not_worse("mask_f1", 0.95, lower_is_better=False)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_update_baselines_persists(tmp_path: Path):
    path = tmp_path / "metrics.json"
    path.write_text("{}", encoding="utf-8")
    metrics.configure_baselines(update=True, path=path)
    try:
        metrics.assert_not_worse("synth_rms", 0.05, lower_is_better=True)
        metrics.flush_baselines()
        stored = json.loads(path.read_text(encoding="utf-8"))
        assert stored["synth_rms"] == pytest.approx(0.05)
    finally:
        metrics.configure_baselines(update=False, path=None)


def test_sessionfinish_skips_flush_on_nonzero_exit(tmp_path: Path):
    from conftest import pytest_sessionfinish

    path = tmp_path / "metrics.json"
    path.write_text("{}", encoding="utf-8")
    metrics.configure_baselines(update=True, path=path)
    try:
        metrics.assert_not_worse("synth_rms", 0.05, lower_is_better=True)
        pytest_sessionfinish(session=None, exitstatus=1)
        assert json.loads(path.read_text(encoding="utf-8")) == {}
        pytest_sessionfinish(session=None, exitstatus=0)
        stored = json.loads(path.read_text(encoding="utf-8"))
        assert stored["synth_rms"] == pytest.approx(0.05)
    finally:
        metrics.configure_baselines(update=False, path=None)
