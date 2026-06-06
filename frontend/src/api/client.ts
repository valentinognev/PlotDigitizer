import type {
  ApiErrorBody,
  Calibration,
  Curve,
  Session,
  SettingsPublic,
  ProviderName,
  BBox,
} from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let body: ApiErrorBody | { detail: unknown } = { error: { code: 'unknown', message: res.statusText, hint: '' } }
    try {
      body = await res.json()
    } catch {
      /* ignore */
    }
    const err = 'error' in body ? body.error : body.detail
    const message =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message: string }).message)
        : JSON.stringify(err)
    throw new Error(message)
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json()
  }
  return res as unknown as T
}

export async function uploadSession(file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  return request<Session>('/sessions', { method: 'POST', body: form })
}

export async function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`)
}

export async function detectSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}/detect`, { method: 'POST' })
}

export async function setCalibration(id: string, calibration: Calibration): Promise<Session> {
  return request<Session>(`/sessions/${id}/calibration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calibration }),
  })
}

export async function refineSession(
  id: string,
  body: { region?: BBox; instruction?: string; curve_id?: string; redetect_curve?: boolean },
): Promise<Session> {
  return request<Session>(`/sessions/${id}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

export async function getSettings(): Promise<SettingsPublic> {
  return request<SettingsPublic>('/settings')
}

export async function updateSettings(body: {
  active_provider?: ProviderName
  provider?: ProviderName
  api_key?: string
}): Promise<SettingsPublic> {
  return request<SettingsPublic>('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function clearProviderKey(provider: ProviderName): Promise<SettingsPublic> {
  return request<SettingsPublic>(`/settings/key/${provider}`, { method: 'DELETE' })
}

export function exportUrl(sessionId: string, format: 'csv' | 'json'): string {
  return `/sessions/${sessionId}/export?format=${format}`
}
