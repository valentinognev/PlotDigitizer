import { describe, expect, it } from 'vitest'
import {
  addBox,
  boxFromDrag,
  clear,
  isMaskCanvasMode,
  pushPointToLastStroke,
} from '../regionMask'
import type { RegionMask } from '../../types'

const empty: RegionMask = { boxes: [], strokes: [], erase_strokes: [] }

describe('addBox', () => {
  it('appends a box without mutating the original region', () => {
    const region: RegionMask = { boxes: [{ x: 1, y: 2, w: 3, h: 4 }], strokes: [], erase_strokes: [] }
    const next = addBox(region, { x: 10, y: 20, w: 5, h: 6 })
    expect(next.boxes).toEqual([
      { x: 1, y: 2, w: 3, h: 4 },
      { x: 10, y: 20, w: 5, h: 6 },
    ])
    expect(region.boxes).toEqual([{ x: 1, y: 2, w: 3, h: 4 }])
  })

  it('starts from an empty region when given null', () => {
    expect(addBox(null, { x: 0, y: 0, w: 8, h: 2 })).toEqual({
      boxes: [{ x: 0, y: 0, w: 8, h: 2 }],
      strokes: [],
      erase_strokes: [],
    })
  })
})

describe('boxFromDrag', () => {
  it('normalizes a drag in any direction to a positive RegionBox', () => {
    expect(boxFromDrag([10, 20], [4, 8])).toEqual({ x: 4, y: 8, w: 6, h: 12 })
  })
})

describe('pushPointToLastStroke', () => {
  it('starts a pen stroke when none exists', () => {
    const next = pushPointToLastStroke(empty, 'pen', [3, 4])
    expect(next.strokes).toEqual([[[3, 4]]])
    expect(next.erase_strokes).toEqual([])
    expect(empty.strokes).toEqual([])
  })

  it('appends to the last pen stroke', () => {
    const started = pushPointToLastStroke(empty, 'pen', [0, 0])
    const next = pushPointToLastStroke(started, 'pen', [5, 1])
    expect(next.strokes).toEqual([
      [
        [0, 0],
        [5, 1],
      ],
    ])
  })

  it('keeps erase strokes on a separate list', () => {
    const withPen = pushPointToLastStroke(empty, 'pen', [1, 1])
    const withErase = pushPointToLastStroke(withPen, 'erase', [9, 9])
    expect(withErase.strokes).toEqual([[[1, 1]]])
    expect(withErase.erase_strokes).toEqual([[[9, 9]]])
  })

  it('starts a new stroke after an empty polyline is pushed (pointer down)', () => {
    const afterDown: RegionMask = { boxes: [], strokes: [[]], erase_strokes: [] }
    const next = pushPointToLastStroke(afterDown, 'pen', [2, 3])
    expect(next.strokes).toEqual([[[2, 3]]])
  })
})

describe('clear', () => {
  it('returns empty boxes and strokes so the rasterizer stays full white', () => {
    const dirty: RegionMask = {
      boxes: [{ x: 1, y: 1, w: 2, h: 2 }],
      strokes: [[[0, 0], [1, 1]]],
      erase_strokes: [[[4, 4]]],
      stroke_width: 20,
    }
    expect(clear(dirty)).toEqual({ boxes: [], strokes: [], erase_strokes: [] })
  })
})

describe('isMaskCanvasMode', () => {
  it('recognizes the three mask drawing modes', () => {
    expect(isMaskCanvasMode('mask-box')).toBe(true)
    expect(isMaskCanvasMode('mask-pen')).toBe(true)
    expect(isMaskCanvasMode('mask-erase')).toBe(true)
    expect(isMaskCanvasMode('select')).toBe(false)
    expect(isMaskCanvasMode('place')).toBe(false)
  })
})
