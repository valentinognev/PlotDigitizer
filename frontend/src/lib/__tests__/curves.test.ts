import { describe, expect, it } from 'vitest'
import { paletteColor } from '../colors'
import { DEFAULT_POINT_COUNT } from '../constants'
import { appendCurve, createEmptyCurve, moveCurve } from '../curves'
import type { Curve } from '../../types'

function curve(id: string): Curve {
  return { id, label: id, color: '#000', style: 'unknown', visible: true, points: [] }
}

describe('createEmptyCurve', () => {
  it('builds Curve N+1 with the palette color for that index', () => {
    expect(createEmptyCurve(0, 'c0')).toEqual({
      id: 'c0',
      label: 'Curve 1',
      color: paletteColor(0),
      style: 'unknown',
      visible: true,
      target_point_count: DEFAULT_POINT_COUNT,
      points: [],
      connect_as: 'line',
    })
    expect(createEmptyCurve(2, 'c2').label).toBe('Curve 3')
  })
})

describe('appendCurve', () => {
  it('appends a curve and reports it as added', () => {
    const existing = [createEmptyCurve(0, 'c0')]
    const { curves, added } = appendCurve(existing, 'c1')
    expect(added.id).toBe('c1')
    expect(added.label).toBe('Curve 2')
    expect(curves.map((c) => c.id)).toEqual(['c0', 'c1'])
    expect(existing).toHaveLength(1)
  })
})

describe('moveCurve', () => {
  it('moves a middle curve up', () => {
    const a = curve('a')
    const b = curve('b')
    const c = curve('c')
    const input = [a, b, c]
    const result = moveCurve(input, 'b', 'up')
    expect(result.map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(result).not.toBe(input)
    expect(input.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('moves a middle curve down', () => {
    const input = [curve('a'), curve('b'), curve('c')]
    const result = moveCurve(input, 'b', 'down')
    expect(result.map((x) => x.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not move the first curve up', () => {
    const input = [curve('a'), curve('b'), curve('c')]
    expect(moveCurve(input, 'a', 'up')).toBe(input)
  })

  it('does not move the last curve down', () => {
    const input = [curve('a'), curve('b'), curve('c')]
    expect(moveCurve(input, 'c', 'down')).toBe(input)
  })

  it('unknown id is a no-op', () => {
    const input = [curve('a'), curve('b'), curve('c')]
    expect(moveCurve(input, 'z', 'up')).toBe(input)
  })
})
