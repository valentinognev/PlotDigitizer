import { describe, expect, it } from 'vitest'
import { shouldHandleNudgeKey } from '../nudge'

function el(tagName: string, extra: Record<string, unknown> = {}): EventTarget {
  return { tagName, ...extra } as unknown as EventTarget
}

describe('shouldHandleNudgeKey', () => {
  it('returns null when nothing is selected', () => {
    expect(
      shouldHandleNudgeKey({ key: 'ArrowRight', shiftKey: false, target: el('BODY') }, 0),
    ).toBeNull()
  })

  it('returns null when the target is an input', () => {
    expect(
      shouldHandleNudgeKey({ key: 'ArrowRight', shiftKey: false, target: el('INPUT') }, 1),
    ).toBeNull()
  })

  it('returns the arrow delta when a point is selected', () => {
    expect(
      shouldHandleNudgeKey({ key: 'ArrowRight', shiftKey: false, target: el('BODY') }, 1),
    ).toEqual([1, 0])
  })

  it('returns null for textarea, select, and contenteditable targets', () => {
    expect(
      shouldHandleNudgeKey({ key: 'ArrowLeft', shiftKey: false, target: el('TEXTAREA') }, 1),
    ).toBeNull()
    expect(
      shouldHandleNudgeKey({ key: 'ArrowUp', shiftKey: false, target: el('SELECT') }, 1),
    ).toBeNull()
    expect(
      shouldHandleNudgeKey(
        { key: 'ArrowDown', shiftKey: false, target: el('DIV', { isContentEditable: true }) },
        1,
      ),
    ).toBeNull()
  })
})
