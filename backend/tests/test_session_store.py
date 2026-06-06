import threading

from app.models.schemas import Session
from app.store.session_store import SessionStore


def test_update_does_not_deadlock():
    store = SessionStore()
    session = Session(image_meta={"width": 10, "height": 10, "scale_factor": 1.0})
    store.create(session, b"\x89PNG\r\n\x1a\n")
    done: list[str] = []

    def run() -> None:
        store.update(session.id, session)
        done.append("ok")

    thread = threading.Thread(target=run)
    thread.start()
    thread.join(timeout=2)
    assert not thread.is_alive()
    assert done == ["ok"]
