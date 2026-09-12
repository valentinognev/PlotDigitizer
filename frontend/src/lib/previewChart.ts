import type { Calibration, ConnectAs, Curve, FigureMeta, Scale, ThetaUnits } from '../types'
import { formatCalibrationIssue } from './transform'
import { pixelToData } from './transform2d'

function coordsTypeOf(cal: Calibration): NonNullable<Calibration['coords_type']> {
  return cal.coords_type ?? 'cartesian'
}

export function calibrationForCurve(
  curve: Pick<Curve, 'calibration_id'>,
  calibrations: Calibration[],
  fallback: Calibration | null = null,
): Calibration | null {
  if (curve.calibration_id) {
    const hit = calibrations.find((cal) => cal.id === curve.calibration_id)
    if (hit) return hit
  }
  if (fallback) return fallback
  return calibrations[0] ?? null
}

export function axisTrackForCurve(
  curve: Pick<Curve, 'calibration_id'>,
  calibrations: Calibration[],
): 'y' | 'y2' {
  const cartesian = calibrations.filter((cal) => coordsTypeOf(cal) === 'cartesian')
  if (cartesian.length <= 1) return 'y'
  const resolved = calibrationForCurve(curve, calibrations)
  if (!resolved || coordsTypeOf(resolved) !== 'cartesian') return 'y'
  const firstId = cartesian[0]?.id
  if (!resolved.id || resolved.id === firstId) return 'y'
  return 'y2'
}

export function previewEmptyReason(
  calibration: Calibration | null,
  hasVisiblePoints: boolean,
): string | null {
  if (!calibration) {
    return hasVisiblePoints
      ? 'Set calibration to preview curves in data space.'
      : 'Set valid calibration to preview data-space plot'
  }
  const copy = formatCalibrationIssue(calibration)
  if (!copy) return null
  return `${copy.message} ${copy.hint}`
}

export function connectAsToPlotlyMode(
  connectAs: ConnectAs | undefined,
): 'lines+markers' | 'markers' {
  return connectAs === 'scatter' ? 'markers' : 'lines+markers'
}

export function thetaToPlotly(
  theta: number,
  units: ThetaUnits | undefined,
): { value: number; thetaunit: 'degrees' | 'radians' } {
  const u = units ?? 'degrees'
  if (u === 'radians') return { value: theta, thetaunit: 'radians' }
  if (u === 'gradians') return { value: theta * 0.9, thetaunit: 'degrees' }
  if (u === 'turns') return { value: theta * 360, thetaunit: 'degrees' }
  return { value: theta, thetaunit: 'degrees' }
}

const PLOT_LAYOUT_BASE = {
  autosize: true,
  paper_bgcolor: '#0f172a',
  plot_bgcolor: '#1e293b',
  font: { color: '#e2e8f0', size: 11 },
  margin: { l: 48, r: 12, t: 24, b: 36 },
  uirevision: 'plot-preview',
} as const

function nonEmpty(s: string | undefined): string | undefined {
  const trimmed = s?.trim()
  return trimmed ? trimmed : undefined
}

function isPlottable(calibration: Calibration, a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const coords = calibration.coords_type ?? 'cartesian'
  if (coords === 'polar') {
    if (calibration.y.scale === 'log' && b <= 0) return false
    return true
  }
  if (coords === 'bar') {
    if (calibration.y.scale === 'log' && a <= 0) return false
    return true
  }
  if (calibration.x.scale === 'log' && a <= 0) return false
  if (calibration.y.scale === 'log' && b <= 0) return false
  return true
}

function plotlyAxisType(scale: Scale): 'linear' | 'log' | 'date' {
  if (scale === 'log') return 'log'
  if (scale === 'date') return 'date'
  return 'linear'
}

function unixDaysToIso(unixDays: number): string {
  return new Date(unixDays * 86400e3).toISOString()
}

export type PreviewCalSource =
  | Calibration
  | { calibration?: Calibration | null; calibrations?: Calibration[] }

function isSingletonCalibration(src: PreviewCalSource): src is Calibration {
  return 'x' in src && 'y' in src && 'source' in src
}

export function resolvePreviewCals(src: PreviewCalSource): {
  fallback: Calibration | null
  list: Calibration[]
} {
  if (isSingletonCalibration(src)) {
    return { fallback: src, list: [src] }
  }
  const list = src.calibrations?.length
    ? src.calibrations
    : src.calibration
      ? [src.calibration]
      : []
  return { fallback: src.calibration ?? list[0] ?? null, list }
}

function pushCartesianTrace(
  traces: Array<Record<string, unknown>>,
  curve: Curve,
  cal: Calibration,
  list: Calibration[],
  y2Holder: { cal: Calibration | null },
): void {
  const xs: Array<number | string> = []
  const ys: Array<number | string> = []
  for (const p of curve.points) {
    const [x, y] = pixelToData(cal, p.pixel)
    if (!isPlottable(cal, x, y)) continue
    xs.push(cal.x.scale === 'date' ? unixDaysToIso(x) : x)
    ys.push(cal.y.scale === 'date' ? unixDaysToIso(y) : y)
  }
  if (!xs.length) return
  const trace: Record<string, unknown> = {
    type: 'scatter',
    mode: connectAsToPlotlyMode(curve.connect_as),
    x: xs,
    y: ys,
    name: curve.label,
    line: { color: curve.color },
    marker: { size: 4, color: curve.color },
  }
  if (coordsTypeOf(cal) === 'cartesian' && axisTrackForCurve(curve, list) === 'y2') {
    trace.yaxis = 'y2'
    if (!y2Holder.cal) y2Holder.cal = cal
  }
  traces.push(trace)
}

