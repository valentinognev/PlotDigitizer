export type ExportFormat = 'csv' | 'json'

/** Sidecar PNG name for a CSV export: replace a trailing `.csv` (any case), else append `.png`. */
export function sidecarPngFilename(csvFilename: string): string {
  return csvFilename.replace(/\.csv$/i, '') + '.png'
}

export interface RunSessionExportDeps {
  /** Flush any debounced-but-unsent preferences (e.g. figure title/labels) before exporting. */
  onBeforeExport?: () => Promise<void>
  triggerExport: (format: ExportFormat) => Promise<void>
}

/**
 * Orchestrates a session export: best-effort flush pending preference edits
 * first, so a label typed within the debounce window is included in the
 * exported file, then perform the export.
 *
 * A flush failure does not block the export — the user still gets a file
 * with the last successfully-saved state, and the flush failure is reported
 * independently (e.g. via a toast raised inside `onBeforeExport`).
 */
export async function runSessionExport(
  format: ExportFormat,
  { onBeforeExport, triggerExport }: RunSessionExportDeps,
): Promise<void> {
  if (onBeforeExport) {
    try {
      await onBeforeExport()
    } catch {
      // Best-effort: proceed with export using the last successfully-saved state.
    }
  }
  await triggerExport(format)
}
