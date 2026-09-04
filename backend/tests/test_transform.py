from __future__ import annotations

import math

import numpy as np
import pytest

from app.calibration.transform import (
    CalibrationError,
    Constraint,
    Transform2D,
    build_constraints,
    solve_transform,
)
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    RefPoint,
)


def _apply_h(H: np.ndarray, pixel: tuple[float, float]) -> tuple[float, float]:
    vec = H @ np.array([pixel[0], pixel[1], 1.0], dtype=np.float64)
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def test_orthogonal_recovers_known_mapping():
    # u = 0.05 * px - 5, v = -0.02 * py + 8
    constraints = [
        Constraint(pixel=(100.0, 400.0), axis="u", value=0.0),
        Constraint(pixel=(500.0, 400.0), axis="u", value=20.0),
        Constraint(pixel=(100.0, 400.0), axis="v", value=0.0),
        Constraint(pixel=(100.0, 100.0), axis="v", value=6.0),
    ]
    t = solve_transform(constraints, model="orthogonal")
    assert t.model == "orthogonal"
    u, v = t.to_linear((300.0, 250.0))
    assert u == pytest.approx(10.0, abs=1e-12)
    assert v == pytest.approx(3.0, abs=1e-12)
    px, py = t.from_linear((10.0, 3.0))
    assert px == pytest.approx(300.0, abs=1e-9)
    assert py == pytest.approx(250.0, abs=1e-9)


def test_affine_recovers_known_mapping():
    # u = 0.04*px + 0.01*py + 1, v = -0.02*px + 0.05*py - 2
    def uv(px: float, py: float) -> tuple[float, float]:
        return 0.04 * px + 0.01 * py + 1.0, -0.02 * px + 0.05 * py - 2.0

    pixels = [(10.0, 20.0), (80.0, 15.0), (30.0, 90.0), (60.0, 70.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = uv(*p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="affine")
    assert t.model == "affine"
    for p in pixels + [(45.0, 40.0)]:
        got = t.to_linear(p)
        exp = uv(*p)
        assert got[0] == pytest.approx(exp[0], abs=1e-10)
        assert got[1] == pytest.approx(exp[1], abs=1e-10)
        back = t.from_linear(got)
        assert back[0] == pytest.approx(p[0], abs=1e-8)
        assert back[1] == pytest.approx(p[1], abs=1e-8)


def test_projective_recovers_known_homography():
    H = np.array(
        [
            [1.2, 0.15, 4.0],
            [-0.08, 0.9, 3.0],
            [0.0004, -0.0003, 1.0],
        ],
        dtype=np.float64,
    )
    pixels = [(0.0, 0.0), (200.0, 10.0), (15.0, 180.0), (190.0, 170.0), (90.0, 80.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = _apply_h(H, p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="projective")
    assert t.model == "projective"
    for p in pixels:
        got = t.to_linear(p)
        exp = _apply_h(H, p)
        assert got[0] == pytest.approx(exp[0], rel=1e-8, abs=1e-8)
        assert got[1] == pytest.approx(exp[1], rel=1e-8, abs=1e-8)


def test_auto_selects_projective_when_four_full_points():
    H = np.array(
        [[1.1, 0.2, 2.0], [0.05, 1.3, 1.0], [0.0005, 0.0002, 1.0]],
        dtype=np.float64,
    )
    pixels = [(0.0, 0.0), (100.0, 0.0), (0.0, 80.0), (90.0, 70.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = _apply_h(H, p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="auto")
    assert t.model == "projective"


def test_auto_selects_affine_when_three_full_noncollinear():
    def uv(px: float, py: float) -> tuple[float, float]:
        return 0.1 * px + 0.02 * py, 0.03 * px + 0.2 * py + 1.0

    pixels = [(0.0, 0.0), (50.0, 5.0), (10.0, 40.0)]
    constraints: list[Constraint] = []
    for p in pixels:
        u, v = uv(*p)
        constraints.append(Constraint(pixel=p, axis="u", value=u))
        constraints.append(Constraint(pixel=p, axis="v", value=v))
    t = solve_transform(constraints, model="auto")
    assert t.model == "affine"


def test_auto_selects_orthogonal_from_axis_aligned_bounds():
    constraints = [
        Constraint(pixel=(0.0, 10.0), axis="u", value=0.0),
        Constraint(pixel=(100.0, 10.0), axis="u", value=5.0),
        Constraint(pixel=(0.0, 10.0), axis="v", value=1.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=3.0),
    ]
    t = solve_transform(constraints, model="auto")
    assert t.model == "orthogonal"


def test_collinear_affine_raises():
    constraints = [
        Constraint(pixel=(0.0, 0.0), axis="u", value=0.0),
        Constraint(pixel=(10.0, 10.0), axis="u", value=1.0),
        Constraint(pixel=(20.0, 20.0), axis="u", value=2.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(10.0, 10.0), axis="v", value=1.0),
        Constraint(pixel=(20.0, 20.0), axis="v", value=2.0),
    ]
    with pytest.raises(CalibrationError) as exc:
        solve_transform(constraints, model="affine")
    assert exc.value.hint


def test_projective_three_collinear_raises():
    constraints = [
        Constraint(pixel=(0.0, 0.0), axis="u", value=0.0),
        Constraint(pixel=(0.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(10.0, 0.0), axis="u", value=1.0),
        Constraint(pixel=(10.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(20.0, 0.0), axis="u", value=2.0),
        Constraint(pixel=(20.0, 0.0), axis="v", value=0.0),
        Constraint(pixel=(5.0, 0.0), axis="u", value=0.5),
        Constraint(pixel=(5.0, 0.0), axis="v", value=0.0),
    ]
    with pytest.raises(CalibrationError) as exc:
        solve_transform(constraints, model="projective")
    assert exc.value.hint


def test_too_few_constraints_raises():
    with pytest.raises(CalibrationError):
        solve_transform(
            [Constraint(pixel=(0.0, 0.0), axis="u", value=0.0)],
            model="orthogonal",
        )


def test_build_constraints_from_ref_points_linear():
    cal = Calibration(
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
    cons = build_constraints(cal)
    u_vals = sorted(c.value for c in cons if c.axis == "u")
    v_vals = sorted(c.value for c in cons if c.axis == "v")
    assert u_vals == [0.0, 10.0]
    assert v_vals == [0.0, 5.0]


def test_build_constraints_log_space():
    cal = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 10.0), value=1.0),
                RefPoint(pixel=(100.0, 10.0), value=100.0),
            ],
        ),
        y=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 100.0), value=0.1),
                RefPoint(pixel=(10.0, 10.0), value=10.0),
            ],
        ),
    )
    cons = build_constraints(cal)
    u_vals = sorted(c.value for c in cons if c.axis == "u")
    v_vals = sorted(c.value for c in cons if c.axis == "v")
    assert u_vals[0] == pytest.approx(0.0)
    assert u_vals[1] == pytest.approx(2.0)
    assert v_vals[0] == pytest.approx(-1.0)
    assert v_vals[1] == pytest.approx(1.0)


