from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.calibration.coords import pixel_to_data  # noqa: E402
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    RefPoint,
    ScaleBar,
)

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "frontend" / "src" / "lib" / "__fixtures__" / "transform-vectors.json"


def _dump_cal(cal: Calibration) -> dict:
    payload = cal.model_dump()
    return payload


def _case(name: str, cal: Calibration, pixel: tuple[float, float]) -> dict:
    data = pixel_to_data(cal, pixel)
    return {
        "name": name,
        "pixel": [float(pixel[0]), float(pixel[1])],
        "data": [float(data[0]), float(data[1])],
        "calibration": _dump_cal(cal),
    }


def main() -> None:
    cases: list[dict] = []
    ortho = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(500.0, 400.0), value=10.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=0.0),
                RefPoint(pixel=(100.0, 100.0), value=5.0),
            ],
        ),
    )
    cases.append(_case("orthogonal_linear_linear", ortho, (300.0, 250.0)))
    loglog = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(20.0, 480.0), value=1.0),
                RefPoint(pixel=(620.0, 480.0), value=1000.0),
            ],
        ),
        y=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(20.0, 480.0), value=0.01),
                RefPoint(pixel=(20.0, 30.0), value=10.0),
            ],
        ),
    )
    cases.append(_case("orthogonal_log_log", loglog, (120.0, 240.0)))
    affine = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        model="affine",
        axis_points=[
            AxisPoint(pixel=(10.0, 20.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(80.0, 15.0), x_value=3.0, y_value=0.4),
            AxisPoint(pixel=(30.0, 90.0), x_value=1.2, y_value=4.1),
        ],
    )
    cases.append(_case("affine_three_point", affine, (45.0, 40.0)))
    proj = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        model="projective",
        axis_points=[
            AxisPoint(pixel=(0.0, 0.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(200.0, 10.0), x_value=10.0, y_value=0.2),
            AxisPoint(pixel=(15.0, 180.0), x_value=0.4, y_value=9.0),
            AxisPoint(pixel=(190.0, 170.0), x_value=9.5, y_value=8.4),
        ],
    )
    cases.append(_case("projective_four_point", proj, (90.0, 80.0)))
    polar = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        model="affine",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(200.0, 200.0), x_value=0.0, y_value=0.0),
            AxisPoint(pixel=(280.0, 200.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(200.0, 120.0), x_value=90.0, y_value=2.0),
        ],
    )
    cases.append(_case("polar_degrees", polar, (240.0, 160.0)))
    mapping = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="map",
        scale_bar=ScaleBar(pixel_a=(10.0, 50.0), pixel_b=(110.0, 50.0), length=50.0, units="m"),
    )
    cases.append(_case("map_horizontal", mapping, (60.0, 10.0)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases}, indent=2) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
