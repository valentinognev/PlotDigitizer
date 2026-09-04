from __future__ import annotations

import json
from pathlib import Path

import numpy as np

_COMMITTED_PATH = Path(__file__).resolve().parent / "reference" / "baselines" / "metrics.json"
_PATH = _COMMITTED_PATH
_UPDATE = False
_BASELINES: dict[str, float] = {}


def configure_baselines(*, update: bool, path: Path | None = None) -> None:
    global _UPDATE, _BASELINES, _PATH
    _UPDATE = bool(update)
    _PATH = Path(path) if path is not None else _COMMITTED_PATH
    if _PATH.is_file():
        raw = json.loads(_PATH.read_text(encoding="utf-8"))
        _BASELINES = {str(k): float(v) for k, v in raw.items()}
    else:
        _BASELINES = {}


def flush_baselines() -> None:
    if not _UPDATE:
        return
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {k: _BASELINES[k] for k in sorted(_BASELINES)}
    _PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def rms_error(predicted: np.ndarray, truth: np.ndarray) -> float:
    predicted = np.asarray(predicted, dtype=np.float64)
    truth = np.asarray(truth, dtype=np.float64)
    diff = predicted - truth
    return float(np.sqrt(np.mean(diff * diff)))


def max_abs_error(predicted: np.ndarray, truth: np.ndarray) -> float:
    predicted = np.asarray(predicted, dtype=np.float64)
    truth = np.asarray(truth, dtype=np.float64)
    return float(np.max(np.abs(predicted - truth)))


def _binary(mask: np.ndarray) -> np.ndarray:
    return np.asarray(mask) != 0


def mask_recall(pred: np.ndarray, truth: np.ndarray) -> float:
    t = _binary(truth)
    p = _binary(pred)
    tp = np.logical_and(t, p).sum()
    fn = np.logical_and(t, np.logical_not(p)).sum()
    denom = int(tp + fn)
    return float(tp / denom) if denom else 1.0


def mask_f1(pred: np.ndarray, truth: np.ndarray) -> float:
    t = _binary(truth)
    p = _binary(pred)
    tp = float(np.logical_and(t, p).sum())
    fp = float(np.logical_and(np.logical_not(t), p).sum())
    fn = float(np.logical_and(t, np.logical_not(p)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    if precision + recall == 0:
        return 1.0
    return float(2.0 * precision * recall / (precision + recall))


def assert_not_worse(name: str, value: float, *, lower_is_better: bool) -> None:
    current = float(value)
    if name not in _BASELINES:
        _BASELINES[name] = current
        return
    baseline = float(_BASELINES[name])
    if lower_is_better:
        assert current <= baseline, f"{name}: {current} worse than baseline {baseline} (lower is better)"
    else:
        assert current >= baseline, f"{name}: {current} worse than baseline {baseline} (higher is better)"
    if _UPDATE:
        _BASELINES[name] = current
