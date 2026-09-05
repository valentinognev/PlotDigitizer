import { describe, expect, it } from 'vitest'
import { imageSourceLabel } from '../imageSource'
import type { ImageSource } from '../../types'

describe('imageSourceLabel', () => {
  it('reports no image when source is missing', () => {
    expect(imageSourceLabel(null)).toBe('No image loaded')
    expect(imageSourceLabel(undefined)).toBe('No image loaded')
  })

  it('uses filename when no path is stored', () => {
    const source: ImageSource = { filename: 'plot.png' }
    expect(imageSourceLabel(source)).toBe('plot.png')
  })

  it('prefers a stored path over filename', () => {
    const source: ImageSource = { filename: 'plot.png', path: '/data/plot.png' }
    expect(imageSourceLabel(source)).toBe('/data/plot.png')
  })

  it('falls back to filename when path is blank', () => {
    const source: ImageSource = { filename: 'plot.png', path: '   ' }
    expect(imageSourceLabel(source)).toBe('plot.png')
  })

  it('reports no image when both path and filename are blank', () => {
    const source: ImageSource = { filename: '', path: '' }
    expect(imageSourceLabel(source)).toBe('No image loaded')
  })
})
