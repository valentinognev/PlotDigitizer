import { describe, expect, it } from 'vitest'
import { moveCurve } from '../curves'
import type { Curve } from '../../types'

function curve(id: string): Curve {
  return { id, label: id, color: '#000', style: 'unknown', visible: true, points: [] }
}

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
