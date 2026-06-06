"""Rainbow display colors for curves; separate from VLM trace colors used by OpenCV."""

from __future__ import annotations

import colorsys


def rainbow_color(index: int, total: int) -> str:
    """Return a saturated rainbow hex color for curve `index` out of `total`."""
    n = max(total, 1)
    hue = (index / n) % 1.0
    r, g, b = colorsys.hsv_to_rgb(hue, 0.85, 0.95)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def rainbow_colors(count: int, *, reserved: set[str] | None = None) -> list[str]:
    """Assign one rainbow color per curve, skipping hues already reserved."""
    reserved_lower = {c.lower() for c in (reserved or set())}
    result: list[str] = []
    palette_idx = 0
    while len(result) < count:
        candidate = rainbow_color(palette_idx, max(count, palette_idx + 1)).lower()
        palette_idx += 1
        if candidate not in reserved_lower:
            result.append(candidate)
    return result


def is_grayscale_hex(color_hex: str) -> bool:
    color_hex = color_hex.lstrip("#")
    if len(color_hex) != 6:
        return False
    r = int(color_hex[0:2], 16)
    g = int(color_hex[2:4], 16)
    b = int(color_hex[4:6], 16)
    return max(r, g, b) - min(r, g, b) < 30
