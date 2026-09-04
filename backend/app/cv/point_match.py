from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.cv.snap import snap_to_ink

__all__ = ["MatchCandidate", "match_points"]


@dataclass(frozen=True)
class MatchCandidate:
    pixel: tuple[float, float]
    score: float


def _as_mask(mask: np.ndarray) -> np.ndarray:
    if mask.ndim == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    out = mask.astype(np.uint8, copy=False)
    if out.max() == 1:
        out = (out * 255).astype(np.uint8)
    return out


def _odd_min3(patch: np.ndarray) -> np.ndarray:
    out = patch
    if out.shape[0] % 2 == 0:
        out = np.pad(out, ((0, 1), (0, 0)))
    if out.shape[1] % 2 == 0:
        out = np.pad(out, ((0, 0), (0, 1)))
    pad_y = max(0, 3 - out.shape[0])
    pad_x = max(0, 3 - out.shape[1])
    if pad_y or pad_x:
        out = np.pad(out, ((0, pad_y), (0, pad_x)))
        if out.shape[0] % 2 == 0:
            out = np.pad(out, ((0, 1), (0, 0)))
        if out.shape[1] % 2 == 0:
            out = np.pad(out, ((0, 0), (0, 1)))
    return out


def _label_at(
    labels: np.ndarray,
    pixel: tuple[float, float],
    search: int,
) -> int:
    h, w = labels.shape[:2]
    x, y = int(round(pixel[0])), int(round(pixel[1]))
    if 0 <= x < w and 0 <= y < h:
        lab = int(labels[y, x])
        if lab != 0:
            return lab
    half = max(int(search), 1)
    y0, y1 = max(0, y - half), min(h, y + half + 1)
    x0, x1 = max(0, x - half), min(w, x + half + 1)
    region = labels[y0:y1, x0:x1]
    ys, xs = np.where(region > 0)
    if xs.size == 0:
        return 0
    d2 = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
    j = int(np.argmin(d2))
    return int(region[ys[j], xs[j]])


def _blob_patch(
    labels: np.ndarray,
    stats: np.ndarray,
    label: int,
) -> np.ndarray | None:
    h, w = labels.shape[:2]
    bw = int(stats[label, cv2.CC_STAT_WIDTH])
    bh = int(stats[label, cv2.CC_STAT_HEIGHT])
    x0 = int(stats[label, cv2.CC_STAT_LEFT])
    y0 = int(stats[label, cv2.CC_STAT_TOP])
    x1, y1 = x0 + bw, y0 + bh
    patch = np.zeros((max(bh, 1), max(bw, 1)), dtype=np.uint8)
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x1, w), min(y1, h)
    blob = (labels == label).astype(np.uint8) * 255
    patch[sy0 - y0 : sy0 - y0 + (sy1 - sy0), sx0 - x0 : sx0 - x0 + (sx1 - sx0)] = blob[
        sy0:sy1, sx0:sx1
    ]
    if int(patch.max()) == 0:
        return None
    return _odd_min3(patch)


def _too_close(
    pixel: tuple[float, float],
    others: list[tuple[float, float]],
    radius: float,
) -> bool:
    px, py = pixel
    r2 = radius * radius
    for ox, oy in others:
        dx = px - ox
        dy = py - oy
        if dx * dx + dy * dy <= r2:
            return True
    return False


def match_points(
    mask: np.ndarray,
    sample_center: tuple[float, float],
    sample_radius: int,
    max_point_size: int = 48,
    exclude: list[tuple[float, float]] | None = None,
    limit: int = 200,
) -> list[MatchCandidate]:
    mask_u8 = _as_mask(mask)
    if mask_u8.size == 0 or int(limit) <= 0:
        return []
    h, w = mask_u8.shape[:2]
    binary = (mask_u8 > 0).astype(np.uint8)
    _n, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    sample_lab = _label_at(labels, sample_center, sample_radius)
    if sample_lab == 0:
        return []
    bw = int(stats[sample_lab, cv2.CC_STAT_WIDTH])
    bh = int(stats[sample_lab, cv2.CC_STAT_HEIGHT])
    if bw > max_point_size or bh > max_point_size:
        return []
    patch = _blob_patch(labels, stats, sample_lab)
    if patch is None:
        return []
    ph, pw = patch.shape[:2]
    if ph >= h or pw >= w:
        return []
    scores = cv2.matchTemplate(mask_u8, patch, cv2.TM_CCORR_NORMED)
    peak = float(np.nanmax(scores)) if scores.size else 0.0
    if not np.isfinite(peak) or peak < 0.45:
        return []
    threshold = max(0.55, 0.60 * peak)
    kernel = max(min(ph, pw) // 2, 3)
    if kernel % 2 == 0:
        kernel += 1
    dilated = cv2.dilate(scores, np.ones((kernel, kernel), dtype=np.uint8))
    maxima = (scores >= dilated) & (scores >= threshold) & np.isfinite(scores)
    ys, xs = np.where(maxima)
    raw: list[tuple[tuple[float, float], float]] = []
    half_x, half_y = pw / 2.0, ph / 2.0
    for y, x, score in zip(ys.tolist(), xs.tolist(), scores[ys, xs].tolist(), strict=True):
        # TM_CCORR_NORMED float32 noise can rank an identical copy above the sample.
        raw.append(((float(x) + half_x, float(y) + half_y), round(float(score), 6)))
    sx, sy = float(sample_center[0]), float(sample_center[1])
    raw.sort(key=lambda item: (-item[1], (item[0][0] - sx) ** 2 + (item[0][1] - sy) ** 2))
    exclusion_r = max(min(ph, pw) / 2.0, 3.0)
    blocked = list(exclude or [])
    accepted: list[MatchCandidate] = []
    seen: set[int] = set()
    side = max(ph, pw)
    window = min(7, max(3, side))
    if window % 2 == 0:
        window -= 1
    for pix, score in raw:
        clab = _label_at(labels, pix, max(int(sample_radius), 1))
        if clab == 0:
            guess = snap_to_ink(mask_u8, pix, window=window)
            clab = _label_at(labels, guess, max(int(sample_radius), 1))
        if clab == 0 or clab in seen:
            continue
        cbw = int(stats[clab, cv2.CC_STAT_WIDTH])
        cbh = int(stats[clab, cv2.CC_STAT_HEIGHT])
        if cbw > max_point_size or cbh > max_point_size:
            continue
        solo = np.where(labels == clab, mask_u8, 0)
        refined = snap_to_ink(solo, pix, window=window)
        # Merged markers exceed the specified 7px window; use the isolated CC centre.
        if max(cbw, cbh) > window:
            refined = (float(centroids[clab][0]), float(centroids[clab][1]))
        if _too_close(refined, blocked, exclusion_r):
            continue
        seen.add(clab)
        accepted.append(MatchCandidate(pixel=(float(refined[0]), float(refined[1])), score=score))
        blocked.append(accepted[-1].pixel)
        if len(accepted) >= int(limit):
            break
    return accepted
