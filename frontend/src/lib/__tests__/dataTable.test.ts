import { describe, expect, it } from 'vitest'
import { formatNumber, rowsFromCurves, sortRows, tableToClipboardText } from '../dataTable'
import type { Calibration, Curve } from '../../types'

const cal: Calibration = {
  x: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }, { pixel: [500, 400], value: 10 }] },
  y: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }, { pixel: [100, 100], value: 5 }] },
  source: 'manual',
}

describe('rowsFromCurves', () => {
  it('maps visible curve pixels to data rows and skips hidden curves', () => {
    const curves: Curve[] = [
      { id: 'c1', label: 'A', color: '#f00', style: 'solid', visible: true, points: [{ id: 'p1', pixel: [300, 250], origin: 'user' }] },
      { id: 'c2', label: 'B', color: '#0f0', style: 'solid', visible: false, points: [{ id: 'p2', pixel: [300, 250], origin: 'user' }] },
    ]
    const rows = rowsFromCurves(curves, [cal], cal)
    expect(rows).toHaveLength(1)
    expect(rows[0].curveLabel).toBe('A')
    expect(rows[0].a).toBeCloseTo(5, 12)
    expect(rows[0].b).toBeCloseTo(2.5, 12)
    expect(rows[0].aLabel).toBe('x')
    expect(rows[0].bLabel).toBe('y')
  })

  it('uses theta and R labels for polar calibration', () => {
    const polar: Calibration = {
      ...cal,
      coords_type: 'polar',
      theta_units: 'degrees',
      origin_radius: 0,
      axis_points: [
        { id: 'a', pixel: [100, 100], x_value: 0, y_value: 0 },
        { id: 'b', pixel: [180, 100], x_value: 0, y_value: 10 },
        { id: 'c', pixel: [100, 20], x_value: 90, y_value: 10 },
      ],
    }
    const curves: Curve[] = [
      { id: 'c1', label: 'A', color: '#f00', style: 'solid', visible: true, points: [{ id: 'p1', pixel: [180, 100], origin: 'user' }] },
    ]
    const rows = rowsFromCurves(curves, [polar], polar)
    expect(rows).toHaveLength(1)
    expect(rows[0].aLabel).toBe('theta')
    expect(rows[0].bLabel).toBe('R')
  })

  it('skips points when pixelToData throws', () => {
    const invalid: Calibration = {
      x: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }] },
      y: { scale: 'linear', ref_points: [{ pixel: [100, 400], value: 0 }] },
      source: 'manual',
    }
    const curves: Curve[] = [
      { id: 'c1', label: 'A', color: '#f00', style: 'solid', visible: true, points: [{ id: 'p1', pixel: [300, 250], origin: 'user' }] },
    ]
    expect(rowsFromCurves(curves, [invalid], invalid)).toEqual([])
  })

  it('maps each curve through calibrationForCurve, not the panel singleton', () => {
    const left: Calibration = {
      ...cal,
      id: 'cal-left',
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [100, 400], value: 0 },
          { pixel: [100, 100], value: 10 },
        ],
      },
    }
    const right: Calibration = {
      ...cal,
      id: 'cal-right',
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [100, 400], value: 0 },
          { pixel: [100, 100], value: 100 },
        ],
      },
    }
    const curves: Curve[] = [
      {
        id: 'c1',
        label: 'A',
        color: '#f00',
        style: 'solid',
        visible: true,
        calibration_id: 'cal-right',
        points: [{ id: 'p1', pixel: [100, 100], origin: 'user' }],
      },
    ]
    const rows = rowsFromCurves(curves, [left, right], left)
    expect(rows).toHaveLength(1)
    expect(rows[0].b).toBeCloseTo(100, 12)
  })

  it('formats date cells as YYYY/MM/DD', () => {
    const dateCal: Calibration = {
      ...cal,
      x: {
        scale: 'date',
        ref_points: [
          { pixel: [100, 400], value: 18262 },
          { pixel: [500, 400], value: 18290 },
        ],
      },
    }
    const curves: Curve[] = [
      {
        id: 'c1',
        label: 'A',
        color: '#f00',
        style: 'solid',
        visible: true,
        points: [{ id: 'p1', pixel: [300, 250], origin: 'user' }],
      },
    ]
    const rows = rowsFromCurves(curves, [dateCal], dateCal)
    expect(rows).toHaveLength(1)
    expect(rows[0].aText).toBe('2020/01/15')
  })

  it('uses label and value for bar rows', () => {
    const bar: Calibration = {
      source: 'manual',
      coords_type: 'bar',
      x: { scale: 'linear', ref_points: [] },
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [50, 100], value: 0 },
          { pixel: [50, 0], value: 10 },
        ],
      },
    }
    const curves: Curve[] = [
      {
        id: 'c1',
        label: 'A',
        color: '#f00',
        style: 'solid',
        visible: true,
        points: [{ id: 'p1', pixel: [50, 50], origin: 'user', label: 'Bar 1' }],
      },
    ]
    const rows = rowsFromCurves(curves, [bar], bar)
    expect(rows).toHaveLength(1)
    expect(rows[0].aLabel).toBe('label')
    expect(rows[0].bLabel).toBe('value')
    expect(rows[0].a).toBe('Bar 1')
    expect(rows[0].b).toBeCloseTo(5, 12)
  })
})

describe('sortRows / formatNumber / tableToClipboardText', () => {
  it('sorts by a descending and formats clipboard text', () => {
    const rows = [
      { curveId: 'c', curveLabel: 'A', pointId: '1', a: 2, b: 1, aLabel: 'x', bLabel: 'y' },
      { curveId: 'c', curveLabel: 'A', pointId: '2', a: 5, b: 0, aLabel: 'x', bLabel: 'y' },
    ]
    const sorted = sortRows(rows, 'a', 'desc')
    expect(sorted.map((r) => r.a)).toEqual([5, 2])
    expect(formatNumber(1.23456, 3, 'fixed')).toBe('1.235')
    expect(formatNumber(1234, 3, 'exponential')).toBe('1.234e+3')
    expect(tableToClipboardText(sorted, ', ')).toBe('curve, x, y\nA, 5, 0\nA, 2, 1')
  })
})
