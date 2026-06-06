interface Props {
  textHint: string
  regionMode: boolean
  resampleCount: number
  busy: boolean
  onTextHintChange: (v: string) => void
  onResampleCountChange: (v: number) => void
  onToggleRegion: () => void
  onDetect: () => void
  onRefineText: () => void
  onResample: () => void
  onRedetect: () => void
  activeCurveId: string | null
}

export function AIAssistBar({
  textHint,
  regionMode,
  resampleCount,
  busy,
  onTextHintChange,
  onResampleCountChange,
  onToggleRegion,
  onDetect,
  onRefineText,
  onResample,
  onRedetect,
  activeCurveId,
}: Props) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">AI Assist</h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onDetect}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          Detect
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleRegion}
          className={`rounded px-3 py-1.5 text-xs font-medium ${
            regionMode ? 'bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {regionMode ? 'Draw region (drag on canvas)' : 'Region hint'}
        </button>
        <button
          type="button"
          disabled={busy || !activeCurveId}
          onClick={onRedetect}
          className="rounded bg-amber-600 px-3 py-1.5 text-xs hover:bg-amber-500 disabled:opacity-50"
        >
          Re-detect curve
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
          placeholder="Text hint, e.g. missing red dashed curve"
          value={textHint}
          onChange={(e) => onTextHintChange(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !textHint.trim()}
          onClick={onRefineText}
          className="rounded bg-violet-600 px-3 py-1 text-xs hover:bg-violet-500 disabled:opacity-50"
        >
          Refine
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label htmlFor="resample-count">Resample</label>
        <input
          id="resample-count"
          type="number"
          min={10}
          max={200}
          value={resampleCount}
          onChange={(e) => onResampleCountChange(Number(e.target.value))}
          className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
        />
        <button
          type="button"
          disabled={busy || !activeCurveId}
          onClick={onResample}
          className="rounded bg-slate-600 px-2 py-1 hover:bg-slate-500 disabled:opacity-50"
        >
          Densify curve
        </button>
      </div>
    </section>
  )
}
