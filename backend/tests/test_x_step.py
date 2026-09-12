from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.calibration.coords import pixel_to_data
from app.cv.x_step import sample_by_x_step
from app.models.schemas import Calibration, CalibrationAxis, Curve, Point, RefPoint, Session, XStepRequest
from app.pipeline.pipeline import run_x_step


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


def _cal_x_span(cal_id: str, x_max: float) -> Calibration:
    return Calibration(
        id=cal_id,
        name=cal_id,
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=0.0),
                RefPoint(pixel=(100.0, 0.0), value=x_max),
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


def test_x_step_uses_bound_calibration_not_session_singleton():
    left = _cal_x_span("cal-left", 10.0)
    right = _cal_x_span("cal-right", 20.0)
    curve = Curve(
        id="c1",
        label="A",
        calibration_id="cal-right",
        points=[
            Point(pixel=(0.0, 50.0), origin="user"),
            Point(pixel=(100.0, 50.0), origin="user"),
        ],
    )
    session = Session(
        image_meta={"width": 100, "height": 100, "scale_factor": 1.0},
        calibration=left,
        calibrations=[left, right],
        curves=[curve],
    )
    session = run_x_step(session, "c1", xmin=0.0, xmax=20.0, delx=5.0)
    pts = [tuple(p.pixel) for p in session.curves[0].points]
    assert [px for px, _ in pts] == pytest.approx([0.0, 25.0, 50.0, 75.0, 100.0])
    data = [pixel_to_data(right, p) for p in pts]
    assert [x for x, _ in data] == pytest.approx([0.0, 5.0, 10.0, 15.0, 20.0])


def test_x_step_without_curve_calibration_is_no_calibration():
    curve = Curve(
        id="c1",
        label="A",
        points=[Point(pixel=(0.0, 50.0)), Point(pixel=(100.0, 50.0))],
    )
    session = Session(
        image_meta={"width": 100, "height": 100, "scale_factor": 1.0},
        curves=[curve],
    )
    with pytest.raises(ValueError, match="no_calibration"):
        run_x_step(session, "c1", xmin=0.0, xmax=10.0, delx=2.5)


def test_x_step_request_requires_positive_delx():
    with pytest.raises(ValidationError):
        XStepRequest(xmin=0.0, xmax=10.0, delx=0.0)
    with pytest.raises(ValidationError):
        XStepRequest(xmin=0.0, xmax=10.0, delx=-1.0)
    assert XStepRequest(xmin=0.0, xmax=10.0, delx=0.1).delx == 0.1
