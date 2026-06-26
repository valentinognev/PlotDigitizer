from app.pipeline.colors import (
    is_grayscale_hex,
    palette_color,
    palette_hue,
    rainbow_color,
    rainbow_colors,
)


def _circular_hue_distance(a: float, b: float) -> float:
    d = abs(a - b)
    return min(d, 1.0 - d)


def test_rainbow_colors_are_distinct():
    colors = rainbow_colors(9)
    assert len(colors) == 9
    assert len(set(colors)) == 9
    assert all(not is_grayscale_hex(c) for c in colors)


def test_palette_uses_golden_ratio_hue_shift():
    assert palette_hue(0) == 0.0
    assert abs(palette_hue(1) - _GOLDEN_RATIO_CONJUGATE) < 1e-9
    assert rainbow_color(0, 9) == palette_color(0)
    assert rainbow_color(5, 12) == palette_color(5)


def test_twelve_colors_are_well_spread():
    colors = rainbow_colors(12)
    assert len(set(colors)) == 12
    # Golden-ratio hue shift: each slot is far from the previous few on the wheel.
    for i in range(1, 12):
        for j in range(max(0, i - 4), i):
            dist = _circular_hue_distance(palette_hue(i), palette_hue(j))
            assert dist >= 0.14, f"indices {i} and {j} too close ({dist:.3f})"


def test_detects_grayscale():
    assert is_grayscale_hex("#808080")
    assert is_grayscale_hex("#333333")
    assert not is_grayscale_hex("#ff0000")


def test_avoids_reserved_rainbow_colors():
    first = palette_color(0)
    colors = rainbow_colors(2, reserved={first})
    assert len(set(colors)) == 2
    assert first.lower() not in {c.lower() for c in colors}


_GOLDEN_RATIO_CONJUGATE = 0.618033988749895
