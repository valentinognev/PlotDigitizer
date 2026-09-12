import type { Calibration } from '../types'
import { getAxisBounds, isCalibrationValid } from './transform'

export type XStepDefaults = { xmin: number; xmax: number; delx: number }

export function defaultXStepFromCalibration(cal: Calibration | null): XStepDefaults | null {
  if (!isCalibrationValid(cal) || !cal) return null
  const bounds = getAxisBounds(cal)
  if (!bounds) return null
  const xmin = bounds.xmin.value
  const xmax = bounds.xmax.value
  const span = xmax - xmin
  const delx = Number.isFinite(span) && span !== 0 ? span / 10 : 1
  return { xmin, xmax, delx }
}

/** Sample Δx is ready from typed finite xmin/xmax and strictly positive delx. */
export function sampleXStepReady(xmin: number, xmax: number, delx: number): boolean {
  return Number.isFinite(xmin) && Number.isFinite(xmax) && Number.isFinite(delx) && delx > 0
}

/** Sample Δx is ready from typed finite xmin/xmax/delx; bounds are auto-fill only. */
export function sampleDxDisabled(opts: {
  busy: boolean
  disabled: boolean
  sampleReady: boolean
}): boolean {
  return opts.busy || opts.disabled || !opts.sampleReady
}

/** Stable key so Δx fields re-seed on numeric bound changes, not object identity. */
export function xStepSeedKey(defaults: XStepDefaults | null): string | null {
  if (!defaults) return null
  return `${defaults.xmin}:${defaults.xmax}:${defaults.delx}`
}
