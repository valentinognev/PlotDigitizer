import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import {
  defaultXStepFromCalibration,
  sampleDxDisabled,
  sampleXStepReady,
  xStepSeedKey,
} from '../xStepDefaults'

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

describe('sampleXStepReady', () => {
  it('requires a strictly positive delx', () => {
    expect(sampleXStepReady(0, 10, 1)).toBe(true)
    expect(sampleXStepReady(0, 10, 0)).toBe(false)
    expect(sampleXStepReady(0, 10, -1)).toBe(false)
    expect(sampleXStepReady(Number.NaN, 10, 1)).toBe(false)
  })
})

describe('sampleDxDisabled', () => {
  it('stays enabled when sampleReady even if axis bounds cannot be inferred', () => {
    expect(sampleDxDisabled({ busy: false, disabled: false, sampleReady: true })).toBe(false)
  })

  it('disables while busy, the panel is disabled, or xmin/xmax/delx are not ready', () => {
    expect(sampleDxDisabled({ busy: true, disabled: false, sampleReady: true })).toBe(true)
    expect(sampleDxDisabled({ busy: false, disabled: true, sampleReady: true })).toBe(true)
    expect(sampleDxDisabled({ busy: false, disabled: false, sampleReady: false })).toBe(true)
  })
})

describe('xStepSeedKey', () => {
  it('is stable for equal numeric bounds even when the object identity changes', () => {
    const a = { xmin: 0, xmax: 10, delx: 1 }
    const b = { xmin: 0, xmax: 10, delx: 1 }
    expect(xStepSeedKey(a)).toBe(xStepSeedKey(b))
    expect(xStepSeedKey(a)).not.toBe(xStepSeedKey({ xmin: 1, xmax: 10, delx: 1 }))
    expect(xStepSeedKey(null)).toBeNull()
  })
})
