from __future__ import annotations

import sys
from pathlib import Path

import pytest

_TESTS = Path(__file__).resolve().parents[1]
_HERE = Path(__file__).resolve().parent
for _p in (_TESTS, _HERE, _TESTS / "synth"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from refcorpus import resolve_ref_dir  # noqa: E402


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "reference: tests that read the optional Engauge corpus via PLOTDIG_REF_DIR",
    )


@pytest.fixture(scope="session")
def plotdig_ref_dir() -> Path:
    found = resolve_ref_dir()
    if found is None:
        pytest.skip("PLOTDIG_REF_DIR not present; skipping reference corpus tests")
    return found
