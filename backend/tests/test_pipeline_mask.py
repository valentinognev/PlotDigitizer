from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import ColorFilter, Curve, ImageMeta, Session


def _png_from_bgr(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_build_curve_mask_applies_filter_then_optional_grid():
    from app.pipeline.pipeline import build_curve_mask

    img = np.full((40, 60, 3), 255, dtype=np.uint8)
    img[20, :, :] = (0, 0, 0)
    img[:, 30, :] = (0, 0, 0)
    session = Session(
        image_meta=ImageMeta(width=60, height=40),
        curves=[
            Curve(
                id="c1",
                label="c",
                filter=ColorFilter(mode="intensity", low=0.0, high=0.3, remove_grid=False),
            )
        ],
    )
    mask = build_curve_mask(session, _png_from_bgr(img), "c1")
    assert mask.shape == (40, 60)
    assert mask[20, 10] == 255
    assert mask[20, 30] == 255

    session.curves[0].filter = ColorFilter(
        mode="intensity", low=0.0, high=0.3, remove_grid=True
    )
    from app.models.schemas import GridGeometrySettings, WorkspaceState

    session.workspace = WorkspaceState(
        grid=GridGeometrySettings(start_x=30.0, step_x=0.0, count_x=1, close_distance=10)
    )
    cleared = build_curve_mask(session, _png_from_bgr(img), "c1")
    assert cleared[5, 30] == 0
    assert cleared[20, 10] == 255


def test_build_curve_mask_unknown_curve_raises():
    from app.pipeline.pipeline import build_curve_mask

    session = Session(image_meta=ImageMeta(width=8, height=8), curves=[])
    png = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(png, format="PNG")
    try:
        build_curve_mask(session, png.getvalue(), "missing")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "missing" in str(exc)
