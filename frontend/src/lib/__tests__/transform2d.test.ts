import { describe, expect, it } from 'vitest'
import vectors from '../__fixtures__/transform-vectors.json'
import { axesCheckerPolyline, dataToPixel, pixelToData, type Calibration } from '../transform2d'

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
