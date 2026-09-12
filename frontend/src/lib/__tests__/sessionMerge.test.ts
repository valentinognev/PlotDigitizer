import { describe, expect, it } from 'vitest'
import {
  applyPreferencesPatchLocal,
  mergePreferencesUpdate,
  mergeSessionUpdate,
  resolvePreferencesSave,
} from '../sessionMerge'
import type { Session } from '../../types'

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    image_meta: { width: 800, height: 500, scale_factor: 1 },
    calibration: null,
    curves: [],
    history: [],
    image_url: '/img',
    figure: { title: '', xlabel: '', ylabel: '' },
    ...overrides,
  }
}

describe('mergePreferencesUpdate', () => {
  it('keeps figure from saved when present', () => {
    const prev = baseSession({ figure: { title: 'Old', xlabel: 'a', ylabel: 'b' } })
    const saved = baseSession({ figure: { title: 'New', xlabel: 'x', ylabel: 'y' } })

    const merged = mergePreferencesUpdate(prev, saved)

    expect(merged.figure).toEqual({ title: 'New', xlabel: 'x', ylabel: 'y' })
  })

  it('falls back to prev figure when saved omits it', () => {
    const prev = baseSession({ figure: { title: 'Old', xlabel: 'a', ylabel: 'b' } })
    const saved = baseSession({
      figure: undefined as unknown as Session['figure'],
    })

    const merged = mergePreferencesUpdate(prev, saved)

    expect(merged.figure).toEqual({ title: 'Old', xlabel: 'a', ylabel: 'b' })
  })

  it('returns saved as-is when there is no previous session', () => {
    const saved = baseSession({ figure: { title: 'New', xlabel: 'x', ylabel: 'y' } })
    expect(mergePreferencesUpdate(null, saved).figure).toEqual({
      title: 'New',
      xlabel: 'x',
      ylabel: 'y',
    })
  })
})

describe('applyPreferencesPatchLocal', () => {
  it('does not flip manual_calibration for a figure-only patch', () => {
    const current = baseSession({ manual_calibration: false })

    const next = applyPreferencesPatchLocal(current, {
      figure: { title: 'Fig', xlabel: 'x', ylabel: 'y' },
    })

    expect(next.manual_calibration).toBe(false)
    expect(next.figure).toEqual({ title: 'Fig', xlabel: 'x', ylabel: 'y' })
  })

  it('does not flip manual_calibration for a workspace-only patch', () => {
    const current = baseSession({ manual_calibration: false })

    const next = applyPreferencesPatchLocal(current, {
      workspace: { resample_count: 50 },
    })

    expect(next.manual_calibration).toBe(false)
  })

  it('sets manual_calibration true when the patch includes calibration', () => {
    const current = baseSession({ manual_calibration: false })
    const calibration: Session['calibration'] = {
      x: { scale: 'linear', ref_points: [] },
      y: { scale: 'linear', ref_points: [] },
      source: 'manual',
    }

    const next = applyPreferencesPatchLocal(current, { calibration })

    expect(next.manual_calibration).toBe(true)
    expect(next.calibration).toEqual(calibration)
  })
})

describe('mergeSessionUpdate', () => {
  it('keeps prev figure when saved omits it', () => {
    const prev = baseSession({ figure: { title: 'Old', xlabel: 'a', ylabel: 'b' } })
    const saved = baseSession({
      figure: undefined as unknown as Session['figure'],
    })

    const merged = mergeSessionUpdate(prev, saved)

    expect(merged.figure).toEqual({ title: 'Old', xlabel: 'a', ylabel: 'b' })
  })
})

describe('resolvePreferencesSave', () => {
  it('drops the figure key and applies saved.figure when pending is unchanged since send', () => {
    const sentFigure = { title: 'Ti', xlabel: '', ylabel: '' }
    const pending = { figure: sentFigure }
    const sent = { figure: sentFigure }
    const saved = baseSession({ figure: sentFigure })

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({})
    expect(result.figure).toEqual(sentFigure)
  })

  it('keeps the newer pending figure and does not apply saved.figure when superseded', () => {
    // Race: type "T" (sent), then type "i" before the response for "T" arrives.
    const sentFigure = { title: 'T', xlabel: '', ylabel: '' }
    const newerFigure = { title: 'Ti', xlabel: '', ylabel: '' }
    const pending = { figure: newerFigure }
    const sent = { figure: sentFigure }
    const saved = baseSession({ figure: sentFigure })

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({ figure: newerFigure })
    expect(result.figure).toBeUndefined()
  })

  it('drops the calibration key and applies saved.calibration when pending is unchanged since send', () => {
    const sentCal: Session['calibration'] = {
      x: { scale: 'linear', ref_points: [] },
      y: { scale: 'linear', ref_points: [] },
      source: 'manual',
    }
    const pending = { calibration: sentCal }
    const sent = { calibration: sentCal }
    const saved = baseSession({ calibration: sentCal })

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({})
    expect(result.calibration).toEqual(sentCal)
  })

  it('keeps the newer pending calibration and does not apply saved.calibration when superseded', () => {
    const sentCal: Session['calibration'] = {
      x: { scale: 'linear', ref_points: [] },
      y: { scale: 'linear', ref_points: [] },
      source: 'manual',
    }
    const newerCal: Session['calibration'] = {
      ...sentCal,
      x: { scale: 'linear', ref_points: [{ pixel: [1, 2], value: 3 }] },
    }
    const pending = { calibration: newerCal }
    const sent = { calibration: sentCal }
    const saved = baseSession({ calibration: sentCal })

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({ calibration: newerCal })
    expect(result.calibration).toBeUndefined()
  })

  it('does not wipe unrelated pending keys (e.g. workspace) when resolving figure', () => {
    const sentFigure = { title: 'T', xlabel: '', ylabel: '' }
    const workspace: Session['workspace'] = { resample_count: 42 }
    const pending = { figure: sentFigure, workspace }
    const sent = { figure: sentFigure }
    const saved = baseSession({ figure: sentFigure })

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({ workspace })
  })

  it('drops manual_calibration and workspace keys once they round-trip unchanged', () => {
    const workspace: Session['workspace'] = { resample_count: 42 }
    const pending = { manual_calibration: true, workspace }
    const sent = { manual_calibration: true, workspace }
    const saved = baseSession()

    const result = resolvePreferencesSave(pending, sent, saved)

    expect(result.pending).toEqual({})
  })
})
