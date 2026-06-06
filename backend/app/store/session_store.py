from __future__ import annotations

import copy
from dataclasses import dataclass, field
from threading import Lock

from app.models.schemas import HistoryEntry, Session


@dataclass
class StoredSession:
    session: Session
    image_bytes: bytes
    undo_stack: list[dict] = field(default_factory=list)
    redo_stack: list[dict] = field(default_factory=list)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, StoredSession] = {}
        self._lock = Lock()

    def create(self, session: Session, image_bytes: bytes) -> StoredSession:
        with self._lock:
            stored = StoredSession(session=session, image_bytes=image_bytes)
            self._sessions[session.id] = stored
            return stored

    def get(self, session_id: str) -> StoredSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def require(self, session_id: str) -> StoredSession:
        stored = self.get(session_id)
        if stored is None:
            raise KeyError(session_id)
        return stored

    def update(self, session_id: str, session: Session) -> Session:
        with self._lock:
            stored = self.require(session_id)
            stored.session = session
            return session

    def snapshot(self, stored: StoredSession) -> dict:
        return {
            "calibration": stored.session.calibration.model_dump() if stored.session.calibration else None,
            "curves": [c.model_dump() for c in stored.session.curves],
        }

    def push_history(self, stored: StoredSession, action: str) -> None:
        snap = self.snapshot(stored)
        stored.undo_stack.append(snap)
        stored.redo_stack.clear()
        stored.session.history.append(HistoryEntry(action=action, snapshot=snap))

    def undo(self, session_id: str) -> Session | None:
        with self._lock:
            stored = self.require(session_id)
            if not stored.undo_stack:
                return None
            current = self.snapshot(stored)
            stored.redo_stack.append(current)
            snap = stored.undo_stack.pop()
            self._apply_snapshot(stored, snap)
            return stored.session

    def redo(self, session_id: str) -> Session | None:
        with self._lock:
            stored = self.require(session_id)
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


session_store = SessionStore()
