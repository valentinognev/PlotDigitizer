import io

from PIL import Image, ImageDraw

from app.cv.erase import remove_curve_from_image
from app.store.temp_images import save_removal_snapshot, working_image_path


def _lum(px: tuple[int, ...]) -> float:
    r, g, b = px[0], px[1], px[2]
    return r * 0.299 + g * 0.587 + b * 0.114


def test_remove_curve_erases_red_line():
    img = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 80), (180, 20)], fill=(255, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    before = buf.getvalue()

    hints = [(30.0, 70.0), (90.0, 50.0), (150.0, 30.0)]
    after = remove_curve_from_image(before, hints, "#ff0000")

    after_img = Image.open(io.BytesIO(after)).convert("RGB")
    mid = after_img.getpixel((90, 50))
    assert sum(mid) > 700


def test_remove_curve_does_not_damage_parallel_line():
    img = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 95), (180, 55)], fill=(90, 90, 90), width=2)
    draw.line([(20, 15), (180, 15)], fill=(90, 90, 90), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    hints = [(30.0, 88.0), (90.0, 72.0), (150.0, 60.0)]
    after = remove_curve_from_image(buf.getvalue(), hints, "#5a5a5a")

    after_img = Image.open(io.BytesIO(after)).convert("RGB")
    assert _lum(after_img.getpixel((90, 72))) > 220
    assert _lum(after_img.getpixel((90, 15))) < 120


def test_remove_curve_clears_gray_anti_alias_fringe():
    img = Image.new("RGB", (160, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(20, 60), (140, 20)], fill=(70, 70, 70), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    hints = [(40.0, 52.0), (100.0, 35.0)]
    after = remove_curve_from_image(buf.getvalue(), hints, "#464646")

    after_img = Image.open(io.BytesIO(after)).convert("RGB")
    for x in range(50, 110, 10):
        y = int(56 - (x - 40) * 0.3)
        assert _lum(after_img.getpixel((x, y))) > 210


def test_save_removal_snapshot_writes_temp_file(tmp_path, monkeypatch):
    from app.store import temp_images

    monkeypatch.setattr(temp_images, "TEMP_DIR", tmp_path)
    data = b"\x89PNG\r\n\x1a\n"
    path = save_removal_snapshot("sess-1", "curve-a", data)
    assert path.is_file()
    assert working_image_path("sess-1").parent == tmp_path / "sess-1"
