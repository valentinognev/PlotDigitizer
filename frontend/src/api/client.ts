import type {
  Calibration,
  ColorFilter,
  Curve,
  FigureMeta,
  GridGeometrySettings,
  MatchCandidate,
  RegionMask,
  SegmentPublic,
  Session,
  WorkspaceState,
} from '../types'
import { maskPreviewUrl } from '../lib/colorFilter'
import { sidecarPngFilename } from '../lib/exportFlow'

const DEFAULT_TIMEOUT_MS = 120_000

export function shouldRevertSessionOnPrefsError(err: unknown): boolean {
  return !(
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'calibration_invalid'
  )
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(path, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — try again or check the API connection')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let body: { error?: { message: string }; detail?: unknown } = {
      error: { message: res.statusText },
    }
    try {
      body = await res.json()
    } catch {
      /* ignore */
    }
    const err = 'error' in body && body.error ? body.error : body.detail
    const nested =
      typeof err === 'object' && err && 'error' in err
        ? (err as { error: { code?: string; message?: string } }).error
        : err
    const message =
      typeof nested === 'object' && nested && 'message' in nested
        ? String((nested as { message: string }).message)
        : JSON.stringify(err)
    const code =
      typeof nested === 'object' && nested && 'code' in nested
        ? String((nested as { code: string }).code)
        : undefined
    throw Object.assign(new Error(message), { code })
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json()
  }
  return res as unknown as T
}

export async function loadProject(file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  return request<Session>('/sessions/load-project', { method: 'POST', body: form })
}

export async function importCurves(id: string, file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  return request<Session>(`/sessions/${id}/import-curves`, { method: 'POST', body: form })
}

export async function uploadSession(file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  return request<Session>('/sessions', { method: 'POST', body: form })
}

export async function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`)
}

export async function getLastSession(): Promise<Session> {
  return request<Session>('/sessions/last')
}

export async function waitForBackend(maxAttempts = 20, delayMs = 300): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch('/health')
      if (res.ok) return true
    } catch {
      /* backend not ready */
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

export async function applyUnskew(
  id: string,
  body:
    | { mode: 'perspective'; calibration?: Calibration }
    | { mode: 'mesh'; mesh: { sections?: number; vertices: unknown[] }; calibration?: Calibration } = {
    mode: 'perspective',
  },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/unskew/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function setCalibration(id: string, calibration: Calibration): Promise<Session> {
  return request<Session>(`/sessions/${id}/calibration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calibration, manual_calibration: true }),
  })
}

export async function patchSessionPreferences(
  id: string,
  body: {
    calibration?: Calibration
    calibrations?: Calibration[]
    manual_calibration?: boolean
    workspace?: WorkspaceState | null
    figure?: FigureMeta
  },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function cvImproveCurve(id: string, curveId: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/cv-improve`, { method: 'POST' })
}

export async function resampleSession(
  id: string,
  curveId: string,
  targetCount: number,
): Promise<Session> {
  return request<Session>(`/sessions/${id}/resample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curve_id: curveId, target_count: targetCount }),
  })
}

export async function patchCurves(
  id: string,
  body: {
    curves?: Curve[]
    add_point?: [number, number]
    add_to_curve_id?: string
    point_patches?: {
      point_id: string
      pixel?: [number, number]
      curve_id?: string
      delete?: boolean
      origin?: 'user'
    }[]
  },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function undoSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/undo`, { method: 'POST' })
}

export async function redoSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/redo`, { method: 'POST' })
}

const EXPORT_DEFAULT_NAMES = {
  csv: 'plot_digitizer.csv',
  json: 'plot_digitizer.pdproj.json',
} as const

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"(.*)"$/, '$1'))
    } catch {
      return star[1].trim()
    }
  }
  const quoted = /filename\s*=\s*"((?:\\.|[^"])*)"/i.exec(header)
  if (quoted?.[1]) return quoted[1].replace(/\\"/g, '"')
  const unquoted = /filename\s*=\s*([^;]+)/i.exec(header)
  return unquoted?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null
}

async function readExportError(res: Response): Promise<string> {
  let message = res.statusText
  try {
    const body = await res.json()
    const err = body?.error ?? body?.detail
    if (typeof err === 'object' && err && 'message' in err) {
      message = String((err as { message: string }).message)
    }
  } catch {
    /* ignore */
  }
  return message
}

