import io

from PIL import Image, ImageDraw

from app.models.schemas import Curve, Point
from app.pipeline.pipeline import _ensure_curve_point_count
from app.vlm.base import build_detect_prompt


def test_detect_prompt_axes_only():
    prompt = build_detect_prompt(800, 600)
    assert "Do NOT detect curves" in prompt
    assert "seed_points" not in prompt
    assert '"curves": []' in prompt


def test_ensure_curve_point_count_resamples_to_nine():
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 80), (180, 20)], fill=(255, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    curve = Curve(
        label="A",
        color="#ff0000",
        trace_color="#ff0000",
        points=[
            Point(pixel=(30.0, 70.0), origin="ai"),
            Point(pixel=(150.0, 30.0), origin="ai"),
        ],
    )
    points = _ensure_curve_point_count(image_bytes, curve, 9)
    assert len(points) == 9


def test_curve_default_target_point_count_is_nine():
    curve = Curve(label="A", color="#ff0000")
    assert curve.target_point_count == 9
