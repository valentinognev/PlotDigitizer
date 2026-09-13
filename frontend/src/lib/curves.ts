import { paletteColor } from './colors'
import { DEFAULT_POINT_COUNT } from './constants'
import type { Curve } from '../types'

export function createEmptyCurve(index: number, id: string): Curve {
  return {
    id,
    label: `Curve ${index + 1}`,
    color: paletteColor(index),
    style: 'unknown',
    visible: true,
    target_point_count: DEFAULT_POINT_COUNT,
    points: [],
    connect_as: 'line',
  }
}

export function appendCurve(
  curves: Curve[],
  id: string,
): { curves: Curve[]; added: Curve } {
  const added = createEmptyCurve(curves.length, id)
  return { curves: [...curves, added], added }
}

export function firstVisibleCurve(curves: Curve[]): Curve | undefined {
  return curves.find((c) => c.visible)
}

export function moveCurve(
  curves: Curve[],
  id: string,
  direction: 'up' | 'down',
): Curve[] {
  const index = curves.findIndex((c) => c.id === id)
  if (index < 0) return curves
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= curves.length) return curves
  const next = curves.slice()
  ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
  return next
}
