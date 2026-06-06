import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.models.schemas import Curve, Point, Session
from app.pipeline.pipeline import run_improve_from_hints
from app.vlm.base import build_improve_from_hints_prompt

client = TestClient(app)


def test_improve_prompt_includes_hint_points():
    curve = Curve(
        label="Series A",
        color="#ff0000",
        trace_color="#333333",
        style="solid",
        target_point_count=24,
    )
    prompt = build_improve_from_hints_prompt(800, 600, curve, [(10.0, 20.0), (30.0, 40.0)])
    assert "Series A" in prompt
    assert "#333333" in prompt
    assert "[10.0, 20.0]" in prompt
    assert "[30.0, 40.0]" in prompt
    assert "24" in prompt


class _FakeProvider:
    def __init__(self) -> None:
        self.kwargs: dict | None = None

    def refine(self, image, **kwargs):
        self.kwargs = kwargs
        from app.models.schemas import VLMResponse, VLMAxes, VLMAxis, VLMCurve

        return VLMResponse(
            axes=VLMAxes(x=VLMAxis(), y=VLMAxis()),
            curves=[VLMCurve(label="A", color_hex="#111111", seed_points=[(1.0, 2.0)])],
        )


def test_run_improve_from_hints_passes_scaled_hints_to_provider():
    session = Session(
        id="test-session",
        image_meta={"width": 2000, "height": 1600, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#ff0000",
                trace_color="#111111",
                points=[
                    Point(pixel=(100.0, 200.0), origin="user"),
                    Point(pixel=(300.0, 400.0), origin="ai"),
                ],
            )
        ],
    )
    from app.store.session_store import session_store

    buf = io.BytesIO()
    Image.new("RGB", (2000, 1600), "white").save(buf, format="PNG")
    image_bytes = buf.getvalue()
    session_store.create(session, image_bytes)

    provider = _FakeProvider()
    session.curves[0].target_point_count = 6
    result = run_improve_from_hints(provider, session, image_bytes, "c1")
    assert provider.kwargs is not None
    hints = provider.kwargs["hint_points"]
    assert hints[0][0] < 100.0
    assert provider.kwargs["hint_curve"].label == "A"
    assert len(result.curves[0].points) == 6


class _DenseFakeProvider:
    def refine(self, image, **kwargs):
        from app.models.schemas import VLMResponse, VLMAxes, VLMAxis, VLMCurve

        seeds = [(float(i), float(i)) for i in range(50)]
        return VLMResponse(
            axes=VLMAxes(x=VLMAxis(), y=VLMAxis()),
            curves=[VLMCurve(label="A", color_hex="#111111", seed_points=seeds)],
        )


def test_ai_improve_replaces_instead_of_accumulating():
    session = Session(
        id="dense-session",
        image_meta={"width": 400, "height": 300, "scale_factor": 1.0},
        curves=[
            Curve(
                id="c1",
                label="A",
                color="#ff0000",
                trace_color="#111111",
                target_point_count=5,
                points=[
                    Point(pixel=(10.0, 10.0), origin="user"),
                    Point(pixel=(20.0, 20.0), origin="ai"),
                    Point(pixel=(30.0, 30.0), origin="ai"),
                ],
            )
        ],
    )
    from app.store.session_store import session_store

    buf = io.BytesIO()
    Image.new("RGB", (400, 300), "white").save(buf, format="PNG")
    image_bytes = buf.getvalue()
    session_store.create(session, image_bytes)

    result = run_improve_from_hints(_DenseFakeProvider(), session, image_bytes, "c1")
    assert len(result.curves[0].points) == 5


def test_improve_endpoint_requires_two_points():
    buf = io.BytesIO()
    Image.new("RGB", (120, 80), "white").save(buf, format="PNG")
    data = buf.getvalue()
    res = client.post("/sessions", files={"file": ("plot.png", data, "image/png")})
    session_id = res.json()["id"]
    curve_id = res.json()["curves"][0]["id"] if res.json().get("curves") else "missing"

    if curve_id == "missing":
        from app.store.session_store import session_store

        stored = session_store.require(session_id)
        stored.session.curves = [
            Curve(id="c1", label="solo", points=[Point(pixel=(1.0, 2.0))])
        ]
        session_store.update(session_id, stored.session)
        curve_id = "c1"

    improve = client.post(f"/sessions/{session_id}/curves/{curve_id}/improve")
    assert improve.status_code == 400
