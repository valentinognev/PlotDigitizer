import { memo, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import PlotlyModule from 'react-plotly.js'
import type { Calibration, Curve, FigureMeta } from '../types'
import { buildPreviewConfig, previewEmptyReason } from '../lib/previewChart'
import type { Theme } from '../lib/theme'
import { formatCalibrationIssue } from '../lib/transform'
import { isCalibrationValid } from '../lib/transform2d'

/** Vite/Rolldown CJS interop: default export may be nested under `.default`. */
const Plot = (
  typeof PlotlyModule === 'function'
    ? PlotlyModule
    : (PlotlyModule as { default: ComponentType<Record<string, unknown>> }).default
) as ComponentType<Record<string, unknown>>

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
  calibrations?: Calibration[]
  figure?: FigureMeta
  theme: Theme
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i)
  return h
}

function plotRevision(
  curves: Curve[],
  calibration: Calibration | null,
  calibrations: Calibration[] | undefined,
  figure: FigureMeta | undefined,
  theme: Theme,
): number {
  let revision = hashStr(theme)
  if (figure) {
    revision += hashStr(figure.title) * 3
    revision += hashStr(figure.xlabel) * 5
    revision += hashStr(figure.ylabel) * 7
  }
  const cals = calibrations?.length ? calibrations : calibration ? [calibration] : []
  for (const cal of cals) {
    revision += hashStr(cal.id ?? '') * 19
    revision += hashStr(cal.name ?? '') * 23
    revision += cal.x.ref_points.length * 17
    revision += cal.y.ref_points.length * 31
    revision += cal.x.scale === 'log' ? 1 : 0
    revision += cal.y.scale === 'log' ? 2 : 0
    revision += hashStr(cal.coords_type ?? 'cartesian') * 41
    revision += hashStr(cal.theta_units ?? 'degrees') * 43
    revision += Math.round((cal.origin_radius ?? 0) * 1000)
    for (const ref of cal.x.ref_points) {
      revision += Math.round(ref.value * 10) + Math.round(ref.pixel[0])
    }
    for (const ref of cal.y.ref_points) {
      revision += Math.round(ref.value * 10) + Math.round(ref.pixel[1])
    }
    for (const pt of cal.axis_points ?? []) {
      revision += Math.round(pt.pixel[0]) + Math.round(pt.pixel[1])
      if (pt.x_value != null) revision += Math.round(pt.x_value * 10)
      if (pt.y_value != null) revision += Math.round(pt.y_value * 10)
    }
    const bar = cal.scale_bar
    if (bar) {
      revision += Math.round(bar.pixel_a[0]) + Math.round(bar.pixel_a[1])
      revision += Math.round(bar.pixel_b[0]) + Math.round(bar.pixel_b[1])
      revision += Math.round(bar.length * 10)
      if (bar.units) revision += hashStr(bar.units)
    }
  }
  for (const curve of curves) {
    revision += curve.points.length * 13
    revision += curve.visible ? 1 : 0
    revision += hashStr(curve.calibration_id ?? '') * 29
  }
  return revision
}

function hasVisiblePoints(curves: Curve[]): boolean {
  return curves.some((c) => c.visible && c.points.length > 0)
}

export const PreviewChart = memo(function PreviewChart({
  curves,
  calibration,
  calibrations,
  figure,
  theme,
}: Props) {
  const plotHostRef = useRef<HTMLDivElement>(null)
  const [plotHeight, setPlotHeight] = useState(280)
  const valid =
    isCalibrationValid(calibration) || (calibrations ?? []).some((cal) => isCalibrationValid(cal))

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
    () =>
      valid
        ? buildPreviewConfig(curves, { calibration, calibrations }, plotHeight, figure, theme)
            .traces
        : [],
    [curves, calibration, calibrations, valid, plotHeight, figure, theme],
  )
  const layout = useMemo(
    () =>
      valid
        ? buildPreviewConfig(curves, { calibration, calibrations }, plotHeight, figure, theme)
            .layout
        : null,
    [curves, calibration, calibrations, valid, plotHeight, figure, theme],
  )
  const revision = useMemo(
    () => plotRevision(curves, valid ? calibration : null, calibrations, figure, theme),
    [curves, calibration, calibrations, valid, figure, theme],
  )

  const issueCopy = formatCalibrationIssue(calibration)
  const missingCalibrationMessage = previewEmptyReason(
    calibration,
    hasVisiblePoints(curves),
  )

  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2">
      {!valid ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          {issueCopy ? (
            <>
              <p className="text-sm font-medium text-amber-300">{issueCopy.message}</p>
              <p className="text-sm text-slate-400">{issueCopy.hint}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              {missingCalibrationMessage ?? 'Set valid calibration to preview data-space plot'}
            </p>
          )}
        </div>
      ) : (
        <div ref={plotHostRef} className="min-h-0 flex-1">
          {traces.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
              No plottable points — check calibration and curve visibility.
            </div>
          ) : (
            <Plot
              key={calibration?.coords_type ?? 'cartesian'}
              data={traces}
              layout={
                layout ??
                buildPreviewConfig(
                  curves,
                  { calibration, calibrations },
                  plotHeight,
                  figure,
                  theme,
                ).layout
              }
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
