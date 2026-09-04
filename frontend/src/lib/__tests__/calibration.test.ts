import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import { showFourBoundMarks } from '../calibration'

const cartesian: Calibration = {
  x: {
    scale: 'linear',
    ref_points: [
      { pixel: [10, 70], value: 0 },
      { pixel: [110, 70], value: 10 },
    ],
  },
  y: {
    scale: 'linear',
    ref_points: [
      { pixel: [10, 70], value: 0 },
      { pixel: [10, 10], value: 1 },
    ],
  },
  source: 'manual',
}

describe('showFourBoundMarks', () => {
  it('shows four-bound marks for cartesian without Precise axis points', () => {
    expect(showFourBoundMarks(cartesian)).toBe(true)
    expect(showFourBoundMarks({ ...cartesian, axis_points: [] })).toBe(true)
  })

  it('hides four-bound marks once Precise axis points exist', () => {
    expect(
      showFourBoundMarks({
        ...cartesian,
        axis_points: [{ id: 'ap-1', pixel: [40, 30], x_value: null, y_value: null }],
      }),
    ).toBe(false)
  })
})
