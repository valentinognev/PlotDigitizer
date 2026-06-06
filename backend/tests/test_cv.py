import io

import numpy as np
from PIL import Image, ImageDraw

from app.cv.trace import trace_curve_path


def _red_line_image() -> bytes:
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 80), (190, 20)], fill=(255, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_trace_finds_red_curve():
    data = _red_line_image()
    path = trace_curve_path(data, "#ff0000")
    assert len(path) > 5
    xs = [p[0] for p in path]
    assert min(xs) < 30
    assert max(xs) > 170
