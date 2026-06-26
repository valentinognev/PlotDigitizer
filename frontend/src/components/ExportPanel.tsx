import { useRef, useState } from 'react'
import { EXPORT_FRAME_NAME, triggerSessionExport } from '../api/client'

interface Props {
  sessionId: string | null
  canExportProject: boolean
  canExportCsv: boolean
  canImport: boolean
  busy?: boolean
  onLoadProject?: (file: File) => void
  onImport?: (file: File) => void
  onExportError?: (message: string) => void
  compact?: boolean
}

export function ExportPanel({
  sessionId,
  canExportProject,
  canExportCsv,
  canImport,
  busy,
  onLoadProject,
  onImport,
  onExportError,
  compact,
}: Props) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null)

  const handleExport = async (format: 'csv' | 'json') => {
    if (!sessionId) return
    if (format === 'csv' && !canExportCsv) return
    if (format === 'json' && !canExportProject) return
    setExporting(format)
    try {
      await triggerSessionExport(sessionId, format)
    } catch (e) {
      onExportError?.(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onImport) return
    if (
      !window.confirm(
        'Replace all current curves with the points from this file? This cannot be undone except with Undo.',
      )
    ) {
      return
    }
    onImport(file)
  }

  const handleProjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onLoadProject) return
    if (
      sessionId &&
      !window.confirm(
        'Open this project file? Your current session will be replaced (save a project first if needed).',
      )
    ) {
      return
    }
    onLoadProject(file)
  }

  const exportButtonClass = (enabled: boolean) =>
    `rounded px-2 py-1 text-[11px] font-medium ${
      enabled
        ? 'bg-slate-600 hover:bg-slate-500'
        : 'cursor-not-allowed bg-slate-700 text-slate-500'
    }`

  const exportButtonClassWide = (enabled: boolean) =>
    `flex-1 rounded px-3 py-1.5 text-center text-xs font-medium ${
      enabled
        ? 'bg-slate-600 hover:bg-slate-500'
        : 'cursor-not-allowed bg-slate-700 text-slate-500'
    }`

  const openProjectButton = (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => projectInputRef.current?.click()}
        className={`rounded px-2 py-1 text-[11px] font-medium ${
          !busy ? 'bg-sky-700 hover:bg-sky-600' : 'cursor-not-allowed bg-slate-700 text-slate-500'
        }`}
      >
        Open
      </button>
      <input
        ref={projectInputRef}
        type="file"
        accept=".json,.pdproj.json,application/json"
        className="hidden"
        onChange={handleProjectChange}
      />
    </>
  )

  const importButton = (
    <>
      <button
        type="button"
        disabled={!canImport || busy}
        onClick={() => importInputRef.current?.click()}
        className={`rounded px-2 py-1 text-[11px] font-medium ${
          canImport && !busy
            ? 'bg-slate-600 hover:bg-slate-500'
            : 'cursor-not-allowed bg-slate-700 text-slate-500'
        }`}
      >
        Import
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={handleImportChange}
      />
    </>
  )

  const exportFrame = (
    <iframe
      name={EXPORT_FRAME_NAME}
      title="Export download"
      className="sr-only"
      hidden
    />
  )

  if (compact) {
    return (
      <section className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
        {exportFrame}
        <h3 className="mb-1 text-xs font-semibold text-slate-200">Project</h3>
        <p className="mb-1.5 text-[10px] leading-snug text-slate-500">
          JSON saves the plot image, calibration, curves, and workspace for full restore.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {openProjectButton}
          <button
            type="button"
            disabled={!canExportProject || busy || !!exporting}
            onClick={() => void handleExport('json')}
            className={exportButtonClass(canExportProject && !busy && !exporting)}
          >
            {exporting === 'json' ? 'Saving…' : 'Save JSON'}
          </button>
          <button
            type="button"
            disabled={!canExportCsv || busy || !!exporting}
            onClick={() => void handleExport('csv')}
            className={exportButtonClass(canExportCsv && !busy && !exporting)}
          >
            {exporting === 'csv' ? 'Saving…' : 'CSV'}
          </button>
          {importButton}
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      {exportFrame}
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Project</h3>
      {!sessionId ? (
        <div className="flex gap-2">
          {openProjectButton}
          <p className="text-xs text-slate-400">Or upload an image to start.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {openProjectButton}
          <button
            type="button"
            disabled={!canExportProject || busy || !!exporting}
            onClick={() => void handleExport('json')}
            className={exportButtonClassWide(canExportProject && !busy && !exporting)}
          >
            {exporting === 'json' ? 'Saving…' : 'Save JSON'}
          </button>
          <button
            type="button"
            disabled={!canExportCsv || busy || !!exporting}
            onClick={() => void handleExport('csv')}
            className={exportButtonClassWide(canExportCsv && !busy && !exporting)}
          >
            {exporting === 'csv' ? 'Saving…' : 'CSV'}
          </button>
          <div className="flex-1">{importButton}</div>
        </div>
      )}
    </section>
  )
}
