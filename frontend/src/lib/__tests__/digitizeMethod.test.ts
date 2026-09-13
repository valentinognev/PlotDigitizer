import { describe, expect, it } from 'vitest'
import { DIGITIZE_EXCLUSIVE_MODES } from '../workflowStage'
import {
  AUTO_EXCLUSIVE_MODES,
  CURVES_EXCLUSIVE_MODES,
  DEFAULT_DIGITIZE_METHOD,
  DIGITIZE_METHOD_TABS,
  canvasModeAllowedOnDigitizeMethod,
  digitizeMethodChrome,
} from '../digitizeMethod'

describe('DIGITIZE_METHOD_TABS', () => {
  it('is Auto, Curves in that order', () => {
    expect(DIGITIZE_METHOD_TABS.map((t) => t.id)).toEqual(['auto', 'curves'])
    expect(DIGITIZE_METHOD_TABS.map((t) => t.label)).toEqual(['Auto', 'Curves'])
  })
})

describe('DEFAULT_DIGITIZE_METHOD', () => {
  it('defaults to curves', () => {
    expect(DEFAULT_DIGITIZE_METHOD).toBe('curves')
  })
})

describe('digitizeMethodChrome', () => {
  it('shows only auto digitize on auto', () => {
    expect(digitizeMethodChrome('auto')).toEqual({
      showAutoDigitize: true,
      showCurveList: false,
    })
  })

  it('shows only the curves list on curves', () => {
    expect(digitizeMethodChrome('curves')).toEqual({
      showAutoDigitize: false,
      showCurveList: true,
    })
  })
})

describe('exclusive modes', () => {
  it('splits digitize exclusive modes into auto vs curves with no leftovers', () => {
    expect([...AUTO_EXCLUSIVE_MODES]).toEqual([
      'segment-fill',
      'point-match',
      'mask-box',
      'mask-pen',
      'mask-erase',
    ])
    expect([...CURVES_EXCLUSIVE_MODES]).toEqual(['place'])
    expect(new Set([...AUTO_EXCLUSIVE_MODES, ...CURVES_EXCLUSIVE_MODES])).toEqual(
      new Set(DIGITIZE_EXCLUSIVE_MODES),
    )
  })
})

describe('canvasModeAllowedOnDigitizeMethod', () => {
  it('keeps auto tools on auto and cancels place', () => {
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'mask-pen')).toBe('mask-pen')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'segment-fill')).toBe('segment-fill')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'point-match')).toBe('point-match')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'place')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'select')).toBe('select')
  })

  it('keeps place on curves and cancels auto tools', () => {
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'place')).toBe('place')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'mask-box')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'mask-erase')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'segment-fill')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'point-match')).toBe('select')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'select')).toBe('select')
  })

  it('does not clamp modes that belong to other stages', () => {
    expect(canvasModeAllowedOnDigitizeMethod('auto', 'axis')).toBe('axis')
    expect(canvasModeAllowedOnDigitizeMethod('curves', 'pick-color')).toBe('pick-color')
  })
})
