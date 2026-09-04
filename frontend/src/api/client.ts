import type {
  Calibration,
  ColorFilter,
  Curve,
  GridGeometrySettings,
  SegmentPublic,
  Session,
  WorkspaceState,
} from '../types'
import { maskPreviewUrl } from '../lib/colorFilter'

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
    manual_calibration?: boolean
    workspace?: WorkspaceState | null
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

export const EXPORT_FRAME_NAME = 'plot-digitizer-export'

const EXPORT_DEFAULT_NAMES = {
  csv: 'plot_digitizer.csv',
  json: 'plot_digitizer.pdproj.json',
} as const

async function exportUrl(sessionId: string, format: 'csv' | 'json'): Promise<string> {
  return `/sessions/${sessionId}/export?format=${format}&_=${Date.now()}`
}

async function readExportError(res: Response): Promise<string> {
  let message = res.statusText
  try {
    const body = await res.json()
    const err = body?.error ?? body?.detail
    if (typeof err === 'object' && err && 'message' in err) {
      message = String(err.message)
    }
  } catch {
    /* ignore */
  }
  return message
}

function submitExportForm(sessionId: string, format: 'csv' | 'json'): void {
  const form = document.createElement('form')
  form.method = 'GET'
  form.action = `/sessions/${sessionId}/export`
  form.target = EXPORT_FRAME_NAME
  form.style.display = 'none'

  for (const [name, value] of [
    ['format', format],
    ['_', String(Date.now())],
  ] as const) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
  form.remove()
}

export async function triggerSessionExport(
  sessionId: string,
  format: 'csv' | 'json',
): Promise<void> {
  const url = await exportUrl(sessionId, format)

  const savePicker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description?: string; accept: Record<string, string[]> }>
      }) => Promise<FileSystemFileHandle>
    }
  ).showSaveFilePicker

  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: EXPORT_DEFAULT_NAMES[format],
        types:
          format === 'csv'
            ? [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }]
            : [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      const res = await fetch(url)
      if (!res.ok) throw new Error(await readExportError(res))
      const writable = await handle.createWritable()
      await writable.write(await res.blob())
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  submitExportForm(sessionId, format)
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
