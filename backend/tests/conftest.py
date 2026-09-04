import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--update-baselines",
        action="store_true",
        default=False,
        help="Rewrite tests/reference/baselines/metrics.json from assert_not_worse values",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "reference: tests that read the optional Engauge corpus via PLOTDIG_REF_DIR",
    )
    from metrics import configure_baselines

    configure_baselines(update=config.getoption("--update-baselines"), path=None)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from metrics import flush_baselines

    flush_baselines()


@pytest.fixture(autouse=True)
def isolate_runtime_config(tmp_path, monkeypatch):
    """Keep pytest from overwriting last_session/."""
    from app.store.session_store import SessionStore

    last_session_dir = tmp_path / "last_session"
    sessions = SessionStore()

    for module in (
        "app.store.session_store",
        "app.api.sessions",
        "app.main",
    ):
        monkeypatch.setattr(f"{module}.session_store", sessions)

    import app.store.session_persistence as persistence

    monkeypatch.setattr(persistence, "LAST_SESSION_DIR", last_session_dir)
    monkeypatch.setattr(persistence, "SESSION_JSON", last_session_dir / "session.json")
    monkeypatch.setattr(persistence, "IMAGE_PATH", last_session_dir / "image.png")
