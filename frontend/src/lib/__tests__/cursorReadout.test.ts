import { describe, expect, it } from 'vitest'
import { formatCursorReadout } from '../cursorReadout'

describe('formatCursorReadout', () => {
  it('shows pixel only when data is null', () => {
    expect(formatCursorReadout([12.4, 8.6], null, 'cartesian')).toBe('px 12.4, 8.6')
  })
  it('appends x,y for cartesian and theta/R for polar', () => {
    expect(formatCursorReadout([10, 20], [1.5, 2.25], 'cartesian')).toBe(
      'px 10.0, 20.0  ·  x 1.5  y 2.25',
    )
    expect(formatCursorReadout([10, 20], [45, 3], 'polar')).toBe(
      'px 10.0, 20.0  ·  θ 45  R 3',
    )
    expect(formatCursorReadout([10, 20], [5, 0], 'bar')).toBe(
      'px 10.0, 20.0  ·  value 5',
    )
  })
})
