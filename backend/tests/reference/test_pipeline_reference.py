from __future__ import annotations

import math
import time

import cv2
import numpy as np
import pytest

from app.calibration.coords import pixel_to_data
from app.cv.color_filter import build_filter_mask
from app.cv.point_match import match_points
from app.cv.segments import build_segments, fill_segment
from app.export.export import export_csv
from app.models.schemas import (
    AxisPoint,
    Calibration,
    CalibrationAxis,
    ColorFilter,
    Curve,
    Point,
    Session,
)
from app.pipeline.pipeline import build_curve_mask
from metrics import assert_not_worse, rms_error
from tests.reference.refcorpus import (
    POLAR_WITH_AXIS_POINTS,
    color_filter_from_engauge,
    iter_docs,
    sample_image,
)

pytestmark = pytest.mark.reference


@pytest.fixture
def ref_dir(plotdig_ref_dir):
    return plotdig_ref_dir


def _norm_level(v: float) -> float:
    return float(v) / 100.0 if float(v) > 1.0 else float(v)


def _filter_from_doc(doc) -> ColorFilter:
    if doc.color_filter:
        flt = color_filter_from_engauge(doc.color_filter)
        return flt.model_copy(update={"remove_grid": True})
    raw = doc.color_filter or {}
    low = _norm_level(float(raw.get("IntensityLow", raw.get("low", 0.0))))
    high = _norm_level(float(raw.get("IntensityHigh", raw.get("high", 0.4))))
    return ColorFilter(mode="intensity", low=low, high=high, remove_grid=True)


