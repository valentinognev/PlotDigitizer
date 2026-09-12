import { describe, expect, it } from 'vitest'
import { addPoint, nextBarPointLabel } from '../sessionPatch'
import type { Curve, Session } from '../../types'

function session(curves: Curve[]): Session {
  return {
    id: 's1',
    image_meta: { width: 100, height: 100, scale_factor: 1 },
    calibration: null,
    curves,
    history: [],
    image_url: '/img',
    figure: { title: '', xlabel: '', ylabel: '' },
  }
}

describe('nextBarPointLabel', () => {
  it('defaults to Bar N using 1-based count', () => {
    expect(nextBarPointLabel(0)).toBe('Bar 1')
    expect(nextBarPointLabel(2)).toBe('Bar 3')
  })
})

describe('addPoint', () => {
  it('stores the optional bar label on the new point', () => {
    const current = session([
      {
        id: 'c1',
        label: 'A',
        color: '#f00',
        style: 'unknown',
        visible: true,
        points: [],
      },
    ])
    const next = addPoint(current, 'c1', [10, 20], nextBarPointLabel(0))
    expect(next.curves[0].points[0].label).toBe('Bar 1')
    expect(next.curves[0].points[0].pixel).toEqual([10, 20])
  })
})
