import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True)
def isolate_runtime_config(tmp_path, monkeypatch):
    """Keep pytest from overwriting backend/config/settings.json or last_session/."""
    from app.settings.settings_store import SettingsStore
    from app.store.session_store import SessionStore

    settings_path = tmp_path / "settings.json"
    last_session_dir = tmp_path / "last_session"

    settings = SettingsStore(path=settings_path)
    sessions = SessionStore()

    for module in (
        "app.settings.settings_store",
        "app.api.settings",
        "app.vlm.factory",
        "app.main",
    ):
        monkeypatch.setattr(f"{module}.settings_store", settings)

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
