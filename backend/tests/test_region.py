import numpy as np
from app.cv.region import rasterize_region
from app.models.schemas import RegionBox, RegionMask


def test_empty_region_is_full_white():
    m = rasterize_region(10, 8, None)
    assert m.shape == (8, 10)
    assert m.dtype == np.uint8
    assert int(m.min()) == 255


def test_box_keeps_only_the_rectangle():
    region = RegionMask(boxes=[RegionBox(x=2, y=1, w=3, h=2)])
    m = rasterize_region(10, 8, region)
    assert m[1, 2] == 255
    assert m[1, 4] == 255
    assert m[2, 2] == 255
    assert m[0, 2] == 0
    assert m[1, 1] == 0


def test_stroke_then_erase():
    region = RegionMask(
        strokes=[[(5.0, 4.0), (7.0, 4.0)]],
        erase_strokes=[[(7.0, 4.0)]],
        stroke_width=4.0,
    )
    m = rasterize_region(12, 10, region)
    assert m[4, 5] == 255
    assert m[4, 7] == 0
