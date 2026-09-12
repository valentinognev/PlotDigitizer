import { describe, expect, it } from 'vitest'
import { FILTER_MODES } from '../FilterPanel'

describe('FilterPanel modes', () => {
  it('offers sample in the mode select', () => {
    expect(FILTER_MODES).toContain('sample')
  })
})
