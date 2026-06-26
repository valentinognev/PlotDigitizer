"""Rainbow display colors for curves; separate from VLM trace colors used by OpenCV."""

from __future__ import annotations

import colorsys

# φ⁻¹ — steps around the hue wheel so each index is far from recent ones.
_GOLDEN_RATIO_CONJUGATE = 0.618033988749895


def palette_hue(index: int) -> float:
    return (index * _GOLDEN_RATIO_CONJUGATE) % 1.0


def palette_color(index: int) -> str:
    hue = palette_hue(index)
    sat = 0.80 + (index % 3) * 0.05
    val = 0.90 + ((index // 3) % 2) * 0.06
    r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def rainbow_color(index: int, total: int = 1) -> str:
    """Return a display color for palette slot `index` (total is ignored; kept for API compat)."""
    _ = total
    return palette_color(index)


def rainbow_colors(count: int, *, reserved: set[str] | None = None) -> list[str]:
    """Assign one palette color per curve, skipping hues already reserved."""
    reserved_lower = {c.lower() for c in (reserved or set())}
    result: list[str] = []
    palette_idx = 0
    while len(result) < count:
        candidate = palette_color(palette_idx).lower()
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
