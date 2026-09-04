import type { Calibration, CanvasMode, CoordsType, TransformModel } from '../types'
import { formatAxisValue } from './transform'

export function axesCheckerVisible(
  enabled: boolean,
  changedAtMs: number,
  nowMs: number,
  holdMs = 3000,
): boolean {
  if (!enabled) return false
  return nowMs - changedAtMs < holdMs
}

export function formatModelLabel(model: TransformModel | 'invalid'): string {
  return model
}

export function formatResolution(res: [number, number], coordsType: CoordsType): string {
  const a = formatAxisValue(res[0])
  const b = formatAxisValue(res[1])
  if (coordsType === 'polar') return `θ ${a}/px · R ${b}/px`
  if (coordsType === 'map') return `${a} units/px`
  return `${a} x/px · ${b} y/px`
}

export function appendAxisPoint(
  cal: Calibration,
  pixel: [number, number],
  xValue: number | null,
  yValue: number | null,
): Calibration {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ap-${pixel[0]}-${pixel[1]}-${Date.now()}`
  return {
    ...cal,
    source: 'manual',
    axis_points: [
      ...(cal.axis_points ?? []),
      { id, pixel, x_value: xValue, y_value: yValue },
    ],
  }
}

export function setScaleBarPixel(
  cal: Calibration,
  which: 'a' | 'b',
  pixel: [number, number],
): Calibration {
  const prev = cal.scale_bar ?? {
    pixel_a: [0, 0] as [number, number],
    pixel_b: [0, 0] as [number, number],
    length: 1,
    units: '',
  }
  return {
    ...cal,
    source: 'manual',
    coords_type: 'map',
    scale_bar: {
      ...prev,
      pixel_a: which === 'a' ? pixel : prev.pixel_a,
      pixel_b: which === 'b' ? pixel : prev.pixel_b,
    },
  }
}

export function restoreAxisUiFlags(
  canvasMode: CanvasMode | undefined,
  coordsType: CoordsType | undefined,
): {
  canvasMode: CanvasMode
  preciseMode: boolean
  scaleBarStep: 'a' | 'b' | null
} {
  const mode = canvasMode ?? 'select'
  if (mode === 'axis') {
    if (coordsType === 'map') {
      return { canvasMode: 'select', preciseMode: false, scaleBarStep: null }
    }
    return {
      canvasMode: 'axis',
      preciseMode: coordsType !== 'polar',
      scaleBarStep: null,
    }
  }
  return { canvasMode: mode, preciseMode: false, scaleBarStep: null }
}
