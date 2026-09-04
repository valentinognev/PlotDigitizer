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


_POLAR_CSV = """curve_id,curve_label,theta,R
c1,A,0.0,10.0
c1,A,90.0,10.0
"""

_MAP_CSV = """# units: km
curve_id,curve_label,x,y
c1,A,2.5,2.5
"""


def test_import_polar_csv_columns():
    import math

    from app.calibration.coords import data_to_pixel
    from app.models.schemas import AxisPoint

    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(180.0, 100.0), x_value=0.0, y_value=10.0),
            AxisPoint(pixel=(100.0, 20.0), x_value=90.0, y_value=10.0),
        ],
    )
    curves = import_curves_from_text(_POLAR_CSV, calibration=cal, filename="p.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 2
    exp0 = data_to_pixel(cal, (0.0, 10.0))
    exp1 = data_to_pixel(cal, (90.0, 10.0))
    p0, p1 = curves[0].points[0].pixel, curves[0].points[1].pixel
    assert math.hypot(p0[0] - exp0[0], p0[1] - exp0[1]) < 2.0
    assert math.hypot(p1[0] - exp1[0], p1[1] - exp1[1]) < 2.0


def test_import_map_csv_skips_units_comment():
    session = _session_ready()
    curves = import_curves_from_text(_MAP_CSV, calibration=session.calibration, filename="m.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 1


def test_import_legacy_xy_csv_still_works():
    session = _session_ready()
    curves = import_curves_from_text(_LEGACY_CSV, calibration=session.calibration, filename="plot.csv")
    assert len(curves) == 1
    assert len(curves[0].points) == 2
