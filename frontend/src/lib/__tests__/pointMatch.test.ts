import { describe, expect, it } from 'vitest'
import {
  emptyPointMatch,
  partitionByScore,
  pointMatchKeyAction,
  reducePointMatch,
  ringRadiusFromScore,
  type MatchCandidate,
} from '../pointMatch'

const A: MatchCandidate = { pixel: [1, 1], score: 0.95 }
const B: MatchCandidate = { pixel: [2, 2], score: 0.80 }
const C: MatchCandidate = { pixel: [3, 3], score: 0.40 }

describe('partitionByScore', () => {
  it('splits on the current score', () => {
    const { atOrAbove, below } = partitionByScore([A, B, C], 0.8)
    expect(atOrAbove).toEqual([A, B])
    expect(below).toEqual([C])
  })
})

describe('ringRadiusFromScore', () => {
  it('gives the current candidate a larger ring and high scores a tighter ring', () => {
    const high = ringRadiusFromScore(0.99, false)
    const low = ringRadiusFromScore(0.2, false)
    const current = ringRadiusFromScore(0.99, true)
    expect(high).toBeLessThan(low)
    expect(current).toBeGreaterThan(high)
  })
})

describe('reducePointMatch', () => {
  it('accepts, rejects, and shift-accepts from the ranked list', () => {
    let s = reducePointMatch(emptyPointMatch, { type: 'set-candidates', candidates: [C, A, B] })
    expect(s.candidates.map((c) => c.score)).toEqual([0.95, 0.8, 0.4])
    s = reducePointMatch(s, { type: 'accept-current' })
    expect(s.accepted).toEqual([A])
    expect(s.candidates[0]).toEqual(B)
    s = reducePointMatch(s, { type: 'reject-current' })
    expect(s.rejected).toEqual([B])
    s = reducePointMatch(s, {
      type: 'set-candidates',
      candidates: [A, B, C],
    })
    s = reducePointMatch(s, { type: 'accept-at-or-above' })
    expect(s.accepted.map((c) => c.score)).toContain(0.95)
    expect(s.candidates.every((c) => c.score < 0.95)).toBe(true)
  })

  it('binds set-candidates to a curveId and clears it', () => {
    let s = reducePointMatch(emptyPointMatch, {
      type: 'set-candidates',
      candidates: [A],
      curveId: 'curve-a',
    })
    expect(s.curveId).toBe('curve-a')
    s = reducePointMatch(s, { type: 'accept-current' })
    expect(s.curveId).toBe('curve-a')
    expect(s.accepted).toEqual([A])
    s = reducePointMatch(s, { type: 'clear' })
    expect(s).toEqual(emptyPointMatch)
    expect(s.curveId).toBeNull()
  })
})

describe('pointMatchKeyAction', () => {
  it('maps Enter / Esc / Shift+Enter', () => {
    expect(pointMatchKeyAction('Enter', false)).toEqual({ type: 'accept-current' })
    expect(pointMatchKeyAction('Enter', true)).toEqual({ type: 'accept-at-or-above' })
    expect(pointMatchKeyAction('Escape', false)).toEqual({ type: 'reject-current' })
    expect(pointMatchKeyAction('a', false)).toBeNull()
  })
})
