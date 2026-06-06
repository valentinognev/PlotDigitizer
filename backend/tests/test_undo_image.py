import io

from PIL import Image, ImageDraw

from app.models.schemas import Curve, Point, Session
from app.pipeline.pipeline import run_remove_curve_from_plot
from app.store.session_store import session_store


def test_undo_restores_working_image_after_remove_from_plot():
    img = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(10, 70), (110, 10)], fill=(255, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    session = Session(
        image_meta={"width": 120, "height": 80, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#ff0000",
                points=[Point(pixel=(20.0, 60.0)), Point(pixel=(100.0, 20.0))],
            )
        ],
    )
    stored = session_store.create(session, image_bytes)
    before_remove = stored.image_bytes

    session_store.push_history(stored, "remove_from_plot")
    _, erased = run_remove_curve_from_plot(stored.session, stored.image_bytes, "c1")
    session_store.update_working_image(session.id, erased)
    assert stored.image_bytes != before_remove

    undone = session_store.undo(session.id)
    assert undone is not None
    restored = session_store.require(session.id)
    assert restored.image_bytes == before_remove
    assert restored.session.image_meta.revision == 0
