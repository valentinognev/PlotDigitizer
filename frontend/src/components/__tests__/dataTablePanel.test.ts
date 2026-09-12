import { describe, expect, it } from 'vitest'
import { formatNumber } from '../../lib/dataTable'
import { formatDigits } from '../DataTablePanel'

describe('formatDigits', () => {
  it('clamps precision digits so formatNumber does not throw at 0', () => {
    expect(formatDigits(0, 'precision')).toBe(1)
    expect(() => formatNumber(1.23, formatDigits(0, 'precision'), 'precision')).not.toThrow()
    expect(formatDigits(0, 'fixed')).toBe(0)
    expect(formatDigits(0, 'exponential')).toBe(0)
    expect(formatDigits(22, 'precision')).toBe(21)
  })
})
