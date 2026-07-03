interface Props {
  canTogglePreview: boolean
  previewActive: boolean
  canApply: boolean
  status: string
  onTogglePreview: (on: boolean) => void
  onApply: () => void
  onCancelPreview: () => void
  busy: boolean
}

export function UnskewPanel({
  canTogglePreview,
  previewActive,
  canApply,
  status,
  onTogglePreview,
  onApply,
  onCancelPreview,
  busy,
}: Props) {
  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Unskew</h3>
        <button
          type="button"
          title={previewActive ? 'Turn off corrected preview' : 'Show corrected preview on canvas'}
          disabled={!canTogglePreview}
          onClick={() => onTogglePreview(!previewActive)}
          className={`shrink-0 rounded px-2 py-0.5 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            previewActive
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {previewActive ? 'Preview on' : 'Preview corrected'}
        </button>
        <button
          type="button"
          disabled={!canApply || busy}
          onClick={onApply}
          className="shrink-0 rounded bg-sky-600 px-2 py-0.5 font-medium hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
        {previewActive && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancelPreview}
            className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500 disabled:opacity-50"
          >
            Cancel preview
          </button>
        )}
      </div>
      <p className="text-slate-400">{status}</p>
    </section>
  )
}
