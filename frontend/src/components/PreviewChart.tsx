import { memo, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import PlotlyModule from 'react-plotly.js'
import type { Calibration, Curve } from '../types'
import { isCalibrationValid, pixelToData } from '../lib/transform'

/** Vite/Rolldown CJS interop: default export may be nested under `.default`. */
const Plot = (
  typeof PlotlyModule === 'function'
    ? PlotlyModule
    : (PlotlyModule as { default: ComponentType<Record<string, unknown>> }).default
) as ComponentType<Record<string, unknown>>

const PLOT_LAYOUT_BASE = {
  autosize: true,
  paper_bgcolor: '#0f172a',
  plot_bgcolor: '#1e293b',
  font: { color: '#e2e8f0', size: 11 },
  margin: { l: 48, r: 12, t: 24, b: 36 },
  uirevision: 'plot-preview',
} as const

function buildLayout(calibration: Calibration, height: number) {
  return {
    ...PLOT_LAYOUT_BASE,
    height: Math.max(height, 120),
    xaxis: {
      title: 'X',
      gridcolor: '#334155',
      automargin: true,
      autorange: true,
      type: calibration.x.scale === 'log' ? ('log' as const) : ('linear' as const),
    },
    yaxis: {
      title: 'Y',
      gridcolor: '#334155',
      automargin: true,
      autorange: true,
      type: calibration.y.scale === 'log' ? ('log' as const) : ('linear' as const),
    },
  }
}

const PLOT_CONFIG = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToAdd: [],
} as const

interface Props {
  curves: Curve[]
  calibration: Calibration | null
}

function isPlottable(
  calibration: Calibration,
  x: number,
  y: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (calibration.x.scale === 'log' && x <= 0) return false
  if (calibration.y.scale === 'log' && y <= 0) return false
  return true
}

function buildTraces(curves: Curve[], calibration: Calibration) {
  return curves
    .filter((c) => c.visible)
    .map((curve) => {
      const xs: number[] = []
      const ys: number[] = []
      for (const p of curve.points) {
        const [x, y] = pixelToData(calibration, p.pixel)
        if (!isPlottable(calibration, x, y)) continue
        xs.push(x)
        ys.push(y)
      }
      return {
        x: xs,
        y: ys,
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: curve.label,
        line: { color: curve.color },
        marker: { size: 4, color: curve.color },
      }
    })
    .filter((trace) => trace.x.length > 0)
}

function plotRevision(curves: Curve[], calibration: Calibration | null): number {
  let revision = 0
  if (calibration) {
    revision += calibration.x.ref_points.length * 17
    revision += calibration.y.ref_points.length * 31
    revision += calibration.x.scale === 'log' ? 1 : 0
    revision += calibration.y.scale === 'log' ? 2 : 0
    for (const ref of calibration.x.ref_points) {
      revision += Math.round(ref.value * 10) + Math.round(ref.pixel[0])
    }
    for (const ref of calibration.y.ref_points) {
      revision += Math.round(ref.value * 10) + Math.round(ref.pixel[1])
    }
  }
  for (const curve of curves) {
    revision += curve.points.length * 13
    revision += curve.visible ? 1 : 0
  }
  return revision
}

function hasVisiblePoints(curves: Curve[]): boolean {
  return curves.some((c) => c.visible && c.points.length > 0)
}

export const PreviewChart = memo(function PreviewChart({ curves, calibration }: Props) {
  const plotHostRef = useRef<HTMLDivElement>(null)
  const [plotHeight, setPlotHeight] = useState(280)
  const valid = isCalibrationValid(calibration)

  useEffect(() => {
    const el = plotHostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPlotHeight(el.clientHeight)
    })
    ro.observe(el)
    setPlotHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [valid])

  const traces = useMemo(
    () => (valid && calibration ? buildTraces(curves, calibration) : []),
    [curves, calibration, valid],
  )
  const layout = useMemo(
    () => (valid && calibration ? buildLayout(calibration, plotHeight) : null),
    [calibration, plotHeight, valid],
  )
  const revision = useMemo(
    () => plotRevision(curves, valid ? calibration : null),
    [curves, calibration, valid],
  )

  const missingCalibrationMessage = hasVisiblePoints(curves)
    ? 'Set calibration to preview curves in data space.'
    : 'Set valid calibration to preview data-space plot'

  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2">
      {!valid ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-400">
          {missingCalibrationMessage}
        </div>
      ) : (
        <div ref={plotHostRef} className="min-h-0 flex-1">
          {traces.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
              No plottable points — check calibration and curve visibility.
            </div>
          ) : (
            <Plot
              data={traces}
              layout={layout ?? buildLayout(calibration!, plotHeight)}
              revision={revision}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              config={PLOT_CONFIG}
            />
          )}
        </div>
      )}
    </div>
  )
})
