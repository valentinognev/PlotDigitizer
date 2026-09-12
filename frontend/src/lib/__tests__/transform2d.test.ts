import { describe, expect, it } from 'vitest'
import vectors from '../__fixtures__/transform-vectors.json'
import {
  axesCheckerPolyline,
  barPixelToValue,
  calibrationError,
  dataToPixel,
  isCalibrationValid,
  pixelToData,
  resolvedModel,
  validateCalibration,
  type Calibration,
} from '../transform2d'

type Case = {
  name: string
  pixel: [number, number]
  data: [number, number]
  calibration: Calibration
}

describe('transform2d parity with Python', () => {
  it('agrees to 1e-9 on every fixture vector', () => {
    const cases = (vectors as unknown as { cases: Case[] }).cases
    expect(cases.length).toBeGreaterThanOrEqual(6)
    for (const c of cases) {
      const got = pixelToData(c.calibration, c.pixel)
      expect(got[0], c.name + ' x').toBeCloseTo(c.data[0], 9)
      expect(got[1], c.name + ' y').toBeCloseTo(c.data[1], 9)
      const back = dataToPixel(c.calibration, got)
      expect(back[0], c.name + ' px').toBeCloseTo(c.pixel[0], 6)
      expect(back[1], c.name + ' py').toBeCloseTo(c.pixel[1], 6)
    }
  })
})

function linearZeroMin(): Calibration {
  return {
    source: 'manual',
    coords_type: 'cartesian',
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [100, 400], value: 0 },
        { pixel: [500, 400], value: 1 },
      ],
    },
    y: {
      scale: 'linear',
      ref_points: [
        { pixel: [100, 400], value: 0 },
        { pixel: [100, 100], value: 2 },
      ],
    },
  }
}

describe('log scale with non-positive bounds', () => {
  it('is invalid and names the log requirement when xmin is 0', () => {
    const cal: Calibration = {
      ...linearZeroMin(),
      x: { ...linearZeroMin().x, scale: 'log' },
      y: { ...linearZeroMin().y, scale: 'log' },
    }
    expect(isCalibrationValid(cal)).toBe(false)
    const err = calibrationError(cal)
    expect(err).not.toBeNull()
    expect(err!.message).toMatch(/log scale requires all reference values > 0/i)
    expect(err!.hint).toMatch(/greater than zero/i)
  })

  it('stays valid when log bounds are positive', () => {
    const cal: Calibration = {
      source: 'manual',
      coords_type: 'cartesian',
      x: {
        scale: 'log',
        ref_points: [
          { pixel: [100, 400], value: 1 },
          { pixel: [500, 400], value: 10 },
        ],
      },
      y: {
        scale: 'log',
        ref_points: [
          { pixel: [100, 400], value: 1 },
          { pixel: [100, 100], value: 10 },
        ],
      },
    }
    expect(isCalibrationValid(cal)).toBe(true)
    expect(calibrationError(cal)).toBeNull()
  })
})

describe('log and date on the same axis', () => {
  it('is rejected by validateCalibration', () => {
    const cal: Calibration = {
      source: 'manual',
      coords_type: 'cartesian',
      x: {
        scale: 'log+date' as Calibration['x']['scale'],
        ref_points: [
          { pixel: [100, 400], value: 1 },
          { pixel: [500, 400], value: 10 },
        ],
      },
      y: linearZeroMin().y,
    }
    expect(isCalibrationValid(cal)).toBe(false)
    const err = calibrationError(cal)
    expect(err).not.toBeNull()
    expect(err!.message).toMatch(/Log and date/)
  })
})

