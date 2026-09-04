/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import { formatAxisValue, getAxisBounds, pixelToData } from '../transform'
import { solveTransform, type Constraint } from '../transform2d'

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

describe('pixelToData (orthogonal, existing mapping)', () => {
  it('maps the midpoint of the linear fixture', () => {
    const data = pixelToData(linearCal, [300, 250])
    expect(data[0]).toBeCloseTo(5, 12)
    expect(data[1]).toBeCloseTo(2.5, 12)
  })

  it('maps log X the same way as 10 ** (slope * px + intercept)', () => {
    const cal: Calibration = {
      x: {
        scale: 'log',
        ref_points: [
          { pixel: [100, 400], value: 1 },
          { pixel: [500, 400], value: 100 },
        ],
      },
      y: linearCal.y,
      source: 'manual',
    }
    const data = pixelToData(cal, [300, 250])
    expect(data[0]).toBeCloseTo(10, 12)
    expect(data[1]).toBeCloseTo(2.5, 12)
  })
})

describe('getAxisBounds / formatAxisValue', () => {
  it('returns extreme-pixel bounds', () => {
    const bounds = getAxisBounds(linearCal)
    expect(bounds).not.toBeNull()
    expect(bounds!.xmin.value).toBe(0)
    expect(bounds!.xmax.value).toBe(10)
    expect(bounds!.ymin.value).toBe(0)
    expect(bounds!.ymax.value).toBe(5)
  })

  it('formats numbers without throwing', () => {
    expect(formatAxisValue(12.5)).toBe('12.5')
    expect(formatAxisValue(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('Python ↔ TS orthogonal parity fixture', () => {
  it('agrees with committed vectors to 1e-9', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const fixturePath = join(here, '..', '__fixtures__', 'transform-vectors.json')
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      cases: Array<{
        name: string
        calibration: Calibration
        pixel: [number, number]
        data: [number, number]
        samples?: Array<{ pixel: [number, number]; data: [number, number] }>
      }>
    }
    expect(payload.cases.length).toBeGreaterThan(0)
    for (const cse of payload.cases) {
      const samples = cse.samples ?? [{ pixel: cse.pixel, data: cse.data }]
      for (const sample of samples) {
        const got = pixelToData(cse.calibration, sample.pixel)
        expect(got[0], cse.name).toBeCloseTo(sample.data[0], 9)
        expect(got[1], cse.name).toBeCloseTo(sample.data[1], 9)
      }
    }
  })
})

function applyH(H: number[][], pixel: [number, number]): [number, number] {
  const w = H[2][0] * pixel[0] + H[2][1] * pixel[1] + H[2][2]
  return [
    (H[0][0] * pixel[0] + H[0][1] * pixel[1] + H[0][2]) / w,
    (H[1][0] * pixel[0] + H[1][1] * pixel[1] + H[1][2]) / w,
  ]
}

describe('solveTransform projective (Python 9a5faa5 parity)', () => {
  it('auto keeps projective when fifth point is on an edge', () => {
    const H = [
      [1.2, 0.15, 4.0],
      [-0.08, 0.9, 3.0],
      [0.0004, -0.0003, 1.0],
    ]
    const corners: [number, number][] = [
      [0.0, 0.0],
      [200.0, 0.0],
      [0.0, 180.0],
      [200.0, 180.0],
    ]
    const pixels = [...corners, [100.0, 0.0] as [number, number]]
    const constraints: Constraint[] = []
    for (const p of pixels) {
      const [u, v] = applyH(H, p)
      constraints.push({ pixel: p, axis: 'u', value: u })
      constraints.push({ pixel: p, axis: 'v', value: v })
    }
    const t = solveTransform(constraints, 'auto')
    expect(t.model).toBe('projective')
    for (const p of corners) {
      const got = applyH(t.matrix, p)
      const exp = applyH(H, p)
      expect(got[0]).toBeCloseTo(exp[0], 9)
      expect(got[1]).toBeCloseTo(exp[1], 9)
    }
  })
})
