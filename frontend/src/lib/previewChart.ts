import type { Calibration, ConnectAs, Curve, ThetaUnits } from '../types'
import { pixelToData } from './transform2d'

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

function isPlottable(calibration: Calibration, a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const coords = calibration.coords_type ?? 'cartesian'
  if (coords === 'polar') {
    if (calibration.y.scale === 'log' && b <= 0) return false
    return true
  }
  if (calibration.x.scale === 'log' && a <= 0) return false
  if (calibration.y.scale === 'log' && b <= 0) return false
  return true
}

export function buildPreviewConfig(
  curves: Curve[],
  calibration: Calibration,
  height: number,
): { traces: Array<Record<string, unknown>>; layout: Record<string, unknown> } {
  const coords = calibration.coords_type ?? 'cartesian'
  const traces: Array<Record<string, unknown>> = []
  for (const curve of curves) {
    if (!curve.visible) continue
    const mode = connectAsToPlotlyMode(curve.connect_as)
    if (coords === 'polar') {
      const theta: number[] = []
      const r: number[] = []
      let thetaunit: 'degrees' | 'radians' = 'degrees'
      for (const p of curve.points) {
        const [tRaw, radius] = pixelToData(calibration, p.pixel)
        if (!isPlottable(calibration, tRaw, radius)) continue
        const conv = thetaToPlotly(tRaw, calibration.theta_units)
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
    } else {
      const xs: number[] = []
      const ys: number[] = []
      for (const p of curve.points) {
        const [x, y] = pixelToData(calibration, p.pixel)
        if (!isPlottable(calibration, x, y)) continue
        xs.push(x)
        ys.push(y)
      }
      if (!xs.length) continue
      traces.push({
        type: 'scatter',
        mode,
        x: xs,
        y: ys,
        name: curve.label,
        line: { color: curve.color },
        marker: { size: 4, color: curve.color },
      })
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
        height: h,
        polar: {
          radialaxis: {
            title: 'R',
            type: radialType,
            gridcolor: '#334155',
            range: origin !== 0 ? [origin, null] : undefined,
          },
          angularaxis: { direction: 'counterclockwise' },
        },
      },
    }
  }
  const units =
    coords === 'map' && calibration.scale_bar?.units ? ` (${calibration.scale_bar.units})` : ''
  return {
    traces,
    layout: {
      ...PLOT_LAYOUT_BASE,
      height: h,
      xaxis: {
        title: coords === 'map' ? `x${units}` : 'X',
        gridcolor: '#334155',
        automargin: true,
        autorange: true,
        type: calibration.x.scale === 'log' ? 'log' : 'linear',
      },
      yaxis: {
        title: coords === 'map' ? `y${units}` : 'Y',
        gridcolor: '#334155',
        automargin: true,
        autorange: true,
        type: calibration.y.scale === 'log' ? 'log' : 'linear',
      },
    },
  }
}
