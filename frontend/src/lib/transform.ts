import type { Calibration, RefPoint } from '../types'

export class CalibrationError extends Error {}

export type AxisBoundKey = 'xmin' | 'xmax' | 'ymin' | 'ymax'

export interface AxisBound {
  value: number
  pixel: [number, number]
  refIndex: number
}

function axisPixelToValue(
  pixel: number,
  slope: number,
  intercept: number,
  scale: 'linear' | 'log',
): number {
  const t = slope * pixel + intercept
  return scale === 'log' ? 10 ** t : t
}

export function pixelToData(cal: Calibration, pixel: [number, number]): [number, number] {
  const [xs, xi] = fitAxisTwoPoint(cal.x.ref_points, 'x', cal.x.scale)
  const [ys, yi] = fitAxisTwoPoint(cal.y.ref_points, 'y', cal.y.scale)
  return [
    axisPixelToValue(pixel[0], xs, xi, cal.x.scale),
    axisPixelToValue(pixel[1], ys, yi, cal.y.scale),
  ]
}

export function isCalibrationValid(cal: Calibration | null): boolean {
  if (!cal) return false
  try {
    fitAxisTwoPoint(cal.x.ref_points, 'x', cal.x.scale)
    fitAxisTwoPoint(cal.y.ref_points, 'y', cal.y.scale)
    return true
  } catch {
    return false
  }
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

/** Two-point fit at extreme pixel refs — matches xmin/xmax/ymin/ymax UI. */
function fitAxisTwoPoint(
  refPoints: RefPoint[],
  axis: 'x' | 'y',
  scale: 'linear' | 'log',
): [number, number] {
  if (refPoints.length < 2) throw new CalibrationError('Need at least 2 reference points')

  let pA: RefPoint
  let pB: RefPoint
  let pixA: number
  let pixB: number

  if (axis === 'x') {
    pA = refPoints[extremeRefIndex(refPoints, 'x', 'min')]
    pB = refPoints[extremeRefIndex(refPoints, 'x', 'max')]
    pixA = pA.pixel[0]
    pixB = pB.pixel[0]
  } else {
    pA = refPoints[extremeRefIndex(refPoints, 'y', 'min')]
    pB = refPoints[extremeRefIndex(refPoints, 'y', 'max')]
    pixA = pA.pixel[1]
    pixB = pB.pixel[1]
  }

  if (Math.abs(pixB - pixA) < 1e-9) throw new CalibrationError('Degenerate reference pixels')

  let vA = pA.value
  let vB = pB.value
  if (scale === 'log') {
    if (vA <= 0 || vB <= 0) throw new CalibrationError('Log scale requires values > 0')
    vA = Math.log10(vA)
    vB = Math.log10(vB)
  }

  const slope = (vB - vA) / (pixB - pixA)
  const intercept = vA - slope * pixA
  return [slope, intercept]
}

export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1000 || (abs > 0 && abs < 0.001)) return value.toExponential(3)
  return Number(value.toPrecision(6)).toString()
}
