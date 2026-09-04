import { describe, expect, it } from 'vitest'
import { connectAsToPlotlyMode } from '../previewChart'

describe('connectAsToPlotlyMode', () => {
  it('uses markers only for scatter and lines+markers for line/default', () => {
    expect(connectAsToPlotlyMode('scatter')).toBe('markers')
    expect(connectAsToPlotlyMode('line')).toBe('lines+markers')
    expect(connectAsToPlotlyMode(undefined)).toBe('lines+markers')
  })
})
