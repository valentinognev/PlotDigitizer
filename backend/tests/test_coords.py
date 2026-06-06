from app.models.schemas import VLMAxes, VLMAxis, VLMCurve, VLMResponse, VLMTick
from app.vlm.coords import adjust_vlm_coordinates


def test_scales_down_out_of_bounds_coords():
    resp = VLMResponse(
        axes=VLMAxes(
            x=VLMAxis(
                ticks=[
                    VLMTick(pixel=(130, 659), value=0),
                    VLMTick(pixel=(470, 659), value=4),
                ]
            ),
            y=VLMAxis(
                ticks=[
                    VLMTick(pixel=(130, 659), value=0),
                    VLMTick(pixel=(130, 100), value=4),
                ]
            ),
        ),
        curves=[
            VLMCurve(
                label="A",
                color_hex="#ff0000",
                seed_points=[(130, 659), (400, 640)],
            )
        ],
    )
    adjusted = adjust_vlm_coordinates(resp, 758, 547, 1.0)
    for tick in adjusted.axes.x.ticks + adjusted.axes.y.ticks:
        assert 0 <= tick.pixel[0] < 758
        assert 0 <= tick.pixel[1] < 547
    for x, y in adjusted.curves[0].seed_points:
        assert 0 <= x < 758
        assert 0 <= y < 547


def test_normalized_coords():
    resp = VLMResponse(
        axes=VLMAxes(
            x=VLMAxis(ticks=[VLMTick(pixel=(0.1, 0.9), value=0)]),
            y=VLMAxis(ticks=[VLMTick(pixel=(0.1, 0.1), value=1)]),
        ),
        curves=[VLMCurve(label="A", seed_points=[(0.5, 0.5)])],
    )
    adjusted = adjust_vlm_coordinates(resp, 200, 100, 1.0)
    assert adjusted.curves[0].seed_points[0] == (100.0, 50.0)


def test_vlm_resize_scale_factor():
    resp = VLMResponse(
        axes=VLMAxes(x=VLMAxis(ticks=[]), y=VLMAxis(ticks=[])),
        curves=[VLMCurve(label="A", seed_points=[(400.0, 300.0)])],
    )
    adjusted = adjust_vlm_coordinates(resp, 1600, 1200, 0.5)
    assert adjusted.curves[0].seed_points[0] == (800.0, 600.0)
