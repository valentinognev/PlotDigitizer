import type { Calibration } from '../types'
import { updateAxisBound, type AxisBoundKey } from './transform'

export const AXIS_PLACE_ORDER: AxisBoundKey[] = ['xmin', 'xmax', 'ymin', 'ymax']

export const AXIS_PLACE_LABELS: Record<AxisBoundKey, string> = {
  xmin: 'X minimum',
  xmax: 'X maximum',
  ymin: 'Y minimum',
  ymax: 'Y maximum',
}

export function createEmptyCalibration(width: number, height: number): Calibration {
  const mx = width * 0.1
  const my = height * 0.1
  const xLeft = mx
  const xRight = width - mx
  const yTop = my
  const yBottom = height - my
  return {
    source: 'manual',
    coords_type: 'cartesian',
    model: 'auto',
    axis_points: [],
    theta_units: 'degrees',
    origin_radius: 0,
    scale_bar: null,
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [xLeft, yBottom], value: 0 },
        { pixel: [xRight, yBottom], value: 1 },
      ],
    },
    y: {
      scale: 'linear',
      ref_points: [
        { pixel: [xLeft, yBottom], value: 0 },
        { pixel: [xLeft, yTop], value: 1 },
      ],
    },
  }
}

export function showFourBoundMarks(cal: Calibration | null | undefined): boolean {
  if (!cal) return false
  if ((cal.coords_type ?? 'cartesian') !== 'cartesian') return false
  return (cal.axis_points?.length ?? 0) === 0
}

export function setAxisBoundPixel(
  cal: Calibration,
  key: AxisBoundKey,
  pixel: [number, number],
): Calibration {
  return updateAxisBound(cal, key, { pixel })
}
