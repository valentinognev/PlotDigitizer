from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class GridGeometry:
    start_x: float
    step_x: float
    count_x: int
    start_y: float
    step_y: float
    count_y: int


def _parabolic_peak(y: np.ndarray, k: int) -> float:
    if k <= 0 or k >= int(y.size) - 1:
        return float(k)
    a = float(y[k - 1])
    b = float(y[k])
    c = float(y[k + 1])
    denom = a - 2.0 * b + c
    if abs(denom) < 1e-12:
        return float(k)
    delta = 0.5 * (a - c) / denom
    if abs(delta) >= 1.0:
        return float(k)
    return float(k) + delta


def _dominant_period(proj: np.ndarray) -> float | None:
    n = int(proj.size)
    if n < 16:
        return None
    x = proj.astype(np.float64) - float(proj.mean())
    spec = np.fft.rfft(x)
    mag = np.abs(spec)
    mag[0] = 0.0
    if mag.size < 4:
        return None
    noise = float(np.median(mag[1:])) + 1e-9
    ac = np.fft.irfft(spec * np.conj(spec), n=n)
    min_lag = 4
    max_lag = n // 3
    if max_lag <= min_lag + 1:
        return None
    region = ac[min_lag : max_lag + 1]
    if region.size == 0 or float(region.max()) <= 0:
        return None
    ac_thresh = 0.4 * float(region.max())
    lag: int | None = None
    for k in range(min_lag, max_lag):
        if ac[k] >= ac[k - 1] and ac[k] >= ac[k + 1] and ac[k] >= ac_thresh:
            lag = k
            break
    if lag is None:
        lag = int(np.argmax(region)) + min_lag
    step = _parabolic_peak(ac, lag)
    if step < 4.0 or step > n / 3.0:
        return None
    k_fft = n / step
    k_lo = max(1, int(np.floor(k_fft)))
    k_hi = min(int(mag.size) - 1, int(np.ceil(k_fft)))
    mag_at = max(float(mag[k_lo]), float(mag[k_hi]))
    if mag_at <= 4.0 * noise:
        return None
    return float(step)


def _start_and_count(proj: np.ndarray, step: float) -> tuple[float, int] | None:
    n = int(proj.size)
    baseline = float(np.median(proj))
    amp = float(proj.max()) - baseline
    if amp <= 0:
        return None
    thresh = baseline + 0.4 * amp
    above = np.where(proj >= thresh)[0]
    if above.size == 0:
        return None
    xs: list[float] = []
    pos = float(above[0])
    while pos < n:
        lo = max(0, int(round(pos - step * 0.25)))
        hi = min(n, int(round(pos + step * 0.25)) + 1)
        if hi <= lo:
            break
        local = proj[lo:hi]
        if float(local.max()) < thresh:
            break
        peak = float(lo + int(np.argmax(local)))
        xs.append(peak)
        pos = peak + step
    if len(xs) < 3:
        return None
    valley_lim = 0.6 * (baseline + amp)
    for a, b in zip(xs, xs[1:]):
        mid = int(round(0.5 * (a + b)))
        if 0 <= mid < n and float(proj[mid]) > valley_lim:
            return None
    return xs[0], len(xs)


def _axis_geometry(proj: np.ndarray) -> tuple[float, float, int] | None:
    step = _dominant_period(proj)
    if step is None:
        return None
    found = _start_and_count(proj, step)
    if found is None:
        return None
    start, count = found
    return start, step, count


def detect_grid(mask: np.ndarray) -> GridGeometry | None:
    ink = (mask > 0).astype(np.float64)
    col = ink.sum(axis=0)
    row = ink.sum(axis=1)
    gx = _axis_geometry(col)
    gy = _axis_geometry(row)
    if gx is None and gy is None:
        return None
    start_x, step_x, count_x = gx if gx is not None else (0.0, 0.0, 0)
    start_y, step_y, count_y = gy if gy is not None else (0.0, 0.0, 0)
    return GridGeometry(
        start_x=start_x,
        step_x=step_x,
        count_x=count_x,
        start_y=start_y,
        step_y=step_y,
        count_y=count_y,
    )
