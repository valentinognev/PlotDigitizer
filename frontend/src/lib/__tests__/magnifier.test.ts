import { describe, expect, it } from 'vitest'
import { magnifierSourceRect } from '../magnifier'

describe('magnifierSourceRect', () => {
  it('is magnification-scaled and centred on the cursor, clamped to the image', () => {
    const r = magnifierSourceRect(200, 100, [100, 50], 5, 160)
    expect(r.sw).toBeCloseTo(32, 5)
    expect(r.sh).toBeCloseTo(32, 5)
    expect(r.sx).toBeCloseTo(84, 5)
    expect(r.sy).toBeCloseTo(34, 5)
  })
  it('clamps so the rect stays inside the image', () => {
    const r = magnifierSourceRect(40, 40, [0, 0], 5, 160)
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(40)
    expect(r.sy + r.sh).toBeLessThanOrEqual(40)
  })
})
