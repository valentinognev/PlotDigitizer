from __future__ import annotations

import json
from pathlib import Path

from app.models.schemas import Session

LAST_SESSION_DIR = Path(__file__).resolve().parents[2] / "config" / "last_session"
SESSION_JSON = LAST_SESSION_DIR / "session.json"
IMAGE_PATH = LAST_SESSION_DIR / "image.png"


def save(session: Session, image_bytes: bytes) -> None:
    LAST_SESSION_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_JSON.write_text(session.model_dump_json(indent=2), encoding="utf-8")
    IMAGE_PATH.write_bytes(image_bytes)


def load() -> tuple[Session, bytes] | None:
    if not SESSION_JSON.exists() or not IMAGE_PATH.exists():
        return None
    try:
        raw = json.loads(SESSION_JSON.read_text(encoding="utf-8"))
        session = Session(**raw)
        image_bytes = IMAGE_PATH.read_bytes()
    except (json.JSONDecodeError, OSError, ValueError):
        return None
    return session, image_bytes
