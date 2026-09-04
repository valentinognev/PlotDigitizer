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
            resample_count=12,
        ),
        curves=[
            Curve(
                id="curve-1",
                label="A",
                color="#ff0000",
                points=[
                    Point(id="p1", pixel=(25.0, 75.0), origin="user"),
                    Point(id="p2", pixel=(75.0, 25.0), origin="user"),
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
    assert payload["workspace"]["resample_count"] == 12
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
    assert restored.workspace.resample_count == 12
    assert len(restored.curves) == 1
    assert restored.curves[0].label == "A"
    assert len(restored.curves[0].points) == 2
    assert restored.curves[0].points[0].pixel == (25.0, 75.0)
    assert restored.curves[0].connect_as == "line"


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
      "points": [{"x": 2.5, "y": 2.5, "origin": "user"}, {"x": 7.5, "y": 7.5, "origin": "user"}]
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


def test_project_roundtrip_precision_fields():
    session = _session_ready()
    session.calibration.coords_type = "polar"
    session.calibration.theta_units = "radians"
    session.calibration.origin_radius = 1.5
    session.calibration.scale_bar = None
    session.curves[0].connect_as = "scatter"
    if session.curves[0].filter is None:
        from app.models.schemas import ColorFilter

        session.curves[0].filter = ColorFilter(mode="intensity", low=0.1, high=0.4)
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "polar"
    assert restored.calibration.theta_units == "radians"
    assert restored.calibration.origin_radius == 1.5
    assert restored.curves[0].connect_as == "scatter"
    assert restored.curves[0].filter is not None
    assert restored.curves[0].filter.low == 0.1


def test_project_roundtrip_map_scale_bar():
    from app.models.schemas import ScaleBar

    session = _session_ready()
    session.calibration.coords_type = "map"
    session.calibration.scale_bar = ScaleBar(
        pixel_a=(0.0, 10.0), pixel_b=(10.0, 10.0), length=5.0, units="m"
    )
    dumped = export_json(session, image_bytes=TINY_PNG_BYTES)
    restored, _img = load_project_from_text(dumped)
    assert restored.calibration is not None
    assert restored.calibration.coords_type == "map"
    assert restored.calibration.scale_bar is not None
    assert restored.calibration.scale_bar.length == 5.0
    assert restored.calibration.scale_bar.units == "m"