def _image_bytes(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def _cal_from_doc(doc) -> Calibration:
    scale_x = doc.scale_x if doc.scale_x in ("linear", "log") else "linear"
    scale_y = doc.scale_y if doc.scale_y in ("linear", "log") else "linear"
    coords = doc.coords_type if doc.coords_type in ("cartesian", "polar", "map") else "cartesian"
    axis_points = [
        AxisPoint(pixel=ap.pixel, x_value=ap.graph_x, y_value=ap.graph_y)
        for ap in doc.axis_points
    ]
    origin_radius = 0.0
    if coords == "polar":
        radii = [float(ap.graph_y) for ap in doc.axis_points if ap.graph_y is not None]
        origin_radius = min(radii) if radii else 0.0
    return Calibration(
        x=CalibrationAxis(scale=scale_x, ref_points=[]),
        y=CalibrationAxis(scale=scale_y, ref_points=[]),
        coords_type=coords,
        model="auto",
        axis_points=axis_points,
        theta_units="degrees",
        origin_radius=origin_radius,
    )


def _session(doc, cal: Calibration, curve: Curve) -> Session:
    h, w = doc.image.shape[:2]
    return Session(
        image_meta={"width": w, "height": h, "scale_factor": 1.0},
        calibration=cal,
        curves=[curve],
    )


def _rel_errors(pairs: list[tuple[float, float]], expected: list[tuple[float, float]]) -> tuple[float, float]:
    if not pairs or not expected:
        return 999.0, 999.0
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    ex = [p[0] for p in expected]
    ey = [p[1] for p in expected]
    span_x = max(max(ex) - min(ex), 1e-9)
    span_y = max(max(ey) - min(ey), 1e-9)
    # nearest-neighbour in x then y relative to span
    errs = []
    for x, y in zip(xs, ys, strict=True):
        dmin = min(math.hypot((x - gx) / span_x, (y - gy) / span_y) for gx, gy in expected)
        errs.append(dmin)
    return float(rms_error(errs, [0.0] * len(errs))), float(max(errs) if errs else 999.0)


def _expected_pairs(doc) -> list[tuple[float, float]]:
    assert doc.expected_csv
    expected: list[tuple[float, float]] = []
    for row in doc.expected_csv[1:]:
        if len(row) < 2 or "XXX" in row:
            continue
        expected.append((float(row[-2]), float(row[-1])))
    assert expected
    return expected


def _mean_px_to_truth(
    points: list[tuple[float, float]], truth: list[tuple[float, float]]
) -> float:
    return float(
        np.mean(
            [
                min(math.hypot(p[0] - t[0], p[1] - t[1]) for t in truth)
                for p in points
            ]
        )
    )


def _best_long_segment(segs, truth: list[tuple[float, float]]):
    long = [s for s in segs if s.length >= 100.0] or list(segs)
    near = [s for s in long if _mean_px_to_truth(s.points, truth) <= 20.0]
    pool = near if near else long
    return max(pool, key=lambda s: s.length)


def _fill_best_long(doc, mask: np.ndarray) -> list[tuple[float, float]]:
    segs = build_segments(
        mask, min_length=float(doc.segment_settings.get("MinLength", 2.0))
    )
    assert len(segs) >= 1
    truth = next(iter(doc.curve_points.values()))
    seg = _best_long_segment(segs, truth)
    pixels = fill_segment(
        seg,
        separation=float(doc.segment_settings.get("PointSeparation", 25.0)),
        fill_corners=bool(doc.segment_settings.get("FillCorners", False)),
        mask=mask,
    )
    assert pixels
    return pixels


def test_pipeline_cartesian_linear(ref_dir):
    doc = next(d for d in iter_docs(ref_dir) if d.name == "guidelines_cartesian")
    cal = _cal_from_doc(doc)
    flt = _filter_from_doc(doc)
    curve = Curve(label="A", filter=flt, points=[])
    session = _session(doc, cal, curve)
    mask = build_curve_mask(session, _image_bytes(doc.image), curve.id)
    pixels = _fill_best_long(doc, mask)
    curve.points = [Point(pixel=p, origin="ai") for p in pixels]
    csv_text = export_csv(session)
    assert csv_text.splitlines()[0] == "curve_id,curve_label,x,y"
    got = [pixel_to_data(cal, p) for p in pixels]
    expected = _expected_pairs(doc)
    rms, peak = _rel_errors(got, expected)
    assert_not_worse("pipeline.guidelines_cartesian.rel_peak", peak, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_cartesian.rel_rms", rms, lower_is_better=True)


def test_pipeline_cartesian_log(ref_dir):
    doc = next(d for d in iter_docs(ref_dir) if d.name == "guidelines_cartesian_log")
    cal = _cal_from_doc(doc)
    flt = _filter_from_doc(doc)
    curve = Curve(label="A", filter=flt, points=[])
    session = _session(doc, cal, curve)
    mask = build_curve_mask(session, _image_bytes(doc.image), curve.id)
    pixels = _fill_best_long(doc, mask)
    curve.points = [Point(pixel=p, origin="ai") for p in pixels]
    got = [pixel_to_data(cal, p) for p in pixels]
    expected = _expected_pairs(doc)
    rms, peak = _rel_errors(got, expected)
    assert_not_worse("pipeline.guidelines_cartesian_log.rel_peak", peak, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_cartesian_log.rel_rms", rms, lower_is_better=True)


def test_pipeline_polar(ref_dir):
    name = next(n for n in POLAR_WITH_AXIS_POINTS if n == "guidelines_polar")
    doc = next(d for d in iter_docs(ref_dir) if d.name == name)
    cal = _cal_from_doc(doc)
    assert cal.coords_type == "polar"
    flt = _filter_from_doc(doc)
    curve = Curve(label="A", filter=flt, points=[])
    session = _session(doc, cal, curve)
    mask = build_curve_mask(session, _image_bytes(doc.image), curve.id)
    pixels = _fill_best_long(doc, mask)
    curve.points = [Point(pixel=p, origin="ai") for p in pixels]
    thetas: list[float] = []
    radii: list[float] = []
    for p in pixels:
        t, r = pixel_to_data(cal, p)
        thetas.append(t)
        radii.append(r)
    header = export_csv(session).splitlines()[0]
    assert header == "curve_id,curve_label,theta,R"
    expected = _expected_pairs(doc)
    exp_t = [p[0] for p in expected]
    exp_r = [p[1] for p in expected]
    dt = max(min(abs(t - et) for et in exp_t) for t in thetas)
    dr = max(min(abs(r - er) / max(abs(er), 1e-9) for er in exp_r) for r in radii)
    assert_not_worse("pipeline.guidelines_polar.theta_deg", dt, lower_is_better=True)
    assert_not_worse("pipeline.guidelines_polar.R_rel", dr, lower_is_better=True)


def test_pipeline_scatter_pointplot(ref_dir):
    img = sample_image(ref_dir, "pointplot.bmp")
    flt = ColorFilter(mode="intensity", low=0.90, high=0.99)
    h, w = img.shape[:2]
    cal = Calibration(
        x=CalibrationAxis(
            scale="linear",
            ref_points=[
                {"pixel": (0.0, 0.0), "value": 0.0},
                {"pixel": (float(w - 1), 0.0), "value": float(w - 1)},
            ],
        ),
        y=CalibrationAxis(
            scale="linear",
            ref_points=[
                {"pixel": (0.0, float(h - 1)), "value": 0.0},
                {"pixel": (0.0, 0.0), "value": float(h - 1)},
            ],
        ),
    )
    curve = Curve(
        label="triangles",
        connect_as="scatter",
        filter=flt,
        points=[],
    )
    session = Session(
        image_meta={"width": w, "height": h, "scale_factor": 1.0},
        calibration=cal,
        curves=[curve],
    )
    mask = build_curve_mask(session, _image_bytes(img), curve.id)
    n, _labels, stats, centroids = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    truth = [
        (float(centroids[i][0]), float(centroids[i][1]))
        for i in range(1, n)
        if int(stats[i, cv2.CC_STAT_AREA]) >= 8
    ]
    assert len(truth) >= 3
    found = match_points(mask, truth[0], sample_radius=8, max_point_size=24)
    used = [False] * len(truth)
    tp = 0
    for cand in found:
        best = -1
        best_d = 2.0
        for i, t in enumerate(truth):
            if used[i]:
                continue
            d = math.hypot(cand.pixel[0] - t[0], cand.pixel[1] - t[1])
            if d < best_d:
                best_d = d
                best = i
        if best >= 0 and best_d <= 1.5:
            used[best] = True
            tp += 1
    recall = tp / len(truth)
    fp_rate = (len(found) - tp) / max(len(found), 1)
    assert recall >= 0.95
    assert fp_rate <= 0.02
    curve.points = [Point(pixel=c.pixel, origin="ai") for c in found]
    csv_text = export_csv(session)
    assert csv_text.splitlines()[0] == "curve_id,curve_label,x,y"
    assert_not_worse("pipeline.pointplot.recall", recall, lower_is_better=False)
    assert_not_worse("pipeline.pointplot.fp_rate", fp_rate, lower_is_better=True)


def test_huge_png_point_match_budget(ref_dir):
    img = sample_image(ref_dir, "huge.png")
    flt = ColorFilter(mode="intensity", low=0.0, high=0.5)
    t0 = time.perf_counter()
    mask = build_filter_mask(img, flt)
    ys, xs = np.where(mask > 0)
    sample = (float(xs[len(xs) // 2]), float(ys[len(ys) // 2])) if len(xs) else (img.shape[1] / 2.0, img.shape[0] / 2.0)
    match_points(mask, sample, sample_radius=8, max_point_size=48, limit=50)
    elapsed = time.perf_counter() - t0
    assert elapsed < 15.0
    assert_not_worse("pipeline.huge_png.match_s", max(elapsed, 0.3), lower_is_better=True)
