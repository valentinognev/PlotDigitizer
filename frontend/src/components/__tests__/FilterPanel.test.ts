import { describe, expect, it } from 'vitest'
import { FILTER_MODES, filterModePatch } from '../FilterPanel'

describe('FilterPanel modes', () => {
  it('offers sample in the mode select', () => {
    expect(FILTER_MODES).toContain('sample')
  })

  it('sets high to 0.12 when switching to sample', () => {
    const next = filterModePatch(
      { mode: 'intensity', low: 0, high: 0.4, sample_color: '#ff0000' },
      'sample',
    )
    expect(next.mode).toBe('sample')
    expect(next.high).toBe(0.12)
    expect(next.sample_color).toBe('#ff0000')
  })
})

