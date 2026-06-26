import io

from PIL import Image, ImageDraw

from app.cv.improve import improve_curve_from_hints
from app.cv.resample import resample_path
from app.models.schemas import Curve, Point, Session
from app.pipeline.pipeline import run_cv_improve


def test_resample_path_exact_count():
    path = [(0.0, 0.0), (100.0, 0.0)]
    points = resample_path(path, 10)
    assert len(points) == 10


def test_cv_improve_finds_red_line_in_corridor():
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 80), (180, 20)], fill=(255, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    hints = [(30.0, 70.0), (90.0, 50.0), (150.0, 30.0)]
    points = improve_curve_from_hints(image_bytes, "#ff0000", hints, target_count=12)
    assert len(points) == 12
    ys = [p.pixel[1] for p in points]
    assert max(ys) - min(ys) > 10


def test_cv_improve_with_rainbow_display_color_samples_line():
    """Grayscale line + rainbow display color: sample pixels at hints, not rainbow."""
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 80), (180, 20)], fill=(90, 90, 90), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    hints = [(30.0, 70.0), (90.0, 50.0), (150.0, 30.0)]
    points = improve_curve_from_hints(image_bytes, "#3cb44b", hints, target_count=12)
    assert len(points) == 12
    # Should follow gray line, not random edges
    mid = points[len(points) // 2].pixel
    assert 20 < mid[1] < 80


def test_cv_improve_vertical_segment_snaps_along_hints():
    """Curve with stacked x values: snap along polyline, not x-buckets."""
    img = Image.new("RGB", (700, 500), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(500, 450), (500, 280), (620, 300)], fill=(90, 90, 90), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    hints = [(501.0, 440.0), (502.0, 350.0), (501.0, 290.0), (610.0, 305.0)]
    points = improve_curve_from_hints(image_bytes, "#ee2bad", hints, target_count=10)
    assert len(points) == 10
    px = [p.pixel[0] for p in points]
    assert min(px) > 490
    assert max(p.pixel[1] for p in points) - min(p.pixel[1] for p in points) > 50


def test_cv_improve_reorders_scrambled_hints_before_tracing():
    img = Image.new("RGB", (700, 500), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(120, 480), (240, 420), (390, 380), (430, 200), (490, 410), (680, 440)], fill=(90, 90, 90), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    ordered_hints = [
        (120.0, 480.0),
        (240.0, 420.0),
        (390.0, 380.0),
        (430.0, 200.0),
        (490.0, 410.0),
        (680.0, 440.0),
    ]
    scrambled = list(reversed(ordered_hints))
    scrambled[1], scrambled[4] = scrambled[4], scrambled[1]

    points = improve_curve_from_hints(image_bytes, "#ee2bad", scrambled, target_count=12)
    ys = [p.pixel[1] for p in points]
    assert ys[0] > ys[len(ys) // 2]
    assert points[-1].pixel[0] > points[0].pixel[0]
    assert _path_length([p.pixel for p in points]) < 900.0


def _path_length(path: list[tuple[float, float]]) -> float:
    import math

    return sum(
        math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])
        for i in range(len(path) - 1)
    )


def test_run_cv_improve_replaces_old_points():
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 80), (180, 20)], fill=(255, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    session = Session(
        image_meta={"width": 200, "height": 100, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#ff0000",
                trace_color="#ff0000",
                target_point_count=8,
                points=[
                    Point(pixel=(30.0, 70.0), origin="ai"),
                    Point(pixel=(150.0, 30.0), origin="user"),
                    Point(pixel=(40.0, 65.0), origin="ai"),
                    Point(pixel=(50.0, 60.0), origin="ai"),
                ],
            )
        ],
    )
    result = run_cv_improve(session, image_bytes, "c1")
    assert len(result.curves[0].points) == 8
