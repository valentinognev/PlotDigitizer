import type { Curve } from '../types'

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
