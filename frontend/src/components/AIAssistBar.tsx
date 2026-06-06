interface Props {
  textHint: string
  regionMode: boolean
  resampleCount: number
  busy: boolean
  busyMessage: string | null
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
  busyMessage,
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
    <section className="min-w-[280px] flex-[2] rounded-lg border border-slate-700 bg-slate-800/50 p-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold text-slate-200">AI Assist</h3>
        {busy && busyMessage && (
          <span className="text-[10px] text-emerald-300/90">{busyMessage}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <button
          type="button"
          disabled={busy}
          onClick={onDetect}
          className="rounded bg-emerald-600 px-2 py-1 font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          Detect
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleRegion}
          className={`rounded px-2 py-1 font-medium ${
            regionMode ? 'bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {regionMode ? 'Drawing region…' : 'Region'}
        </button>
        <button
          type="button"
          disabled={busy || !activeCurveId}
          onClick={onRedetect}
          className="rounded bg-amber-600 px-2 py-1 hover:bg-amber-500 disabled:opacity-50"
        >
          Re-detect
        </button>
        <input
          className="min-w-[140px] flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1"
          placeholder="Text hint…"
          value={textHint}
          onChange={(e) => onTextHintChange(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !textHint.trim()}
          onClick={onRefineText}
          className="rounded bg-violet-600 px-2 py-1 hover:bg-violet-500 disabled:opacity-50"
        >
          Refine
        </button>
        <label className="flex items-center gap-1 text-slate-300">
          N
          <input
            type="number"
            min={10}
            max={200}
            value={resampleCount}
            onChange={(e) => onResampleCountChange(Number(e.target.value))}
            className="w-12 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          />
        </label>
        <button
          type="button"
          disabled={busy || !activeCurveId}
          onClick={onResample}
          className="rounded bg-slate-600 px-2 py-1 hover:bg-slate-500 disabled:opacity-50"
        >
          Densify
        </button>
      </div>
    </section>
  )
}
