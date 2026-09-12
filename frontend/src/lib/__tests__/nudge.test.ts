import { describe, expect, it } from 'vitest'
import { applyNudge, nudgeDelta } from '../nudge'

describe('nudgeDelta', () => {
  it('maps arrows to 1 px and Shift to 10 px', () => {
    expect(nudgeDelta('ArrowLeft', false)).toEqual([-1, 0])
    expect(nudgeDelta('ArrowRight', false)).toEqual([1, 0])
    expect(nudgeDelta('ArrowUp', false)).toEqual([0, -1])
    expect(nudgeDelta('ArrowDown', false)).toEqual([0, 1])
    expect(nudgeDelta('ArrowRight', true)).toEqual([10, 0])
    expect(nudgeDelta('ArrowUp', true)).toEqual([0, -10])
    expect(nudgeDelta('a', false)).toBeNull()
  })
})

describe('applyNudge', () => {
  it('adds the delta and clamps to image bounds when given', () => {
    expect(applyNudge([5, 5], [-1, 0])).toEqual([4, 5])
    expect(applyNudge([0, 0], [-1, 0], { w: 10, h: 10 })).toEqual([0, 0])
    expect(applyNudge([9, 9], [10, 10], { w: 10, h: 10 })).toEqual([10, 10])
  })
})
