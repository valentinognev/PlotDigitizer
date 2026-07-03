import { DEFAULT_POINT_COUNT } from '../lib/constants'
import { paletteColor } from '../lib/colors'
import type { Curve } from '../types'

interface Props {
  curves: Curve[]
  activeCurveId: string | null
  placementCurveId: string | null
  selectedPointIds: string[]
  busy: boolean
  resampleCount: number
  onResampleCountChange: (n: number) => void
  onActiveChange: (id: string) => void
  addPointMode: boolean
  onAddPointModeChange: (enabled: boolean) => void
  onCurveChange: (curves: Curve[]) => void
  onReassignPoints: (pointIds: string[], toCurveId: string) => void
  onImprove: (curveId: string) => void
  onResample: (curveId: string) => void
}

export function CurveList({
  curves,
  activeCurveId,
  placementCurveId,
  selectedPointIds,
  busy,
  resampleCount,
  onResampleCountChange,
  onActiveChange,
  addPointMode,
  onAddPointModeChange,
  onCurveChange,
  onReassignPoints,
  onImprove,
  onResample,
}: Props) {
  const updateCurve = (id: string, patch: Partial<Curve>) => {
    onCurveChange(curves.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const canImprove = (curve: Curve) => curve.points.length >= 2

  const addCurve = () => {
    const n = curves.length
    const newCurve: Curve = {
      id: crypto.randomUUID(),
      label: `Curve ${n + 1}`,
      color: paletteColor(n),
      style: 'unknown',
      visible: true,
      target_point_count: DEFAULT_POINT_COUNT,
      points: [],
    }
    onCurveChange([...curves, newCurve])
    onActiveChange(newCurve.id)
  }

  const hideAll = () => {
    onCurveChange(curves.map((c) => ({ ...c, visible: false })))
  }

  const showAll = () => {
    onCurveChange(curves.map((c) => ({ ...c, visible: true })))
  }

  const removeCurve = (curveId: string) => {
    const target = curves.find((c) => c.id === curveId)
    if (!target) return
    if (
      target.points.length > 0 &&
      !window.confirm(`Delete "${target.label}" and its ${target.points.length} points?`)
    ) {
      return
    }
    const next = curves.filter((c) => c.id !== curveId)
    onCurveChange(next)
    if (activeCurveId === curveId) {
      onActiveChange(next[0]?.id ?? null)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Curves</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={addCurve}
            className="rounded bg-slate-600 px-2 py-0.5 text-[11px] hover:bg-slate-500 disabled:opacity-50"
          >
            + Add
          </button>
          <button
            type="button"
            disabled={busy || !placementCurveId}
            title={
              placementCurveId
                ? 'Click the plot to place points on the first visible curve'
                : 'Turn on show for at least one curve first'
            }
            onClick={() => onAddPointModeChange(!addPointMode)}
            className={`rounded px-2 py-0.5 text-[11px] disabled:opacity-50 ${
              addPointMode
                ? 'bg-sky-600 hover:bg-sky-500'
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
          >
            Place points
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <label className="flex items-center gap-1">
          Densify to
          <input
            type="number"
            min={2}
            max={200}
            value={resampleCount}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) {
                onResampleCountChange(Math.min(200, Math.max(2, Math.round(n))))
              }
            }}
            className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          />
          pts
        </label>
      </div>
      <div className="mb-2 flex gap-1">
        <button
          type="button"
          disabled={busy || curves.length === 0}
          onClick={showAll}
          className="rounded bg-slate-600 px-2 py-0.5 text-[11px] hover:bg-slate-500 disabled:opacity-50"
        >
          Show all
        </button>
        <button
          type="button"
          disabled={busy || curves.length === 0}
          onClick={hideAll}
          className="rounded bg-slate-600 px-2 py-0.5 text-[11px] hover:bg-slate-500 disabled:opacity-50"
        >
          Hide all
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto text-xs">
        {curves.map((curve) => (
          <li
            key={curve.id}
            className={`rounded border p-2 ${
              activeCurveId === curve.id ? 'border-sky-500 bg-slate-900' : 'border-slate-600'
            }`}
          >
            <div className="mb-1 flex items-center gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 text-left font-medium"
                onClick={() => onActiveChange(curve.id)}
              >
                {curve.label} ({curve.points.length} pts)
              </button>
              <button
                type="button"
                disabled={busy}
                title="Delete curve"
                onClick={() => removeCurve(curve.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 hover:bg-rose-900/50 hover:text-rose-300 disabled:opacity-50"
              >
                ×
              </button>
            </div>
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
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-slate-300">
                Points
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={curve.target_point_count ?? DEFAULT_POINT_COUNT}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) {
                      updateCurve(curve.id, {
                        target_point_count: Math.min(200, Math.max(2, Math.round(n))),
                      })
                    }
                  }}
                  className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                />
              </label>
              <button
                type="button"
                disabled={busy || curve.points.length < 2}
                title="Interpolate evenly spaced points along the curve"
                className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onResample(curve.id)}
              >
                Densify
              </button>
              <button
                type="button"
                disabled={busy || !canImprove(curve)}
                title={
                  canImprove(curve)
                    ? 'Trace the line in the corridor defined by your points (OpenCV)'
                    : 'Place at least 2 points on this curve first'
                }
                className="rounded bg-sky-700 px-2 py-1 text-[11px] hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onImprove(curve.id)}
              >
                Improve
              </button>
            </div>
            {selectedPointIds.length > 0 && (
              <button
                type="button"
                className="mt-1 text-sky-400 hover:underline"
                onClick={() => onReassignPoints(selectedPointIds, curve.id)}
              >
                Assign selected point{selectedPointIds.length > 1 ? 's' : ''} here
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