def test_build_constraints_log_rejects_non_positive():
    cal = Calibration(
        x=CalibrationAxis(
            scale="log",
            ref_points=[
                RefPoint(pixel=(10.0, 10.0), value=1.0),
                RefPoint(pixel=(100.0, 10.0), value=0.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 100.0), value=0.0),
                RefPoint(pixel=(0.0, 10.0), value=1.0),
            ],
        ),
    )
    with pytest.raises(CalibrationError):
        build_constraints(cal)


def test_axis_points_are_sole_source_when_non_empty():
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=999.0),
                RefPoint(pixel=(1.0, 0.0), value=998.0),
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                RefPoint(pixel=(0.0, 0.0), value=997.0),
                RefPoint(pixel=(0.0, 1.0), value=996.0),
            ],
        ),
        axis_points=[
            AxisPoint(pixel=(10.0, 20.0), x_value=1.0, y_value=2.0),
            AxisPoint(pixel=(30.0, 20.0), x_value=3.0, y_value=None),
            AxisPoint(pixel=(10.0, 40.0), x_value=None, y_value=4.0),
        ],
    )
    cons = build_constraints(cal)
    assert len(cons) == 4
    assert all(c.value < 10.0 for c in cons)


def test_build_constraints_polar_full_pair():
    cal = Calibration(
        x=CalibrationAxis(scale="linear", ref_points=[]),
        y=CalibrationAxis(scale="linear", ref_points=[]),
        coords_type="polar",
        theta_units="degrees",
        origin_radius=0.0,
        axis_points=[
            AxisPoint(pixel=(100.0, 100.0), x_value=0.0, y_value=2.0),
            AxisPoint(pixel=(140.0, 100.0), x_value=90.0, y_value=2.0),
        ],
    )
    cons = build_constraints(cal)
    by_pixel = {}
    for c in cons:
        by_pixel.setdefault(c.pixel, {})[c.axis] = c.value
    origin = by_pixel[(100.0, 100.0)]
    assert origin["u"] == pytest.approx(2.0)
    assert origin["v"] == pytest.approx(0.0)
    other = by_pixel[(140.0, 100.0)]
    assert other["u"] == pytest.approx(0.0, abs=1e-12)
    assert other["v"] == pytest.approx(2.0)
