import { describe, expect, it } from 'vitest'
import {
  appendAxisPoint,
  axesCheckerVisible,
  formatModelLabel,
  formatResolution,
  setScaleBarPixel,
} from '../axesChecker'
import { axesCheckerPolyline } from '../transform2d'
import { createEmptyCalibration } from '../calibration'
import type { Calibration } from '../../types'

const empty = (): Calibration => createEmptyCalibration(800, 600)

describe('axesCheckerVisible', () => {
  it('hides when the toggle is off', () => {
    expect(axesCheckerVisible(false, 0, 1000)).toBe(false)
  })
  it('shows for 3 seconds after a change', () => {
    expect(axesCheckerVisible(true, 1000, 2500, 3000)).toBe(true)
    expect(axesCheckerVisible(true, 1000, 4000, 3000)).toBe(false)
  })
})

describe('formatModelLabel', () => {
  it('labels resolved models', () => {
    expect(formatModelLabel('affine')).toBe('affine')
    expect(formatModelLabel('orthogonal')).toBe('orthogonal')
    expect(formatModelLabel('projective')).toBe('projective')
    expect(formatModelLabel('invalid')).toBe('invalid')
  })
})

describe('formatResolution', () => {
  it('formats cartesian units/px', () => {
    expect(formatResolution([0.025, 0.01], 'cartesian')).toMatch(/0\.025/)
    expect(formatResolution([0.025, 0.01], 'cartesian')).toMatch(/\/px/)
  })
  it('formats polar as θ and R per pixel', () => {
    const text = formatResolution([0.2, 0.01], 'polar')
    expect(text.toLowerCase()).toMatch(/θ|theta/)
  })
})

describe('appendAxisPoint / setScaleBarPixel', () => {
  it('canvas axis-mode click appends a point with empty X/Y for the panel to edit', () => {
    const next = appendAxisPoint(empty(), [120, 80], null, null)
    expect(next.axis_points?.length).toBe(1)
    expect(next.axis_points?.[0].pixel).toEqual([120, 80])
    expect(next.axis_points?.[0].x_value).toBeNull()
    expect(next.axis_points?.[0].y_value).toBeNull()
  })
  it('can append a point that already has values', () => {
    const next = appendAxisPoint(empty(), [120, 80], 1, 2)
    expect(next.axis_points?.[0].x_value).toBe(1)
    expect(next.axis_points?.[0].y_value).toBe(2)
  })
  it('sets scale bar endpoints', () => {
    let cal = setScaleBarPixel(empty(), 'a', [5, 6])
    cal = setScaleBarPixel(cal, 'b', [15, 6])
    expect(cal.scale_bar?.pixel_a).toEqual([5, 6])
    expect(cal.scale_bar?.pixel_b).toEqual([15, 6])
  })
})

describe('axesCheckerPolyline geometry', () => {
  it('returns a closed quad for four-bound cartesian', () => {
    const poly = axesCheckerPolyline(empty(), [800, 600])
    expect(poly.length).toBeGreaterThanOrEqual(4)
    expect(poly[0][0]).toBeCloseTo(poly[poly.length - 1][0], 6)
    expect(poly[0][1]).toBeCloseTo(poly[poly.length - 1][1], 6)
  })
})
