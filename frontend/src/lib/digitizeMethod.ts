import type { CanvasMode } from '../types'

export type DigitizeMethod = 'auto' | 'curves'

export const DEFAULT_DIGITIZE_METHOD: DigitizeMethod = 'curves'

export const DIGITIZE_METHOD_TABS: { id: DigitizeMethod; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'curves', label: 'Curves' },
]

export type DigitizeMethodChrome = {
  showAutoDigitize: boolean
  showCurveList: boolean
}

export function digitizeMethodChrome(method: DigitizeMethod): DigitizeMethodChrome {
  if (method === 'auto') {
    return { showAutoDigitize: true, showCurveList: false }
  }
  return { showAutoDigitize: false, showCurveList: true }
}

export const AUTO_EXCLUSIVE_MODES: readonly CanvasMode[] = [
  'segment-fill',
  'point-match',
  'mask-box',
  'mask-pen',
  'mask-erase',
]

export const CURVES_EXCLUSIVE_MODES: readonly CanvasMode[] = ['place']

const EXCLUSIVE_BY_METHOD: Record<DigitizeMethod, readonly CanvasMode[]> = {
  auto: AUTO_EXCLUSIVE_MODES,
  curves: CURVES_EXCLUSIVE_MODES,
}

export function canvasModeAllowedOnDigitizeMethod(
  method: DigitizeMethod,
  mode: CanvasMode,
): CanvasMode {
  if (EXCLUSIVE_BY_METHOD[method].includes(mode)) return mode
  for (const [other, modes] of Object.entries(EXCLUSIVE_BY_METHOD) as [
    DigitizeMethod,
    readonly CanvasMode[],
  ][]) {
    if (other !== method && modes.includes(mode)) return 'select'
  }
  return mode
}
