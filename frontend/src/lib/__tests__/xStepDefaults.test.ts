import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import { defaultXStepFromCalibration } from '../xStepDefaults'

const linearCal: Calibration = {
  x: {
    scale: 'linear',
    ref_points: [
      { pixel: [100, 400], value: 0 },
      { pixel: [500, 400], value: 10 },
    ],
  },
  y: {
    scale: 'linear',
    ref_points: [
      { pixel: [100, 400], value: 0 },
      { pixel: [100, 100], value: 5 },
    ],
  },
  source: 'manual',
}

describe('defaultXStepFromCalibration', () => {
  it('uses xmin/xmax from valid calibration bounds and delx as a tenth of the span', () => {
    expect(defaultXStepFromCalibration(linearCal)).toEqual({ xmin: 0, xmax: 10, delx: 1 })
  })

  it('returns null when calibration is missing or invalid', () => {
    expect(defaultXStepFromCalibration(null)).toBeNull()
    expect(
      defaultXStepFromCalibration({
        x: { scale: 'linear', ref_points: [] },
        y: { scale: 'linear', ref_points: [] },
        source: 'manual',
      }),
    ).toBeNull()
  })
})
