import type { UnskewMode } from '../lib/meshWarp'

interface Props {
  mode: UnskewMode
  canTogglePreview: boolean
  previewActive: boolean
  canApply: boolean
  status: string
  onModeChange: (mode: UnskewMode) => void
  onTogglePreview: (on: boolean) => void
  onApply: () => void
  onCancelPreview: () => void
  busy: boolean
  canResetMesh?: boolean
  onResetMesh?: () => void
}

export function UnskewPanel({
  mode,
  canTogglePreview,
  previewActive,
  canApply,
  status,
  onModeChange,
  onTogglePreview,
  onApply,
  onCancelPreview,
  busy,
  canResetMesh = false,
  onResetMesh,
}: Props) {
  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Unskew</h3>
        <div className="flex shrink-0 rounded border border-slate-600 text-[10px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => onModeChange('perspective')}
            className={`px-2 py-0.5 ${
              mode === 'perspective'
                ? 'bg-slate-600 text-slate-100'
                : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            Perspective
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onModeChange('mesh')}
            className={`px-2 py-0.5 ${
              mode === 'mesh' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            Mesh
          </button>
        </div>
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
        {canResetMesh && onResetMesh && (
          <button
            type="button"
            title="Reset mesh grid to calibration bounds, discarding edits"
            disabled={busy}
            onClick={onResetMesh}
            className="shrink-0 rounded bg-rose-700 px-2 py-0.5 font-medium hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset mesh
          </button>
        )}
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
