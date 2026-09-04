import type { Calibration, RefPoint } from '../types'
export { CalibrationError, pixelToData, isCalibrationValid } from './transform2d'

export type AxisBoundKey = 'xmin' | 'xmax' | 'ymin' | 'ymax'

export interface AxisBound {
  value: number
  pixel: [number, number]
  refIndex: number
}

function extremeRefIndex(refs: RefPoint[], axis: 'x' | 'y', which: 'min' | 'max'): number {
  if (refs.length === 0) return -1
  const coord = (p: RefPoint) => (axis === 'x' ? p.pixel[0] : p.pixel[1])
  let idx = 0
  for (let i = 1; i < refs.length; i++) {
    const v = coord(refs[i])
    const best = coord(refs[idx])
    if (which === 'min' ? v < best : v > best) idx = i
  }
  return idx
}

export function areCalibrationPixelsInImage(
  calibration: Calibration,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= imageWidth && y <= imageHeight
  for (const axis of [calibration.x, calibration.y]) {
    for (const ref of axis.ref_points) {
      if (!inside(ref.pixel[0], ref.pixel[1])) return false
    }
  }
  for (const pt of calibration.axis_points ?? []) {
    if (!inside(pt.pixel[0], pt.pixel[1])) return false
  }
  const bar = calibration.scale_bar
  if (bar) {
    if (!inside(bar.pixel_a[0], bar.pixel_a[1])) return false
    if (!inside(bar.pixel_b[0], bar.pixel_b[1])) return false
  }
  return true
}

export function getAxisBounds(
  cal: Calibration,
): Record<AxisBoundKey, AxisBound> | null {
  if (cal.x.ref_points.length < 2 || cal.y.ref_points.length < 2) return null
  try {
    const xi = extremeRefIndex(cal.x.ref_points, 'x', 'min')
    const xa = extremeRefIndex(cal.x.ref_points, 'x', 'max')
    const yi = extremeRefIndex(cal.y.ref_points, 'y', 'max')
    const ya = extremeRefIndex(cal.y.ref_points, 'y', 'min')
    const xMinRef = cal.x.ref_points[xi]
    const xMaxRef = cal.x.ref_points[xa]
    const yMinRef = cal.y.ref_points[yi]
    const yMaxRef = cal.y.ref_points[ya]
    return {
      xmin: { value: xMinRef.value, pixel: xMinRef.pixel, refIndex: xi },
      xmax: { value: xMaxRef.value, pixel: xMaxRef.pixel, refIndex: xa },
      ymin: { value: yMinRef.value, pixel: yMinRef.pixel, refIndex: yi },
      ymax: { value: yMaxRef.value, pixel: yMaxRef.pixel, refIndex: ya },
    }
  } catch {
    return null
  }
}

export function updateAxisBound(
  cal: Calibration,
  key: AxisBoundKey,
  patch: Partial<Pick<AxisBound, 'value' | 'pixel'>>,
): Calibration {
  const axis = key.startsWith('x') ? 'x' : 'y'
  const bounds = getAxisBounds(cal)
  if (!bounds) return cal
  const bound = bounds[key]
  const refPoints = cal[axis].ref_points.map((rp, i) =>
    i === bound.refIndex
      ? {
          pixel: patch.pixel ?? rp.pixel,
          value: patch.value ?? rp.value,
        }
      : rp,
  )
  return {
    ...cal,
    source: 'manual',
    [axis]: { ...cal[axis], ref_points: refPoints },
  }
}

export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1000 || (abs > 0 && abs < 0.001)) return value.toExponential(3)
  return Number(value.toPrecision(6)).toString()
}
