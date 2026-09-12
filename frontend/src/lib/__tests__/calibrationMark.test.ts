import { describe, expect, it } from 'vitest'
import { calibrationMarkVisual } from '../calibrationMark'

describe('calibrationMarkVisual', () => {
  it('makes four-bound marks hollow with a cross inside the circle', () => {
    const v = calibrationMarkVisual({
      hollow: true,
      active: false,
      color: '#22d3ee',
      scale: 1,
    })
    expect(v.fill).toBe('transparent')
    expect(v.stroke).toBe('#22d3ee')
    expect(v.cross).not.toBeNull()
    const arm = v.cross!.horizontal[2]
    expect(arm).toBeGreaterThan(0)
    expect(arm).toBeLessThan(v.radius)
  })

  it('keeps precise / scale-bar marks filled with no cross', () => {
    const v = calibrationMarkVisual({
      hollow: false,
      active: false,
      color: '#fbbf24',
      scale: 1,
    })
    expect(v.fill).toBe('#fbbf24')
    expect(v.stroke).toBe('#fff')
    expect(v.cross).toBeNull()
  })

  it('uses a gold ring when active while the cross stays the mark color', () => {
    const v = calibrationMarkVisual({
      hollow: true,
      active: true,
      color: '#e879f9',
      scale: 1,
    })
    expect(v.fill).toBe('transparent')
    expect(v.stroke).toBe('#fbbf24')
    expect(v.cross?.stroke).toBe('#e879f9')
  })

  it('keeps on-screen size constant while zooming', () => {
    const v = calibrationMarkVisual({
      hollow: true,
      active: false,
      color: '#22d3ee',
      scale: 2,
    })
    const unzoomed = calibrationMarkVisual({
      hollow: true,
      active: false,
      color: '#22d3ee',
      scale: 1,
    })
    expect(v.radius).toBe(unzoomed.radius / 2)
    expect(v.strokeWidth).toBe(unzoomed.strokeWidth / 2)
    expect(v.cross!.strokeWidth).toBe(unzoomed.cross!.strokeWidth / 2)
  })
})
