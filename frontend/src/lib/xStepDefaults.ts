import type { Calibration } from '../types'
import { getAxisBounds, isCalibrationValid } from './transform'

export function defaultXStepFromCalibration(
  cal: Calibration | null,
): { xmin: number; xmax: number; delx: number } | null {
  if (!isCalibrationValid(cal) || !cal) return null
  const bounds = getAxisBounds(cal)
  if (!bounds) return null
  const xmin = bounds.xmin.value
  const xmax = bounds.xmax.value
  const span = xmax - xmin
  const delx = Number.isFinite(span) && span !== 0 ? span / 10 : 1
  return { xmin, xmax, delx }
}
