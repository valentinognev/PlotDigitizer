from app.pipeline.colors import is_grayscale_hex, rainbow_color, rainbow_colors


def test_rainbow_colors_are_distinct():
    colors = rainbow_colors(9)
    assert len(colors) == 9
    assert len(set(colors)) == 9
    assert all(not is_grayscale_hex(c) for c in colors)


def test_rainbow_wraps_hue():
    a = rainbow_color(0, 9)
    b = rainbow_color(9, 9)
    assert a == b


def test_detects_grayscale():
    assert is_grayscale_hex("#808080")
    assert is_grayscale_hex("#333333")
    assert not is_grayscale_hex("#ff0000")


def test_avoids_reserved_rainbow_colors():
    first = rainbow_color(0, 2)
    colors = rainbow_colors(2, reserved={first})
    assert len(set(colors)) == 2
    assert first.lower() not in {c.lower() for c in colors}
