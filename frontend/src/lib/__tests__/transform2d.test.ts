import { describe, expect, it } from 'vitest'
import vectors from '../__fixtures__/transform-vectors.json'
import { dataToPixel, pixelToData, type Calibration } from '../transform2d'

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
