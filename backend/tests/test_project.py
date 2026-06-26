import base64
import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from app.export.export import export_json
from app.export.import_curves import ImportError as CurveImportError
from app.export.import_curves import import_curves_from_text
from app.export.project_io import is_project_payload, load_project_from_text
from app.main import app
from app.models.schemas import (
    Calibration,
    CalibrationAxis,
    Curve,
    ImageSource,
    Point,
    RefPoint,
    Session,
    WorkspaceState,
)

client = TestClient(app)

_TINY_PNG = io.BytesIO()
Image.new("RGB", (4, 4), "white").save(_TINY_PNG, format="PNG")
TINY_PNG_BYTES = _TINY_PNG.getvalue()


def _session_ready() -> Session:
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=0.0),
                RefPoint(pixel=(100.0, 0.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 100.0), value=0.0),
                RefPoint(pixel=(0.0, 0.0), value=10.0),
            ],
        ),
    )
    return Session(
        image_meta={"width": 100, "height": 100, "scale_factor": 1.0, "revision": 2},
        image_source=ImageSource(filename="plot.png", path="/data/plot.png"),
        calibration=cal,
        manual_calibration=True,
        workspace=WorkspaceState(
            active_curve_id="curve-1",
            text_hint="hint",
            resample_count=12,
            use_ai_mode=False,
        ),
        curves=[
            Curve(
                id="curve-1",
                label="A",
                color="#ff0000",
                points=[
                    Point(id="p1", pixel=(25.0, 75.0), origin="user"),
                    Point(id="p2", pixel=(75.0, 25.0), origin="ai"),
                ],
            )
        ],
    )


def test_export_json_is_project_format():
    session = _session_ready()
    exported = export_json(session, image_bytes=TINY_PNG_BYTES)
    payload = json.loads(exported)
    assert is_project_payload(payload)
    assert payload["image_source"]["filename"] == "plot.png"
    assert payload["image_source"]["path"] == "/data/plot.png"
    assert payload["manual_calibration"] is True
    assert payload["workspace"]["text_hint"] == "hint"
    assert payload["curves"][0]["points"][0]["pixel"] == [25.0, 75.0]
    assert "data" in payload["curves"][0]["points"][0]
    assert base64.b64decode(payload["image"]["data"]) == TINY_PNG_BYTES


def test_project_roundtrip():
    session = _session_ready()
    exported = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, image_bytes = load_project_from_text(exported)
    assert image_bytes == TINY_PNG_BYTES
    assert restored.image_source is not None
    assert restored.image_source.filename == "plot.png"
    assert restored.manual_calibration is True
    assert restored.workspace is not None
    assert restored.workspace.text_hint == "hint"
    assert len(restored.curves) == 1
    assert restored.curves[0].label == "A"
    assert len(restored.curves[0].points) == 2
    assert restored.curves[0].points[0].pixel == (25.0, 75.0)


def test_import_curves_rejects_project_file():
    session = _session_ready()
    exported = export_json(session, image_bytes=TINY_PNG_BYTES)
    try:
        import_curves_from_text(exported, calibration=session.calibration, filename="plot.pdproj.json")
    except CurveImportError as exc:
        assert "Open project" in str(exc)
    else:
        raise AssertionError("expected CurveImportError")


def test_load_project_endpoint():
    session = _session_ready()
    exported = export_json(session, image_bytes=TINY_PNG_BYTES)
    res = client.post(
        "/sessions/load-project",
        files={"file": ("demo.pdproj.json", exported.encode(), "application/json")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["image_source"]["filename"] == "plot.png"
    assert body["manual_calibration"] is True
    assert body["workspace"]["resample_count"] == 12
    assert len(body["curves"]) == 1
    assert len(body["curves"][0]["points"]) == 2

    img = client.get(body["image_url"])
    assert img.status_code == 200
    assert img.content == TINY_PNG_BYTES


_LEGACY_CURVES_JSON = """
{
  "session_id": "legacy",
  "calibration": {
    "x": {"scale": "linear", "ref_points": [{"pixel": [0, 0], "value": 0}, {"pixel": [100, 0], "value": 10}]},
    "y": {"scale": "linear", "ref_points": [{"pixel": [0, 100], "value": 0}, {"pixel": [0, 0], "value": 10}]},
    "source": "manual"
  },
  "curves": [
    {
      "id": "c1",
      "label": "A",
      "color": "#ff0000",
      "style": "unknown",
      "points": [{"x": 2.5, "y": 2.5, "origin": "user"}, {"x": 7.5, "y": 7.5, "origin": "ai"}]
    }
  ]
}
"""


def test_legacy_curve_json_import_still_works():
    session = _session_ready()
    curves = import_curves_from_text(
        _LEGACY_CURVES_JSON,
        calibration=session.calibration,
        filename="curves.json",
    )
    assert len(curves) == 1
    assert curves[0].label == "A"
    assert len(curves[0].points) == 2
