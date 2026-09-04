from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Literal

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.calibration.calibration import pixel_to_data  # noqa: E402
from app.models.schemas import Calibration, CalibrationAxis, RefPoint  # noqa: E402

Scale = Literal["linear", "log"]

DEFAULT_OUT = REPO / "frontend" / "src" / "lib" / "__fixtures__" / "transform-vectors.json"


def _cal(
    x_scale: Scale,
    y_scale: Scale,
    x_vals: tuple[float, float],
    y_vals: tuple[float, float],
) -> Calibration:
    return Calibration(
        x=CalibrationAxis(
            scale=x_scale,
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=x_vals[0]),
                RefPoint(pixel=(500.0, 400.0), value=x_vals[1]),
            ],
        ),
        y=CalibrationAxis(
            scale=y_scale,
            ref_points=[
                RefPoint(pixel=(100.0, 400.0), value=y_vals[0]),
                RefPoint(pixel=(100.0, 100.0), value=y_vals[1]),
            ],
        ),
        source="manual",
    )


def _dump_cal(cal: Calibration) -> dict:
    return {
        "x": {
            "scale": cal.x.scale,
            "ref_points": [{"pixel": list(p.pixel), "value": p.value} for p in cal.x.ref_points],
        },
        "y": {
            "scale": cal.y.scale,
            "ref_points": [{"pixel": list(p.pixel), "value": p.value} for p in cal.y.ref_points],
        },
        "source": cal.source,
    }


def build_vectors() -> dict:
    pixels = [(100.0, 400.0), (300.0, 250.0), (500.0, 100.0), (220.0, 310.0), (480.0, 180.0)]
    specs = [
        ("linear_orthogonal", "linear", "linear", (0.0, 10.0), (0.0, 5.0)),
        ("log_x_linear_y", "log", "linear", (1.0, 100.0), (0.0, 5.0)),
        ("linear_x_log_y", "linear", "log", (0.0, 10.0), (1.0, 100.0)),
        ("log_log", "log", "log", (1.0, 1000.0), (0.1, 10.0)),
    ]
    cases = []
    for name, x_scale, y_scale, x_vals, y_vals in specs:
        cal = _cal(x_scale, y_scale, x_vals, y_vals)
        samples = []
        for pixel in pixels:
            data = pixel_to_data(cal, pixel)
            samples.append({"pixel": [pixel[0], pixel[1]], "data": [data[0], data[1]]})
        cases.append({"name": name, "calibration": _dump_cal(cal), "samples": samples})
    return {
        "generated_by": "backend/tests/synth/gen_transform_vectors.py",
        "tolerance": 1e-9,
        "note": (
            "Synthetic orthogonal (independent 1D) mapping only. "
            "Phase 1 extends this fixture with affine/projective/polar vectors. "
            "Never derived from PLOTDIG_REF_DIR."
        ),
        "cases": cases,
    }


def write_vectors(path: Path | None = None) -> Path:
    out = Path(path) if path is not None else DEFAULT_OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = build_vectors()
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    written = write_vectors()
    print(f"wrote {written}")
