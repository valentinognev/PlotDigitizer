import type { ComponentType } from 'react'
import PlotlyModule from 'react-plotly.js'
import type { Calibration, Curve } from '../types'
import { isCalibrationValid, pixelToData } from '../lib/transform'

/** Vite/Rolldown CJS interop: default export may be nested under `.default`. */
const Plot = (
  typeof PlotlyModule === 'function'
    ? PlotlyModule
    : (PlotlyModule as { default: ComponentType<Record<string, unknown>> }).default
) as ComponentType<Record<string, unknown>>

interface Props {
  curves: Curve[]
  calibration: Calibration | null
}

export function PreviewChart({ curves, calibration }: Props) {
  const valid = isCalibrationValid(calibration)
  const traces = curves
    .filter((c) => c.visible)
    .map((curve) => {
      const xs: number[] = []
      const ys: number[] = []
      if (valid && calibration) {
        for (const p of curve.points) {
          const [x, y] = pixelToData(calibration, p.pixel)
          xs.push(x)
          ys.push(y)
        }
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

  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2">
      {!valid ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Set valid calibration to preview data-space plot
        </div>
      ) : (
        <Plot
          data={traces}
          layout={{
            autosize: true,
            height: undefined,
            paper_bgcolor: '#0f172a',
            plot_bgcolor: '#1e293b',
            font: { color: '#e2e8f0', size: 11 },
            margin: { l: 48, r: 12, t: 24, b: 36 },
            xaxis: { title: 'X', gridcolor: '#334155', automargin: true },
            yaxis: { title: 'Y', gridcolor: '#334155', automargin: true },
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            scrollZoom: true,
            modeBarButtonsToAdd: [],
          }}
        />
      )}
    </div>
  )
}
