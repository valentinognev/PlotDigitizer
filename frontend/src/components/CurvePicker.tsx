import { appendCurve } from '../lib/curves'
import type { Curve } from '../types'

interface Props {
  curves: Curve[]
  activeCurveId: string | null
  busy: boolean
  onActiveChange: (id: string) => void
  onCurvesChange: (curves: Curve[]) => void
}

export function CurvePicker({
  curves,
  activeCurveId,
  busy,
  onActiveChange,
  onCurvesChange,
}: Props) {
  const empty = curves.length === 0

  const addCurve = () => {
    const { curves: next, added } = appendCurve(curves, crypto.randomUUID())
    onCurvesChange(next)
    onActiveChange(added.id)
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-2">
      <h3 className="mb-1 text-xs font-semibold text-slate-200">Curves</h3>
      <div className="flex items-center gap-1.5">
        <select
          value={activeCurveId ?? ''}
          disabled={busy || empty}
          onChange={(e) => onActiveChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {empty ? (
            <option value="">No curves — click Add</option>
          ) : (
            curves.map((curve) => (
              <option key={curve.id} value={curve.id}>
                {curve.label}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={addCurve}
          className="rounded bg-slate-600 px-2 py-0.5 text-[11px] hover:bg-slate-500 disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  )
}
