import type { Calibration, Scale } from '../types'
import {
  formatAxisValue,
  getAxisBounds,
  updateAxisBound,
  type AxisBoundKey,
} from '../lib/transform'

interface Props {
  calibration: Calibration | null
  manualMode: boolean
  onToggleManual: (v: boolean) => void
  onChange: (cal: Calibration) => void
  onSave: () => void
}

const BOUND_LABELS: { key: AxisBoundKey; label: string }[] = [
  { key: 'xmin', label: 'X min' },
  { key: 'xmax', label: 'X max' },
  { key: 'ymin', label: 'Y min' },
  { key: 'ymax', label: 'Y max' },
]

export function CalibrationPanel({
  calibration,
  manualMode,
  onToggleManual,
  onChange,
  onSave,
}: Props) {
  if (!calibration) {
    return (
      <section className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
        <h3 className="text-xs font-semibold text-slate-200">Calibration</h3>
        <p className="mt-1 text-[11px] text-slate-400">
          Run Detect axes to read X/Y min and max from the plot.
        </p>
      </section>
    )
  }

  const bounds = getAxisBounds(calibration)

  const updateScale = (axis: 'x' | 'y', scale: Scale) => {
    onChange({
      ...calibration,
      source: manualMode ? 'manual' : calibration.source,
      [axis]: { ...calibration[axis], scale },
    })
  }

  const updateBoundValue = (key: AxisBoundKey, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    if (calibration[key.startsWith('x') ? 'x' : 'y'].scale === 'log' && value <= 0) return
    onChange(updateAxisBound(calibration, key, { value }))
  }

  return (
    <section className="min-w-[280px] flex-1 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-200">Calibration</h3>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={manualMode}
            onChange={(e) => onToggleManual(e.target.checked)}
          />
          Manual
        </label>
      </div>
      <div className="mb-1.5 flex flex-wrap gap-2 text-[11px]">
        <label className="flex items-center gap-1 text-slate-300">
          X
          <select
            className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            value={calibration.x.scale}
            onChange={(e) => updateScale('x', e.target.value as Scale)}
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-300">
          Y
          <select
            className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            value={calibration.y.scale}
            onChange={(e) => updateScale('y', e.target.value as Scale)}
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-sky-600 px-2 py-0.5 text-[11px] font-medium hover:bg-sky-500"
        >
          Save
        </button>
      </div>
      {bounds ? (
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {BOUND_LABELS.map(({ key, label }) => (
            <label key={key} className="text-slate-300">
              {label}
              <input
                type="number"
                step="any"
                title={formatAxisValue(bounds[key].value)}
                className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1 py-0.5 disabled:text-slate-400"
                value={bounds[key].value}
                readOnly={!manualMode}
                onChange={(e) => updateBoundValue(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">Need at least 2 refs per axis.</p>
      )}
      {manualMode && bounds && (
        <p className="mt-1 text-[10px] text-sky-300/90">
          Drag cyan (X) and magenta (Y) marks on the plot image to adjust limits.
        </p>
      )}
    </section>
  )
}
