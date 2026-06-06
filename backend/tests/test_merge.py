from app.models.schemas import Curve, Point, Session, VLMResponse, VLMAxes, VLMAxis, VLMCurve
from app.pipeline.pipeline import merge


def _session_with_user_point() -> Session:
    return Session(
        image_meta={"width": 600, "height": 400, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#ff0000",
                points=[
                    Point(id="u1", pixel=(10.0, 10.0), origin="user"),
                    Point(id="a1", pixel=(20.0, 20.0), origin="ai"),
                ],
            )
        ],
    )


def test_refine_protects_user_points():
    session = _session_with_user_point()
    vlm = VLMResponse(
        axes=VLMAxes(x=VLMAxis(), y=VLMAxis()),
        curves=[
            VLMCurve(
                label="A",
                color_hex="#ff0000",
                seed_points=[(30.0, 30.0), (40.0, 40.0)],
            )
        ],
    )
    # merge without image won't refine CV - test merge logic via direct curve replacement path
    from app.pipeline.pipeline import _merge_curve_points

    incoming = Curve(
        id="c1",
        label="A",
        color="#ff0000",
        points=[
            Point(pixel=(30.0, 30.0), origin="ai"),
            Point(pixel=(40.0, 40.0), origin="ai"),
        ],
    )
    existing = session.curves[0]
    merged = _merge_curve_points(existing, incoming, protect_user=True)
    origins = {p.origin for p in merged.points}
    assert "user" in origins
    user_ids = [p.id for p in merged.points if p.origin == "user"]
    assert "u1" in user_ids
