import type { Curve } from '../types'

interface Props {
  curves: Curve[]
  activeCurveId: string | null
  selectedPointId: string | null
  onActiveChange: (id: string) => void
  onCurveChange: (curves: Curve[]) => void
  onReassignPoint: (pointId: string, toCurveId: string) => void
}

export function CurveList({
  curves,
  activeCurveId,
  selectedPointId,
  onActiveChange,
  onCurveChange,
  onReassignPoint,
}: Props) {
  const updateCurve = (id: string, patch: Partial<Curve>) => {
    onCurveChange(curves.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Curves</h3>
      <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
        {curves.map((curve) => (
          <li
            key={curve.id}
            className={`rounded border p-2 ${
              activeCurveId === curve.id ? 'border-sky-500 bg-slate-900' : 'border-slate-600'
            }`}
          >
            <button
              type="button"
              className="mb-1 w-full text-left font-medium"
              onClick={() => onActiveChange(curve.id)}
            >
              {curve.label} ({curve.points.length} pts)
            </button>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                value={curve.label}
                onChange={(e) => updateCurve(curve.id, { label: e.target.value })}
              />
              <input
                type="color"
                value={curve.color}
                onChange={(e) => updateCurve(curve.id, { color: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
              />
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={curve.visible}
                  onChange={(e) => updateCurve(curve.id, { visible: e.target.checked })}
                />
                show
              </label>
            </div>
            {selectedPointId && (
              <button
                type="button"
                className="mt-1 text-sky-400 hover:underline"
                onClick={() => onReassignPoint(selectedPointId, curve.id)}
              >
                Assign selected point here
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
