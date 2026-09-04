import { describe, expect, it } from 'vitest'
import {
  displayMax,
  displayToNorm,
  maskPreviewUrl,
  normToDisplay,
  previewFilterFromHex,
} from '../colorFilter'

describe('colorFilter helpers', () => {
  it('maps intensity 0..1 to 0..100 display', () => {
    expect(displayMax('intensity')).toBe(100)
    expect(normToDisplay('intensity', 0.4)).toBeCloseTo(40)
    expect(displayToNorm('intensity', 50)).toBeCloseTo(0.5)
  })

  it('maps hue 0..1 to 0..360 display', () => {
    expect(displayMax('hue')).toBe(360)
    expect(normToDisplay('hue', 0.5)).toBeCloseTo(180)
    expect(displayToNorm('hue', 36)).toBeCloseTo(0.1)
  })

  it('builds a cache-busted mask URL', () => {
    expect(maskPreviewUrl('abc', 'curve-1', 4)).toBe(
      '/sessions/abc/mask?curve_id=curve-1&rev=4',
    )
    expect(maskPreviewUrl('abc', 'curve-1', 4, 'hue:0.1')).toBe(
      '/sessions/abc/mask?curve_id=curve-1&rev=4&stamp=hue%3A0.1',
    )
  })

  it('previews hue mode for saturated hex and intensity for gray', () => {
    expect(previewFilterFromHex('#0000ff').mode).toBe('hue')
    expect(previewFilterFromHex('#0000ff').sample_color).toBe('#0000ff')
    expect(previewFilterFromHex('#777777').mode).toBe('intensity')
  })
})
