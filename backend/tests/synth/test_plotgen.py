from __future__ import annotations

import numpy as np
import pytest

from plotgen import AxisPoint, SynthPlot, render_plot


def _linear():
    return render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        line_width=2,
        line_color=(0, 0, 255),
        background=(255, 255, 255),
    )


def test_image_shape_is_hw_bgr():
    plot = _linear()
    assert isinstance(plot, SynthPlot)
    assert plot.image.shape == (300, 400, 3)
    assert plot.image.dtype == np.uint8
    assert len(plot.axis_points) == 4
    assert all(isinstance(p, AxisPoint) for p in plot.axis_points)
    assert len(plot.truth) >= 2


def test_pixel_of_and_data_of_are_inverses_to_1e9():
    plot = _linear()
    samples = [(0.5, 0.25), (2.0, 1.0), (5.0, 2.5), (9.5, 4.75)]
    for x, y in samples:
        px, py = plot.pixel_of(x, y)
        back = plot.data_of(px, py)
        assert back[0] == pytest.approx(x, abs=1e-9)
        assert back[1] == pytest.approx(y, abs=1e-9)
        px2, py2 = plot.pixel_of(back[0], back[1])
        assert px2 == pytest.approx(px, abs=1e-9)
        assert py2 == pytest.approx(py, abs=1e-9)


def test_log_axes_inverses_to_1e9():
    plot = render_plot(
        lambda x: x**0.5,
        x_range=(1.0, 100.0),
        y_range=(1.0, 10.0),
        size=(400, 300),
        log_x=True,
        log_y=True,
    )
    x, y = 10.0, 10.0**0.5
    px, py = plot.pixel_of(x, y)
    back = plot.data_of(px, py)
    assert back[0] == pytest.approx(x, abs=1e-9)
    assert back[1] == pytest.approx(y, abs=1e-9)


def test_ink_lies_on_analytic_curve():
    func = lambda x: 0.5 * x
    plot = render_plot(
        func,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        line_width=2,
        line_color=(0, 0, 255),
        grid=None,
        rotation_deg=0.0,
        perspective=None,
        noise=0.0,
        markers=None,
    )
    ink = np.all(plot.image == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    assert ink.any()
    ys, xs = np.nonzero(ink)
    y_span = 5.0
    hits = 0
    for px, py in zip(xs.tolist(), ys.tolist()):
        x, y = plot.data_of(float(px), float(py))
        if x < 0.0 or x > 10.0:
            continue
        hits += 1
        assert abs(y - func(x)) <= 0.02 * y_span + 1e-9
    assert hits > 50


def test_gridlines_change_pixels_not_mapping():
    kwargs = dict(func=lambda x: 0.5 * x, x_range=(0.0, 10.0), y_range=(0.0, 5.0), size=(400, 300))
    plain = render_plot(**kwargs, grid=None)
    gridded = render_plot(**kwargs, grid=(4, 3))
    assert plain.image.shape == gridded.image.shape
    assert not np.array_equal(plain.image, gridded.image)
    x, y = 4.0, 2.0
    assert plain.pixel_of(x, y) == pytest.approx(gridded.pixel_of(x, y), abs=1e-12)


def test_rotation_and_perspective_keep_inverse():
    plot = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        rotation_deg=12.0,
        perspective=0.15,
    )
    x, y = 4.0, 2.0
    px, py = plot.pixel_of(x, y)
    back = plot.data_of(px, py)
    assert back[0] == pytest.approx(x, abs=1e-9)
    assert back[1] == pytest.approx(y, abs=1e-9)
    upright = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
    )
    assert not np.array_equal(plot.image, upright.image)
    ux, uy = upright.pixel_of(x, y)
    assert abs(px - ux) + abs(py - uy) > 1e-3


def test_markers_and_noise_draw_extra_ink():
    base = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=None,
        noise=0.0,
    )
    marked = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=4,
        noise=0.0,
    )
    noisy = render_plot(
        lambda x: 0.5 * x,
        x_range=(0.0, 10.0),
        y_range=(0.0, 5.0),
        size=(400, 300),
        markers=None,
        noise=8.0,
    )
    assert not np.array_equal(base.image, marked.image)
    assert not np.array_equal(base.image, noisy.image)
    ink = np.all(marked.image == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    assert int(ink.sum()) > int(np.all(base.image == np.array([0, 0, 255], dtype=np.uint8), axis=2).sum())
