from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEMP_DIR = PROJECT_ROOT / "temp"


def session_temp_dir(session_id: str) -> Path:
    path = TEMP_DIR / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def working_image_path(session_id: str) -> Path:
    return session_temp_dir(session_id) / "working.png"


def save_working_image(session_id: str, image_bytes: bytes) -> Path:
    path = working_image_path(session_id)
    path.write_bytes(image_bytes)
    return path


def load_working_image(session_id: str) -> bytes | None:
    path = working_image_path(session_id)
    if path.is_file():
        return path.read_bytes()
    return None


def save_removal_snapshot(session_id: str, curve_id: str, image_bytes: bytes) -> Path:
    directory = session_temp_dir(session_id)
    path = directory / f"removed_{curve_id}.png"
    path.write_bytes(image_bytes)
    return path
