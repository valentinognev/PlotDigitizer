import type { Session } from '../types'

/** Keep session fields that older API responses may omit. */
export function mergeSessionUpdate(prev: Session | null, saved: Session): Session {
  return {
    ...saved,
    calibration: saved.calibration ?? prev?.calibration ?? null,
    manual_calibration:
      saved.manual_calibration !== undefined
        ? saved.manual_calibration
        : (prev?.manual_calibration ?? false),
    workspace: saved.workspace !== undefined ? saved.workspace : prev?.workspace,
    image_source: saved.image_source !== undefined ? saved.image_source : prev?.image_source,
  }
}

/** Preferences/workspace saves must not replace in-flight curve edits. */
export function mergePreferencesUpdate(prev: Session | null, saved: Session): Session {
  if (!prev) return saved
  return {
    ...prev,
    calibration: saved.calibration ?? prev.calibration,
    manual_calibration:
      saved.manual_calibration !== undefined
        ? saved.manual_calibration
        : prev.manual_calibration,
    workspace: saved.workspace ?? prev.workspace,
  }
}
