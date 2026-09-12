from __future__ import annotations

from app.calibration.coords import data_to_pixel, pixel_to_data
from app.models.schemas import Calibration

_EPS = 1e-12


def sample_by_x_step(
    pixels: list[tuple[float, float]],
    cal: Calibration,
    xmin: float,
    xmax: float,
    delx: float,
) -> list[tuple[float, float]]:
    if len(pixels) < 2 or delx <= 0 or xmin > xmax:
        return []

    data = sorted((pixel_to_data(cal, p) for p in pixels), key=lambda xy: xy[0])
    xs = [x for x, _ in data]
    ys = [y for _, y in data]
    span_lo, span_hi = xs[0], xs[-1]
    if span_hi - span_lo < _EPS:
        return []

    samples: list[tuple[float, float]] = []
    n = 0
    while True:
        x = xmin + n * delx
        if x > xmax + _EPS:
            break
        if span_lo - _EPS <= x <= span_hi + _EPS:
            y = _interp_y(xs, ys, x)
            samples.append(data_to_pixel(cal, (x, y)))
        n += 1
    return samples


def _interp_y(xs: list[float], ys: list[float], x: float) -> float:
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(1, len(xs)):
        x0, x1 = xs[i - 1], xs[i]
        if x <= x1 or i == len(xs) - 1:
            dx = x1 - x0
            if abs(dx) < _EPS:
                return ys[i]
            t = (x - x0) / dx
            return ys[i - 1] + t * (ys[i] - ys[i - 1])
    return ys[-1]
