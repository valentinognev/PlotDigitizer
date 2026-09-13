import { describe, expect, it } from 'vitest'
import { FIGURE_FIELD_KEYS, FIGURE_FIELD_LABELS } from '../figureFields'

describe('figure field copy', () => {
  it('keeps title, xlabel, ylabel in that order', () => {
    expect(FIGURE_FIELD_KEYS).toEqual(['title', 'xlabel', 'ylabel'])
    expect(FIGURE_FIELD_LABELS).toEqual({
      title: 'Figure title',
      xlabel: 'xlabel',
      ylabel: 'ylabel',
    })
  })
})
