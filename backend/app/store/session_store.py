from __future__ import annotations

import copy
from dataclasses import dataclass, field
from threading import Lock

from app.models.schemas import HistoryEntry, Session
from app.store import session_persistence
from app.store.temp_images import load_working_image, save_working_image


@dataclass
class StoredSession:
    session: Session
    image_bytes: bytes
    original_image_bytes: bytes
    undo_stack: list[dict] = field(default_factory=list)
    redo_stack: list[dict] = field(default_factory=list)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, StoredSession] = {}
        self._lock = Lock()
        self._last_session_id: str | None = None

    def restore_last(self) -> StoredSession | None:
        loaded = session_persistence.load()
        if loaded is None:
            return None
        session, original_bytes = loaded
        working_bytes = load_working_image(session.id) or original_bytes
        stored = StoredSession(
            session=session,
            image_bytes=working_bytes,
            original_image_bytes=original_bytes,
        )
        with self._lock:
            self._sessions[session.id] = stored
            self._last_session_id = session.id
        return stored

    def get_last(self) -> StoredSession | None:
        if self._last_session_id is None:
            return None
        return self.get(self._last_session_id)

    def _persist(self, stored: StoredSession) -> None:
        self._last_session_id = stored.session.id
        session_persistence.save(stored.session, stored.original_image_bytes)
        save_working_image(stored.session.id, stored.image_bytes)

    def create(self, session: Session, image_bytes: bytes) -> StoredSession:
        with self._lock:
            stored = StoredSession(
                session=session,
                image_bytes=image_bytes,
                original_image_bytes=image_bytes,
            )
            self._sessions[session.id] = stored
            self._persist(stored)
            return stored

    def update_working_image(self, session_id: str, image_bytes: bytes) -> None:
        with self._lock:
            stored = self._get_unlocked(session_id)
            stored.image_bytes = image_bytes
            stored.session.image_meta.revision += 1
            save_working_image(session_id, image_bytes)
            session_persistence.save(stored.session, stored.original_image_bytes)

    def get(self, session_id: str) -> StoredSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def require(self, session_id: str) -> StoredSession:
        stored = self.get(session_id)
        if stored is None:
            raise KeyError(session_id)
        return stored

    def _get_unlocked(self, session_id: str) -> StoredSession:
        stored = self._sessions.get(session_id)
        if stored is None:
            raise KeyError(session_id)
        return stored

    def update(self, session_id: str, session: Session) -> Session:
        with self._lock:
            stored = self._get_unlocked(session_id)
            stored.session = session
            self._persist(stored)
            return session

    def snapshot(self, stored: StoredSession) -> dict:
        return {
            "calibration": stored.session.calibration.model_dump() if stored.session.calibration else None,
            "curves": [c.model_dump() for c in stored.session.curves],
            "image_bytes": stored.image_bytes,
            "image_revision": stored.session.image_meta.revision,
        }

    def _history_snapshot(self, snap: dict) -> dict:
        """Audit-log snapshot without raw image bytes (not JSON-serializable)."""
        return {k: v for k, v in snap.items() if k != "image_bytes"}

    def push_history(self, stored: StoredSession, action: str) -> None:
        snap = self.snapshot(stored)
        stored.undo_stack.append(snap)
        stored.redo_stack.clear()
        stored.session.history.append(
            HistoryEntry(action=action, snapshot=self._history_snapshot(snap))
        )

    def undo(self, session_id: str) -> Session | None:
        with self._lock:
            stored = self._get_unlocked(session_id)
            if not stored.undo_stack:
                return None
            current = self.snapshot(stored)
            stored.redo_stack.append(current)
            snap = stored.undo_stack.pop()
            self._apply_snapshot(stored, snap)
            return stored.session

    def redo(self, session_id: str) -> Session | None:
        with self._lock:
            stored = self._get_unlocked(session_id)
            if not stored.redo_stack:
                return None
            current = self.snapshot(stored)
            stored.undo_stack.append(current)
            snap = stored.redo_stack.pop()
            self._apply_snapshot(stored, snap)
            return stored.session

    def _apply_snapshot(self, stored: StoredSession, snap: dict) -> None:
        from app.models.schemas import Calibration, Curve

        cal = snap.get("calibration")
        stored.session.calibration = Calibration(**cal) if cal else None
        stored.session.curves = [Curve(**c) for c in snap.get("curves", [])]
        image_bytes = snap.get("image_bytes")
        if image_bytes is not None:
            stored.image_bytes = image_bytes
        if "image_revision" in snap:
            stored.session.image_meta.revision = snap["image_revision"]
        self._persist(stored)


session_store = SessionStore()
