import type { Curve } from '../types'

export function firstVisibleCurve(curves: Curve[]): Curve | undefined {
  return curves.find((c) => c.visible)
}