describe('axesCheckerPolyline log-polar inner ring', () => {
  it('uses min pinned R>0 when origin_radius is 0 (Python policy)', () => {
    const cal: Calibration = {
      source: 'manual',
      coords_type: 'polar',
      model: 'affine',
      theta_units: 'degrees',
      origin_radius: 0,
      x: { scale: 'linear', ref_points: [] },
      y: { scale: 'log', ref_points: [] },
      axis_points: [
        { id: 'o', pixel: [200, 200], x_value: 0, y_value: 1 },
        { id: 'a', pixel: [280, 200], x_value: 0, y_value: 100 },
        { id: 'b', pixel: [200, 120], x_value: 90, y_value: 100 },
      ],
    }
    const poly = axesCheckerPolyline(cal, [400, 400])
    expect(poly.length).toBeGreaterThan(0)
    const n = 32
    const rInner = 1
    const t1 = 90
    const expected = dataToPixel(cal, [t1, rInner])
    expect(poly[n + 1][0]).toBeCloseTo(expected[0], 6)
    expect(poly[n + 1][1]).toBeCloseTo(expected[1], 6)
  })
})

function barCal(overrides: Partial<Calibration> = {}): Calibration {
  return {
    source: 'manual',
    coords_type: 'bar',
    bar_horizontal: false,
    x: { scale: 'linear', ref_points: [] },
    y: {
      scale: 'linear',
      ref_points: [
        { pixel: [50, 100], value: 0 },
        { pixel: [50, 0], value: 10 },
      ],
    },
    ...overrides,
  }
}

describe('bar coordinate adapter', () => {
  it('maps the linear midpoint pixel to value 5', () => {
    expect(barPixelToValue(barCal(), [50, 50])).toBeCloseTo(5, 12)
  })

  it('maps the log midpoint pixel to 10', () => {
    const cal = barCal({
      y: {
        scale: 'log',
        ref_points: [
          { pixel: [50, 100], value: 1 },
          { pixel: [50, 0], value: 100 },
        ],
      },
    })
    expect(barPixelToValue(cal, [50, 50])).toBeCloseTo(10, 12)
  })

  it('pixelToData returns (value, 0.0) for vertical and horizontal bars', () => {
    const vertical = pixelToData(barCal(), [50, 50])
    expect(vertical[0]).toBeCloseTo(5, 12)
    expect(vertical[1]).toBeCloseTo(0, 12)

    const horizontal = pixelToData(
      barCal({
        bar_horizontal: true,
        y: {
          scale: 'linear',
          ref_points: [
            { pixel: [100, 50], value: 0 },
            { pixel: [0, 50], value: 10 },
          ],
        },
      }),
      [50, 50],
    )
    expect(horizontal[0]).toBeCloseTo(5, 12)
    expect(horizontal[1]).toBeCloseTo(0, 12)
  })

  it('projects an off-axis pixel onto the value line', () => {
    expect(barPixelToValue(barCal(), [80, 50])).toBeCloseTo(5, 12)
  })

  it('round-trips dataToPixel along the value axis', () => {
    const back = dataToPixel(barCal(), [5, 0])
    expect(back[0]).toBeCloseTo(50, 6)
    expect(back[1]).toBeCloseTo(50, 6)
  })

  it('validateCalibration rejects fewer than two y ref points', () => {
    const cal = barCal({
      y: { scale: 'linear', ref_points: [{ pixel: [50, 100], value: 0 }] },
    })
    expect(isCalibrationValid(cal)).toBe(false)
    expect(() => validateCalibration(cal)).toThrow(/value-axis/)
  })

  it('validateCalibration rejects coincident value-axis pixels', () => {
    const cal = barCal({
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [50, 50], value: 0 },
          { pixel: [50, 50], value: 10 },
        ],
      },
    })
    expect(isCalibrationValid(cal)).toBe(false)
    expect(() => validateCalibration(cal)).toThrow(/distinct/)
  })

  it('resolvedModel does not require cartesian x refs', () => {
    expect(resolvedModel(barCal())).toBe('orthogonal')
  })

  it('axesCheckerPolyline draws the value-axis segment', () => {
    const poly = axesCheckerPolyline(barCal(), [100, 100])
    expect(poly[0]).toEqual([50, 100])
    expect(poly[1]).toEqual([50, 0])
  })
})
