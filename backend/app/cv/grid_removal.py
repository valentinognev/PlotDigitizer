from __future__ import annotations

from dataclasses import dataclass

import cv2
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


def _local_maxima(proj: np.ndarray, thresh: float) -> list[int]:
    n = int(proj.size)
    peaks: list[int] = []
    for i in range(1, n - 1):
        if proj[i] >= proj[i - 1] and proj[i] >= proj[i + 1] and proj[i] >= thresh:
            peaks.append(i)
    return peaks


def _isolated_maxima(proj: np.ndarray, thresh: float, isolation: int = 12) -> list[int]:
    raw = _local_maxima(proj, thresh)
    ordered = sorted(raw, key=lambda i: float(proj[i]), reverse=True)
    kept: list[int] = []
    for i in ordered:
        if all(abs(i - j) >= isolation for j in kept):
            kept.append(i)
    return sorted(kept)


def _longest_arithmetic_grid(
    peaks: list[int],
    n: int,
    *,
    min_step: float,
    min_count: int,
) -> tuple[float, float, int] | None:
    if len(peaks) < min_count:
        return None
    peak_set = set(peaks)
    pts = np.asarray(peaks, dtype=np.float64)
    best: tuple[int, float, float, int] | None = None
    for i, start in enumerate(peaks):
        for later in peaks[i + 1 :]:
            step = float(later - start)
            if step < min_step:
                continue
            hits: list[int] = []
            pos = float(start)
            for _ in range(40):
                if pos > n - 1 + 2:
                    break
                j = int(np.argmin(np.abs(pts - pos)))
                if abs(pts[j] - pos) <= max(2.0, 0.06 * step):
                    hits.append(int(pts[j]))
                pos += step
            uniq: list[int] = []
            for h in hits:
                if not uniq or h != uniq[-1]:
                    uniq.append(h)
            if len(uniq) < min_count:
                continue
            gaps = np.diff(uniq)
            if np.any(np.abs(gaps - step) > max(3.0, 0.1 * step)):
                continue
            extras = 0
            for a, b in zip(uniq, uniq[1:]):
                extras += sum(1 for p in peak_set if a < p < b)
            extra_lim = max(1, len(uniq) // 2) if min_count >= 8 else max(1, len(uniq) // 4)
            if extras > extra_lim:
                continue
            if best is None or len(uniq) > best[0]:
                best = (len(uniq), float(uniq[0]), float(np.mean(gaps)), len(uniq))
    if best is None:
        return None
    _, start, step, count = best
    return start, step, count


def _axis_from_peaks(proj: np.ndarray) -> tuple[float, float, int] | None:
    n = int(proj.size)
    med = float(np.median(proj))
    mx = float(proj.max())
    if mx <= 0:
        return None
    strong = _longest_arithmetic_grid(
        _isolated_maxima(proj, max(2.5 * med, 0.25 * mx)),
        n,
        min_step=40.0,
        min_count=5,
    )
    if strong is not None:
        return strong
    return _longest_arithmetic_grid(
        _isolated_maxima(proj, max(2.0 * med, 0.05 * mx)),
        n,
        min_step=40.0,
        min_count=8,
    )


def detect_grid(mask: np.ndarray) -> GridGeometry | None:
    ink = (mask > 0).astype(np.float64)
    col = ink.sum(axis=0)
    row = ink.sum(axis=1)
    gx = _axis_geometry(col) or _axis_from_peaks(col)
    gy = _axis_geometry(row) or _axis_from_peaks(row)
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


def _runs(column: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = 0
    inside = False
    for i, val in enumerate(column):
        if val > 0 and not inside:
            inside = True
            start = i
        elif val == 0 and inside:
            runs.append((start, i - 1))
            inside = False
    if inside:
        runs.append((start, int(column.size) - 1))
    return runs


def _centroid(run: tuple[int, int]) -> float:
    return 0.5 * (run[0] + run[1])


def _mutual_pairs(
    left: list[tuple[int, int]],
    right: list[tuple[int, int]],
    close_distance: int,
) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    if not left or not right:
        return []
    pairs: list[tuple[tuple[int, int], tuple[int, int]]] = []
    used_r: set[int] = set()
    for i, lr in enumerate(left):
        lc = _centroid(lr)
        j = min(range(len(right)), key=lambda k: abs(_centroid(right[k]) - lc))
        if j in used_r:
            continue
        rc = _centroid(right[j])
        i2 = min(range(len(left)), key=lambda k: abs(_centroid(left[k]) - rc))
        if i2 != i:
            continue
        if abs(lc - rc) > close_distance:
            continue
        pairs.append((lr, right[j]))
        used_r.add(j)
    return pairs


_ERASE_HALF = 1
_DASHED_FILL = (0.20, 0.65)
_SMALL_CC = 6
_SKINNY_CC = 200
_SKINNY_FILL = 0.15


def _heal_vertical(out: np.ndarray, x: int, close_distance: int, half: int = _ERASE_HALF) -> None:
    h, w = out.shape
    left_x = x - half - 1
    right_x = x + half + 1
    if left_x < 0 or right_x >= w:
        return
    pairs = _mutual_pairs(_runs(out[:, left_x]), _runs(out[:, right_x]), close_distance)
    x0 = max(0, x - half)
    x1 = min(w, x + half + 1)
    for (l0, l1), (r0, r1) in pairs:
        y0 = min(l0, r0)
        y1 = max(l1, r1)
        out[y0 : y1 + 1, x0:x1] = 255


def _heal_horizontal(out: np.ndarray, y: int, close_distance: int, half: int = _ERASE_HALF) -> None:
    h, w = out.shape
    top_y = y - half - 1
    bot_y = y + half + 1
    if top_y < 0 or bot_y >= h:
        return
    pairs = _mutual_pairs(_runs(out[top_y, :]), _runs(out[bot_y, :]), close_distance)
    y0 = max(0, y - half)
    y1 = min(h, y + half + 1)
    for (l0, l1), (r0, r1) in pairs:
        x0 = min(l0, r0)
        x1 = max(l1, r1)
        out[y0:y1, x0 : x1 + 1] = 255


def _snap_lines(proj: np.ndarray, start: float, step: float, count: int) -> list[int]:
    n = int(proj.size)
    xs: list[int] = []
    for i in range(count):
        x = int(np.floor(start + i * step + 0.5))
        lo = max(0, x - 2)
        hi = min(n, x + 3)
        xs.append(int(lo + np.argmax(proj[lo:hi])))
    return xs


def _drop_dashed_specks(mask: np.ndarray) -> np.ndarray:
    n_lab, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    out = np.zeros_like(mask)
    for i in range(1, n_lab):
        area = int(stats[i, cv2.CC_STAT_AREA])
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        fill = area / max(bw * bh, 1)
        if area <= _SMALL_CC:
            continue
        if area <= _SKINNY_CC and fill < _SKINNY_FILL:
            continue
        out[labels == i] = 255
    return out


def remove_grid(
    mask: np.ndarray,
    geom: GridGeometry,
    close_distance: int = 10,
) -> np.ndarray:
    out = mask.copy()
    h, w = out.shape
    ink = (mask > 0).astype(np.float64)
    col = ink.sum(axis=0)
    row = ink.sum(axis=1)
    xs = _snap_lines(col, geom.start_x, geom.step_x, geom.count_x) if geom.count_x > 0 else []
    ys = _snap_lines(row, geom.start_y, geom.step_y, geom.count_y) if geom.count_y > 0 else []
    xs = [x for x in xs if 0 <= x < w]
    ys = [y for y in ys if 0 <= y < h]
    fills = [float((mask[:, x] > 0).mean()) for x in xs] + [
        float((mask[y, :] > 0).mean()) for y in ys
    ]
    lo, hi = _DASHED_FILL
    dashed = any(lo <= f <= hi for f in fills)
    if dashed:
        use_x = [x for x, f in zip(xs, fills[: len(xs)]) if lo <= f <= hi]
        use_y = [y for y, f in zip(ys, fills[len(xs) :]) if lo <= f <= hi]
        half = 0
    else:
        use_x, use_y = xs, ys
        half = _ERASE_HALF
    for x in use_x:
        out[:, max(0, x - half) : min(w, x + half + 1)] = 0
    for y in use_y:
        out[max(0, y - half) : min(h, y + half + 1), :] = 0
    for x in use_x:
        _heal_vertical(out, x, close_distance, half)
    for y in use_y:
        _heal_horizontal(out, y, close_distance, half)
    return _drop_dashed_specks(out)