async function fetchExportBlob(
  sessionId: string,
  format: 'csv' | 'json',
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/sessions/${sessionId}/export?format=${format}&_=${Date.now()}`)
  if (!res.ok) throw new Error(await readExportError(res))
  return {
    blob: await res.blob(),
    filename:
      parseContentDispositionFilename(res.headers.get('content-disposition')) ??
      EXPORT_DEFAULT_NAMES[format],
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function saveCsvSidecarPng(
  sessionId: string,
  csvFilename: string,
  csvHandle?: FileSystemFileHandle,
): Promise<void> {
  let blob: Blob
  try {
    const res = await fetch(`/sessions/${sessionId}/image`)
    if (!res.ok) throw new Error(await readExportError(res))
    blob = await res.blob()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error('CSV saved, but the PNG sidecar failed: ' + message)
  }

  const pngName = sidecarPngFilename(csvFilename)
  const getParent = (
    csvHandle as FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> } | undefined
  )?.getParent
  if (typeof getParent === 'function') {
    try {
      const parent = await getParent.call(csvHandle)
      const pngHandle = await parent.getFileHandle(pngName, { create: true })
      const writable = await pngHandle.createWritable()
      try {
        await writable.write(blob)
        await writable.close()
        return
      } catch (err) {
        try {
          await writable.abort()
        } catch {
          /* already closed */
        }
        throw err
      }
    } catch {
      // Directory write unavailable; fall back to a blob download.
    }
  }
  downloadBlob(blob, pngName)
}

export async function triggerSessionExport(
  sessionId: string,
  format: 'csv' | 'json',
): Promise<void> {
  const savePicker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description?: string; accept: Record<string, string[]> }>
      }) => Promise<FileSystemFileHandle>
    }
  ).showSaveFilePicker

  let prepared: { blob: Blob; filename: string } | undefined
  let pickerHandle: FileSystemFileHandle | undefined
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: EXPORT_DEFAULT_NAMES[format],
        types:
          format === 'csv'
            ? [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }]
            : [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      const requestPermission = (
        handle as FileSystemFileHandle & {
          requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
        }
      ).requestPermission
      if (typeof requestPermission === 'function') {
        const perm = await requestPermission.call(handle, { mode: 'readwrite' })
        if (perm === 'denied') {
          throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
        }
      }
      const writable = await handle.createWritable()
      try {
        prepared = await fetchExportBlob(sessionId, format)
        await writable.write(prepared.blob)
        await writable.close()
        pickerHandle = handle
      } catch (err) {
        try {
          await writable.abort()
        } catch {
          /* already closed */
        }
        throw err
      }
    } catch (err) {
      if (isAbortError(err)) return
    }
  }

  if (pickerHandle && prepared) {
    if (format === 'csv') {
      await saveCsvSidecarPng(
        sessionId,
        pickerHandle.name || prepared.filename,
        pickerHandle,
      )
    }
    return
  }

  prepared ??= await fetchExportBlob(sessionId, format)
  downloadBlob(prepared.blob, prepared.filename)
  if (format === 'csv') {
    await saveCsvSidecarPng(sessionId, prepared.filename)
  }
}

export async function suggestFilter(
  id: string,
  pixel: [number, number],
  curveId?: string,
): Promise<ColorFilter> {
  return request<ColorFilter>(`/sessions/${id}/filter/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pixel, curve_id: curveId ?? null }),
  })
}

export async function patchCurveFilter(
  id: string,
  curveId: string,
  filter: ColorFilter,
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/filter`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter),
  })
}

export async function detectGrid(id: string, curveId?: string): Promise<GridGeometrySettings | null> {
  return request<GridGeometrySettings | null>(`/sessions/${id}/grid/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curve_id: curveId ?? null }),
  })
}

export async function snapPixels(
  id: string,
  curveId: string,
  pixels: [number, number][],
): Promise<[number, number][]> {
  const body = await request<{ pixels: [number, number][] }>(`/sessions/${id}/snap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curve_id: curveId, pixels }),
  })
  return body.pixels
}

export function sessionMaskUrl(
  sessionId: string,
  curveId: string,
  rev: number,
  stamp?: string | number,
): string {
  return maskPreviewUrl(sessionId, curveId, rev, stamp)
}

export async function listCurveSegments(
  id: string,
  curveId: string,
): Promise<{ segments: SegmentPublic[] }> {
  return request<{ segments: SegmentPublic[] }>(
    `/sessions/${id}/curves/${curveId}/segments`,
    { method: 'POST' },
  )
}

export async function fillCurveSegment(
  id: string,
  curveId: string,
  body: {
    pixel: [number, number]
    separation?: number
    fill_corners?: boolean
  },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/segment-fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function runAveragingWindow(
  id: string,
  curveId: string,
  body: { dx?: number; dy?: number; replace?: boolean } = {},
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/averaging-window`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function sampleXStep(
  id: string,
  curveId: string,
  body: { xmin: number; xmax: number; delx: number; replace?: boolean },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/x-step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function patchCurveRegion(
  id: string,
  curveId: string,
  region: RegionMask,
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/region`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(region),
  })
}

export async function pointMatch(
  id: string,
  curveId: string,
  body: { pixel: [number, number]; sample_radius?: number; max_point_size?: number },
): Promise<{ candidates: MatchCandidate[] }> {
  return request<{ candidates: MatchCandidate[] }>(
    `/sessions/${id}/curves/${curveId}/point-match`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export async function pointMatchAccept(
  id: string,
  curveId: string,
  pixels: [number, number][],
): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/point-match/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pixels }),
  })
}

export async function removeCurveFromPlot(id: string, curveId: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/curves/${curveId}/remove-from-plot`, {
    method: 'POST',
  })
}
