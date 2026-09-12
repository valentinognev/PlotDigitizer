from __future__ import annotations

from app.models.schemas import Calibration, Curve, Session


def calibration_for_curve(session: Session, curve: Curve) -> Calibration | None:
    if curve.calibration_id:
        for cal in session.calibrations:
            if cal.id == curve.calibration_id:
                return cal
    if session.calibration is not None:
        return session.calibration
    if session.calibrations:
        return session.calibrations[0]
    return None


def upsert_session_calibration(session: Session, cal: Calibration) -> None:
    """Write the active calibration and keep `session.calibrations` in sync by id."""
    current = session.calibration
    updates: dict[str, str] = {}
    if "id" not in cal.model_fields_set and current is not None:
        updates["id"] = current.id
    if "name" not in cal.model_fields_set and current is not None:
        updates["name"] = current.name
    if updates:
        cal = cal.model_copy(update=updates)
    session.calibration = cal
    for i, existing in enumerate(session.calibrations):
        if existing.id == cal.id:
            session.calibrations[i] = cal
            return
    session.calibrations.append(cal)
