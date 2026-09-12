from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.calibration.dates import UNIX_EPOCH, format_unix_days, parse_axis_token
from app.calibration.transform import CalibrationError

FIXTURE = Path(__file__).parent / "fixtures" / "date_parity.json"


def test_parse_number_token():
    value, kind = parse_axis_token("1.5")
    assert kind == "number"
    assert value == pytest.approx(1.5, abs=1e-9)


def test_parse_slash_date_is_unix_days():
    value, kind = parse_axis_token("2020/01/15")
    assert kind == "date"
    assert value == pytest.approx(18276.0, abs=1e-9)


def test_parse_hyphen_datetime_is_accepted():
    value, kind = parse_axis_token("2020-01-15 12:00:00")
    assert kind == "date"
    assert value == pytest.approx(18276.5, abs=1e-9)


def test_parse_invalid_token_raises_calibration_error():
    with pytest.raises(CalibrationError):
        parse_axis_token("not-a-date")
    with pytest.raises(CalibrationError):
        parse_axis_token("2020/13/01")
    with pytest.raises(CalibrationError):
        parse_axis_token("2020/01-15")
    with pytest.raises(CalibrationError):
        parse_axis_token("2020-01-15T12:00:00")
    with pytest.raises(CalibrationError):
        parse_axis_token("")


def test_format_unix_days_default_date_pattern():
    assert format_unix_days(18276.0, "YYYY/MM/DD") == "2020/01/15"
    assert format_unix_days(0.0, "YYYY/MM/DD") == "1970/01/01"


def test_format_unix_days_with_time_pattern():
    assert format_unix_days(18276.5, "YYYY/MM/DD hh:mm:ss") == "2020/01/15 12:00:00"


def test_parse_format_round_trip():
    value, kind = parse_axis_token("2020/01/15")
    assert kind == "date"
    assert format_unix_days(value, "YYYY/MM/DD") == "2020/01/15"

    value, kind = parse_axis_token("2020-01-15 12:00:00")
    assert kind == "date"
    assert format_unix_days(value, "YYYY/MM/DD hh:mm:ss") == "2020/01/15 12:00:00"


def test_unix_epoch_constant():
    assert UNIX_EPOCH == datetime(1970, 1, 1, tzinfo=UTC)


def test_parity_fixture_agrees_to_1e_9():
    payload = json.loads(FIXTURE.read_text())
    assert payload["cases"]
    for case in payload["cases"]:
        value, kind = parse_axis_token(case["text"])
        assert kind == "date"
        assert value == pytest.approx(case["unix_days"], abs=1e-9)
        assert format_unix_days(value, case["pattern"]) == case["text"]
        assert format_unix_days(case["unix_days"], case["pattern"]) == case["text"]
