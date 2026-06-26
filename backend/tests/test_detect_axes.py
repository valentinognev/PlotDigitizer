from app.models.schemas import Curve, Point, Session, VLMResponse, VLMAxes, VLMAxis, VLMTick
from app.pipeline.pipeline import merge


def _axes_only_vlm() -> VLMResponse:
    return VLMResponse(
        axes=VLMAxes(
            x=VLMAxis(
                scale="linear",
                ticks=[
                    VLMTick(pixel=(10.0, 90.0), value=0.0),
                    VLMTick(pixel=(110.0, 90.0), value=10.0),
                ],
            ),
            y=VLMAxis(
                scale="linear",
                ticks=[
                    VLMTick(pixel=(10.0, 90.0), value=0.0),
                    VLMTick(pixel=(10.0, 10.0), value=1.0),
                ],
            ),
        ),
        curves=[],
    )


def test_detect_axes_keeps_existing_curves():
    session = Session(
        image_meta={"width": 120, "height": 100, "scale_factor": 1.0},
        curves=[
            Curve(
                label="A",
                color="#ff0000",
                points=[Point(pixel=(30.0, 70.0), origin="user")],
            )
        ],
    )
    merged = merge(session, _axes_only_vlm(), "detect", protect_user=False)
    assert len(merged.curves) == 1
    assert merged.curves[0].label == "A"
    assert len(merged.curves[0].points) == 1
    assert merged.calibration is not None
