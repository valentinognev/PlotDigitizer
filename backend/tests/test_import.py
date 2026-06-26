import io

from fastapi.testclient import TestClient
from PIL import Image

from app.export.import_curves import import_curves_from_text
from app.main import app
from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, Session

client = TestClient(app)

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

_LEGACY_CSV = """curve_id,curve_label,x,y
c1,A,2.5,2.5
c1,A,7.5,7.5
"""


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
        image_meta={"width": 100, "height": 100, "scale_factor": 1.0},
        calibration=cal,
        curves=[
            Curve(
                label="A",
                color="#ff0000",
                points=[
                    Point(pixel=(25.0, 75.0), origin="user"),
                    Point(pixel=(75.0, 25.0), origin="ai"),
                ],
            )
        ],
    )


def test_import_json_roundtrip():
    session = _session_ready()
    curves = import_curves_from_text(
        _LEGACY_CURVES_JSON,
        calibration=session.calibration,
        filename="plot.json",
    )
    assert len(curves) == 1
    assert curves[0].label == "A"
    assert curves[0].color == "#ff0000"
    assert len(curves[0].points) == 2


def test_import_csv_roundtrip():
    session = _session_ready()
    curves = import_curves_from_text(_LEGACY_CSV, calibration=session.calibration, filename="plot.csv")
    assert len(curves) == 1
    assert curves[0].label == "A"
    assert len(curves[0].points) == 2


def test_import_endpoint_replaces_curves():
    buf = io.BytesIO()
    Image.new("RGB", (120, 80), "white").save(buf, format="PNG")
    res = client.post("/sessions", files={"file": ("plot.png", buf.getvalue(), "image/png")})
    session_id = res.json()["id"]

    cal = _session_ready().calibration
    assert cal is not None
    client.post(
        f"/sessions/{session_id}/calibration",
        json={"calibration": cal.model_dump()},
    )

    imp = client.post(
        f"/sessions/{session_id}/import-curves",
        files={"file": ("curves.json", _LEGACY_CURVES_JSON.encode(), "application/json")},
    )
    assert imp.status_code == 200
    body = imp.json()
    assert len(body["curves"]) == 1
    assert body["curves"][0]["label"] == "A"
    assert len(body["curves"][0]["points"]) == 2
