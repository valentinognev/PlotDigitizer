import Plot from 'react-plotly.js'
import type { Calibration, Curve } from '../types'
import { isCalibrationValid, pixelToData } from '../lib/transform'

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
        marker: { size: 4 },
      }
    })

  return (
    <div className="h-full w-full rounded-lg border border-slate-700 bg-slate-900 p-2">
      {!valid ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Set valid calibration to preview data-space plot
        </div>
      ) : (
        <Plot
          data={traces}
          layout={{
            autosize: true,
            paper_bgcolor: '#0f172a',
            plot_bgcolor: '#1e293b',
            font: { color: '#e2e8f0' },
            margin: { l: 50, r: 20, t: 30, b: 40 },
            xaxis: { title: 'X', gridcolor: '#334155' },
            yaxis: { title: 'Y', gridcolor: '#334155' },
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
          config={{ responsive: true, displayModeBar: false }}
        />
      )}
    </div>
  )
}
