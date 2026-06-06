import { exportUrl } from '../api/client'

interface Props {
  sessionId: string | null
  canExport: boolean
}

export function ExportPanel({ sessionId, canExport }: Props) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Export</h3>
      {!sessionId ? (
        <p className="text-xs text-slate-400">Upload an image first.</p>
      ) : (
        <div className="flex gap-2">
          <a
            href={canExport ? exportUrl(sessionId, 'csv') : undefined}
            className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium ${
              canExport
                ? 'bg-slate-600 hover:bg-slate-500'
                : 'cursor-not-allowed bg-slate-700 text-slate-500'
            }`}
            onClick={(e) => !canExport && e.preventDefault()}
          >
            CSV
          </a>
          <a
            href={canExport ? exportUrl(sessionId, 'json') : undefined}
            className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium ${
              canExport
                ? 'bg-slate-600 hover:bg-slate-500'
                : 'cursor-not-allowed bg-slate-700 text-slate-500'
            }`}
            onClick={(e) => !canExport && e.preventDefault()}
          >
            JSON
          </a>
        </div>
      )}
    </section>
  )
}
