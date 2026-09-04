import { describe, expect, it } from 'vitest'
import {
  flattenPolyline,
  formatSeparation,
  nearestSegment,
  type SegmentLite,
} from '../segments'

const horizontal: SegmentLite = {
  index: 0,
  length: 100,
  points: [
    [10, 40],
    [110, 40],
  ],
}

const vertical: SegmentLite = {
  index: 1,
  length: 80,
  points: [
    [200, 10],
    [200, 90],
  ],
}

describe('nearestSegment', () => {
  it('returns the closest segment within maxDistance', () => {
    const hit = nearestSegment([horizontal, vertical], [50, 42], 12)
    expect(hit?.index).toBe(0)
  })

  it('returns null beyond maxDistance', () => {
    expect(nearestSegment([horizontal], [50, 80], 12)).toBeNull()
  })
})

describe('flattenPolyline', () => {
  it('flattens to Konva points', () => {
    expect(flattenPolyline(horizontal.points)).toEqual([10, 40, 110, 40])
  })
})

describe('formatSeparation', () => {
  it('formats whole pixels', () => {
    expect(formatSeparation(25)).toBe('25 px')
    expect(formatSeparation(25.4)).toBe('25 px')
  })
})
