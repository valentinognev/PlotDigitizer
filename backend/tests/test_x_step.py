from __future__ import annotations

import pytest

from app.calibration.coords import pixel_to_data
from app.cv.x_step import sample_by_x_step
from app.models.schemas import Calibration, CalibrationAxis, RefPoint


def _linear_four_bound() -> Calibration:
    return Calibration(
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


def test_horizontal_polyline_samples_even_data_x():
    cal = _linear_four_bound()
    pts = sample_by_x_step(
        [(0.0, 50.0), (100.0, 50.0)],
        cal,
        xmin=0.0,
        xmax=10.0,
        delx=2.5,
    )
    assert len(pts) == 5
    data = [pixel_to_data(cal, p) for p in pts]
    assert [x for x, _ in data] == pytest.approx([0.0, 2.5, 5.0, 7.5, 10.0])
    assert [y for _, y in data] == pytest.approx([5.0, 5.0, 5.0, 5.0, 5.0])
    assert [px for px, _ in pts] == pytest.approx([0.0, 25.0, 50.0, 75.0, 100.0])
    assert [py for _, py in pts] == pytest.approx([50.0, 50.0, 50.0, 50.0, 50.0])


def test_skips_samples_outside_polyline_x_span():
    cal = _linear_four_bound()
    pts = sample_by_x_step(
        [(25.0, 50.0), (75.0, 50.0)],
        cal,
        xmin=0.0,
        xmax=10.0,
        delx=2.5,
    )
    data = [pixel_to_data(cal, p) for p in pts]
    assert [x for x, _ in data] == pytest.approx([2.5, 5.0, 7.5])
    assert [y for _, y in data] == pytest.approx([5.0, 5.0, 5.0])
