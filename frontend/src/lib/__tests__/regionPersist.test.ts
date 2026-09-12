import { describe, expect, it } from 'vitest'
import { addBox } from '../regionMask'
import {
  applyCurveRegion,
  nextCurveRegion,
  shouldApplySavedRegion,
} from '../regionPersist'
import type { Curve, RegionMask, Session } from '../../types'

const empty: RegionMask = { boxes: [], strokes: [], erase_strokes: [] }

function curve(overrides: Partial<Curve> = {}): Curve {
  return {
    id: 'c1',
    label: 'A',
    color: '#fff',
    style: 'solid',
    visible: true,
    points: [],
    region: empty,
    ...overrides,
  }
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    image_meta: { width: 800, height: 500, scale_factor: 1 },
    calibration: null,
    curves: [curve()],
    history: [],
    image_url: '/img',
    figure: { title: '', xlabel: '', ylabel: '' },
    ...overrides,
  }
}

describe('shouldApplySavedRegion', () => {
  it('skips a stale save when a newer local region exists', () => {
    expect(shouldApplySavedRegion({ savedSeq: 1, localSeq: 2 })).toBe(false)
  })

  it('applies the save that matches the current local seq', () => {
    expect(shouldApplySavedRegion({ savedSeq: 2, localSeq: 2 })).toBe(true)
  })
})

describe('nextCurveRegion', () => {
  it('computes the next region from the latest session curve, not a stale snapshot', () => {
    const boxA = { x: 0, y: 0, w: 4, h: 4 }
    const boxB = { x: 8, y: 8, w: 2, h: 2 }
    const first = nextCurveRegion(session(), 'c1', (prev) => addBox(prev, boxA))
    expect(first).not.toBeNull()
    const afterFirst = applyCurveRegion(session(), 'c1', first!.region)
    const second = nextCurveRegion(afterFirst, 'c1', (prev) => addBox(prev, boxB))
    expect(second!.region.boxes).toEqual([boxA, boxB])
    expect(second!.previous?.boxes).toEqual([boxA])
  })

  it('returns null when the curve is gone', () => {
    expect(nextCurveRegion(session({ curves: [] }), 'c1', (prev) => addBox(prev, { x: 1, y: 1, w: 1, h: 1 }))).toBeNull()
  })
})

describe('applyCurveRegion', () => {
  it('replaces only the named curve region so a failed PATCH can revert', () => {
    const current = applyCurveRegion(session(), 'c1', {
      boxes: [{ x: 1, y: 1, w: 2, h: 2 }],
      strokes: [],
      erase_strokes: [],
    })
    const reverted = applyCurveRegion(current, 'c1', empty)
    expect(reverted.curves[0].region).toEqual(empty)
    expect(current.curves[0].region).not.toEqual(empty)
  })
})
