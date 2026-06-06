import type { Calibration } from '../types'

export class CalibrationError extends Error {}

function fitAxis(
  refPoints: { pixel: [number, number]; value: number }[],
  axis: 'x' | 'y',
  scale: 'linear' | 'log',
): [number, number] {
  if (refPoints.length < 2) throw new CalibrationError('Need at least 2 reference points')
  const pixels = refPoints.map((p) => (axis === 'x' ? p.pixel[0] : p.pixel[1]))
  let values = refPoints.map((p) => p.value)
  if (scale === 'log') {
    if (values.some((v) => v <= 0)) throw new CalibrationError('Log scale requires values > 0')
    values = values.map((v) => Math.log10(v))
  }
  const minP = Math.min(...pixels)
  const maxP = Math.max(...pixels)
  if (Math.abs(maxP - minP) < 1e-9) throw new CalibrationError('Degenerate reference pixels')
  const n = pixels.length
  const sumX = pixels.reduce((a, b) => a + b, 0)
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = pixels.reduce((a, p, i) => a + p * values[i], 0)
  const sumXX = pixels.reduce((a, p) => a + p * p, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return [slope, intercept]
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
  const [xs, xi] = fitAxis(cal.x.ref_points, 'x', cal.x.scale)
  const [ys, yi] = fitAxis(cal.y.ref_points, 'y', cal.y.scale)
  return [
    axisPixelToValue(pixel[0], xs, xi, cal.x.scale),
    axisPixelToValue(pixel[1], ys, yi, cal.y.scale),
  ]
}

export function isCalibrationValid(cal: Calibration | null): boolean {
  if (!cal) return false
  try {
    fitAxis(cal.x.ref_points, 'x', cal.x.scale)
    fitAxis(cal.y.ref_points, 'y', cal.y.scale)
    return true
  } catch {
    return false
  }
}