export function buildPreviewConfig(
  curves: Curve[],
  sessionOrCals: PreviewCalSource,
  height: number,
  figure?: FigureMeta,
): { traces: Array<Record<string, unknown>>; layout: Record<string, unknown> } {
  const { fallback, list } = resolvePreviewCals(sessionOrCals)
  const calibration = fallback
  if (!calibration) {
    return { traces: [], layout: { ...PLOT_LAYOUT_BASE, height: Math.max(height, 120) } }
  }
  const coords = coordsTypeOf(calibration)
  const titleText = nonEmpty(figure?.title)
  const xlabelText = nonEmpty(figure?.xlabel)
  const ylabelText = nonEmpty(figure?.ylabel)
  // Object form (not a bare string) so automargin can grow the top margin for the
  // title instead of letting the fixed PLOT_LAYOUT_BASE.margin.t clip it.
  const titleLayout = titleText ? { title: { text: titleText, automargin: true } } : {}
  const traces: Array<Record<string, unknown>> = []
  const y2Holder: { cal: Calibration | null } = { cal: null }
  for (const curve of curves) {
    if (!curve.visible) continue
    const cal = calibrationForCurve(curve, list, fallback)
    if (!cal) continue
    const curveCoords = coordsTypeOf(cal)
    const mode = connectAsToPlotlyMode(curve.connect_as)
    if (curveCoords === 'polar') {
      const theta: number[] = []
      const r: number[] = []
      let thetaunit: 'degrees' | 'radians' = 'degrees'
      for (const p of curve.points) {
        const [tRaw, radius] = pixelToData(cal, p.pixel)
        if (!isPlottable(cal, tRaw, radius)) continue
        const conv = thetaToPlotly(tRaw, cal.theta_units)
        thetaunit = conv.thetaunit
        theta.push(conv.value)
        r.push(radius)
      }
      if (!theta.length) continue
      traces.push({
        type: 'scatterpolar',
        mode,
        theta,
        r,
        thetaunit,
        name: curve.label,
        line: { color: curve.color },
        marker: { size: 4, color: curve.color },
      })
    } else if (curveCoords === 'bar') {
      const xs: Array<number | string> = []
      const ys: number[] = []
      curve.points.forEach((p, i) => {
        const [value, dummy] = pixelToData(cal, p.pixel)
        if (!isPlottable(cal, value, dummy)) return
        xs.push(p.label || i)
        ys.push(value)
      })
      if (!xs.length) continue
      traces.push({
        type: 'bar',
        x: xs,
        y: ys,
        name: curve.label,
        marker: { color: curve.color },
      })
    } else {
      pushCartesianTrace(traces, curve, cal, list, y2Holder)
    }
  }
  const h = Math.max(height, 120)
  if (coords === 'polar') {
    const origin = calibration.origin_radius ?? 0
    const radialType = calibration.y.scale === 'log' ? 'log' : 'linear'
    return {
      traces,
      layout: {
        ...PLOT_LAYOUT_BASE,
        ...titleLayout,
        height: h,
        polar: {
          radialaxis: {
            title: ylabelText ?? 'R',
            type: radialType,
            gridcolor: '#334155',
            range: origin !== 0 ? [origin, null] : undefined,
          },
          angularaxis: {
            direction: 'counterclockwise',
            ...(xlabelText ? { title: xlabelText } : {}),
          },
        },
      },
    }
  }
  const units =
    coords === 'map' && calibration.scale_bar?.units ? ` (${calibration.scale_bar.units})` : ''
  const layout: Record<string, unknown> = {
    ...PLOT_LAYOUT_BASE,
    ...titleLayout,
    height: h,
    xaxis: {
      title: xlabelText ?? (coords === 'map' ? `x${units}` : coords === 'bar' ? 'label' : 'X'),
      gridcolor: '#334155',
      automargin: true,
      autorange: true,
      type: coords === 'bar' ? 'category' : plotlyAxisType(calibration.x.scale),
    },
    yaxis: {
      title: ylabelText ?? (coords === 'map' ? `y${units}` : coords === 'bar' ? 'value' : 'Y'),
      gridcolor: '#334155',
      automargin: true,
      autorange: true,
      type: plotlyAxisType(calibration.y.scale),
    },
  }
  if (y2Holder.cal) {
    const y2 = y2Holder.cal
    layout.margin = { ...PLOT_LAYOUT_BASE.margin, r: 48 }
    layout.yaxis2 = {
      title: nonEmpty(y2.name) ?? 'Y',
      overlaying: 'y',
      side: 'right',
      gridcolor: '#334155',
      automargin: true,
      autorange: true,
      type: plotlyAxisType(y2.y.scale),
    }
  }
  return { traces, layout }
}
