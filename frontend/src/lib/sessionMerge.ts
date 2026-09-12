import type { Calibration, FigureMeta, Session } from '../types'

const EMPTY_FIGURE: FigureMeta = { title: '', xlabel: '', ylabel: '' }

export interface PreferencesPatch {
  calibration?: Calibration
  calibrations?: Calibration[]
  manual_calibration?: boolean
  workspace?: Session['workspace']
  figure?: FigureMeta
}

function upsertCalibrationList(list: Calibration[] | undefined, cal: Calibration): Calibration[] {
  const current = list ?? []
  if (!cal.id) {
    if (!current.length) return [cal]
    return current.map((item, i) => (i === 0 ? cal : item))
  }
  const idx = current.findIndex((item) => item.id === cal.id)
  if (idx >= 0) {
    const next = current.slice()
    next[idx] = cal
    return next
  }
  return [...current, cal]
}

/**
 * Local optimistic-update projection for a preferences patch, applied to the
 * session before the server round-trip resolves. Only flips
 * `manual_calibration` when the patch actually touches `calibration` — an
 * unrelated field (e.g. `figure`) must not imply a calibration change.
 */
export function applyPreferencesPatchLocal(current: Session, patch: PreferencesPatch): Session {
  const calibrations =
    patch.calibration !== undefined
      ? upsertCalibrationList(
          patch.calibrations !== undefined ? patch.calibrations : current.calibrations,
          patch.calibration,
        )
      : patch.calibrations !== undefined
        ? patch.calibrations
        : current.calibrations
  return {
    ...current,
    ...(patch.calibration !== undefined
      ? { calibration: patch.calibration, manual_calibration: true }
      : {}),
    ...(patch.calibration !== undefined || patch.calibrations !== undefined ? { calibrations } : {}),
    ...(patch.figure !== undefined ? { figure: patch.figure } : {}),
  }
}

/** Keep session fields that older API responses may omit. */
export function mergeSessionUpdate(prev: Session | null, saved: Session): Session {
  return {
    ...saved,
    calibration: saved.calibration ?? prev?.calibration ?? null,
    calibrations: saved.calibrations ?? prev?.calibrations,
    manual_calibration:
      saved.manual_calibration !== undefined
        ? saved.manual_calibration
        : (prev?.manual_calibration ?? false),
    workspace: saved.workspace !== undefined ? saved.workspace : prev?.workspace,
    image_source: saved.image_source !== undefined ? saved.image_source : prev?.image_source,
    figure: saved.figure ?? prev?.figure ?? EMPTY_FIGURE,
  }
}

/** Preferences/workspace saves must not replace in-flight curve edits. */
export function mergePreferencesUpdate(prev: Session | null, saved: Session): Session {
  if (!prev) return saved
  return {
    ...prev,
    calibration: saved.calibration ?? prev.calibration,
    calibrations: saved.calibrations ?? prev.calibrations,
    manual_calibration:
      saved.manual_calibration !== undefined
        ? saved.manual_calibration
        : prev.manual_calibration,
    workspace: saved.workspace ?? prev.workspace,
    figure: saved.figure ?? prev.figure,
  }
}

export interface PreferencesSaveResolution {
  /** Pending-patch buffer with round-tripped keys cleared; superseded/unrelated keys kept. */
  pending: PreferencesPatch
  /** Set only when the in-flight figure round-tripped without being superseded. */
  figure?: FigureMeta
  /** Set only when the in-flight calibration round-tripped without being superseded. */
  calibration?: Calibration
}

/**
 * Decide what to do with the pending-prefs buffer and local echo state once a
 * debounced preferences PATCH resolves.
 *
 * Guards against the "mid-typing revert" race: if the user edited a key again
 * while the request for `sent` was in flight, `pending[key]` will no longer
 * be the exact value that was sent. In that case the newer pending value is
 * kept untouched (it will go out on the next flush) and the now-stale
 * `saved` value for that key is not applied locally. If `pending[key]` is
 * still the sent value, it round-tripped safely: clear it from `pending` and
 * apply `saved`'s value. Keys absent from `sent`, or present in `pending`
 * but not `sent`, are left alone.
 */
export function resolvePreferencesSave(
  pending: PreferencesPatch,
  sent: PreferencesPatch,
  saved: Session,
): PreferencesSaveResolution {
  const nextPending: PreferencesPatch = { ...pending }
  const result: PreferencesSaveResolution = { pending: nextPending }

  if (sent.figure !== undefined && nextPending.figure === sent.figure) {
    delete nextPending.figure
    if (saved.figure) result.figure = saved.figure
  }
  if (sent.calibration !== undefined && nextPending.calibration === sent.calibration) {
    delete nextPending.calibration
    if (saved.calibration) result.calibration = saved.calibration
  }
  if (
    sent.manual_calibration !== undefined &&
    nextPending.manual_calibration === sent.manual_calibration
  ) {
    delete nextPending.manual_calibration
  }
  if (sent.workspace !== undefined && nextPending.workspace === sent.workspace) {
    delete nextPending.workspace
  }
  if (sent.calibrations !== undefined && nextPending.calibrations === sent.calibrations) {
    delete nextPending.calibrations
  }

  return result
}
