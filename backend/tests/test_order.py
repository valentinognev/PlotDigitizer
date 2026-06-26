from app.cv.order import order_points_along_curve


def test_order_scrambled_horizontal_curve():
    ordered = [
        (120.0, 480.0),
        (240.0, 420.0),
        (390.0, 380.0),
        (430.0, 200.0),
        (490.0, 410.0),
        (540.0, 430.0),
        (590.0, 435.0),
        (640.0, 438.0),
        (680.0, 440.0),
    ]
    scrambled = list(reversed(ordered))
    scrambled[2], scrambled[5] = scrambled[5], scrambled[2]

    result = order_points_along_curve(scrambled)
    assert result == ordered


def test_order_vertical_then_horizontal():
    ordered = [(501.0, 440.0), (502.0, 350.0), (501.0, 290.0), (610.0, 305.0)]
    scrambled = [ordered[3], ordered[0], ordered[2], ordered[1]]

    result = order_points_along_curve(scrambled)
    assert result == ordered


def test_order_preserves_two_points():
    pts = [(1.0, 2.0), (3.0, 4.0)]
    assert order_points_along_curve(pts) == pts
