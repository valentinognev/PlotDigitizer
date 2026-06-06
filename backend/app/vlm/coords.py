from __future__ import annotations

from app.models.schemas import VLMResponse


def _collect_max(resp: VLMResponse) -> tuple[float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for tick in resp.axes.x.ticks:
        xs.append(tick.pixel[0])
        ys.append(tick.pixel[1])
    for tick in resp.axes.y.ticks:
        xs.append(tick.pixel[0])
        ys.append(tick.pixel[1])
    for curve in resp.curves:
        for x, y in curve.seed_points:
            xs.append(x)
            ys.append(y)
    return max(xs, default=0.0), max(ys, default=0.0)


def _scale_uniform(resp: VLMResponse, factor: float) -> None:
    for tick in resp.axes.x.ticks:
        tick.pixel = (tick.pixel[0] * factor, tick.pixel[1] * factor)
    for tick in resp.axes.y.ticks:
        tick.pixel = (tick.pixel[0] * factor, tick.pixel[1] * factor)
    for curve in resp.curves:
        curve.seed_points = [(x * factor, y * factor) for x, y in curve.seed_points]


def _scale_normalized(resp: VLMResponse, width: int, height: int) -> None:
    for tick in resp.axes.x.ticks:
        tick.pixel = (tick.pixel[0] * width, tick.pixel[1] * height)
    for tick in resp.axes.y.ticks:
        tick.pixel = (tick.pixel[0] * width, tick.pixel[1] * height)
    for curve in resp.curves:
        curve.seed_points = [(x * width, y * height) for x, y in curve.seed_points]


def _clamp(resp: VLMResponse, width: int, height: int) -> None:
    max_x = max(width - 1, 0)
    max_y = max(height - 1, 0)
    for tick in resp.axes.x.ticks:
        tick.pixel = (
            min(max(tick.pixel[0], 0.0), max_x),
            min(max(tick.pixel[1], 0.0), max_y),
        )
    for tick in resp.axes.y.ticks:
        tick.pixel = (
            min(max(tick.pixel[0], 0.0), max_x),
            min(max(tick.pixel[1], 0.0), max_y),
        )
    for curve in resp.curves:
        curve.seed_points = [
            (min(max(x, 0.0), max_x), min(max(y, 0.0), max_y)) for x, y in curve.seed_points
        ]


def adjust_vlm_coordinates(
    resp: VLMResponse, width: int, height: int, vlm_scale: float = 1.0
) -> VLMResponse:
    """Map VLM pixel coords to full-resolution image space and fix common mistakes."""
    if width <= 0 or height <= 0:
        return resp

    if vlm_scale not in (0.0, 1.0):
        _scale_uniform(resp, 1.0 / vlm_scale)

    max_x, max_y = _collect_max(resp)
    if max_x <= 1.0 and max_y <= 1.0:
        _scale_normalized(resp, width, height)
        max_x, max_y = _collect_max(resp)

    if max_x > width or max_y > height:
        sx = width / max_x if max_x > width else 1.0
        sy = height / max_y if max_y > height else 1.0
        _scale_uniform(resp, min(sx, sy))

    _clamp(resp, width, height)
    return resp
