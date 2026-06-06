import type { Calibration, Scale } from '../types'

interface Props {
  calibration: Calibration | null
  manualMode: boolean
  onToggleManual: (v: boolean) => void
  onChange: (cal: Calibration) => void
  onSave: () => void
}

export function CalibrationPanel({
  calibration,
  manualMode,
  onToggleManual,
  onChange,
  onSave,
}: Props) {
  if (!calibration) {
    return (
      <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Calibration</h3>
        <p className="text-xs text-slate-400">Run Detect to populate axis calibration.</p>
      </section>
    )
  }

  const updateScale = (axis: 'x' | 'y', scale: Scale) => {
    onChange({
      ...calibration,
      source: manualMode ? 'manual' : calibration.source,
      [axis]: { ...calibration[axis], scale },
    })
  }

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Calibration</h3>
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={manualMode} onChange={(e) => onToggleManual(e.target.checked)} />
        Manual calibration mode
      </label>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <label>
          X scale
          <select
            className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
            value={calibration.x.scale}
            onChange={(e) => updateScale('x', e.target.value as Scale)}
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
        </label>
        <label>
          Y scale
          <select
            className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
            value={calibration.y.scale}
            onChange={(e) => updateScale('y', e.target.value as Scale)}
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        X refs: {calibration.x.ref_points.length} · Y refs: {calibration.y.ref_points.length}
      </p>
      <button
        type="button"
        onClick={onSave}
        className="w-full rounded bg-sky-600 px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
      >
        Save calibration
      </button>
    </section>
  )
}
