export type FilterMode = 'intensity' | 'foreground' | 'hue' | 'saturation' | 'value'

export interface ColorFilter {
  mode: FilterMode
  low: number
  high: number
  sample_color?: string | null
  remove_grid?: boolean
}

export function displayMax(mode: FilterMode): number {
  return mode === 'hue' ? 360 : 100
}

export function normToDisplay(mode: FilterMode, norm: number): number {
  return norm * displayMax(mode)
}

export function displayToNorm(mode: FilterMode, display: number): number {
  const max = displayMax(mode)
  if (max === 0) return 0
  return display / max
}

export function maskPreviewUrl(sessionId: string, curveId: string, rev: number): string {
  return `/sessions/${sessionId}/mask?curve_id=${encodeURIComponent(curveId)}&rev=${rev}`
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return [r, g, b]
}

export function previewFilterFromHex(hex: string): Pick<ColorFilter, 'mode' | 'sample_color'> {
  const rgb = hexToRgb(hex)
  if (!rgb) return { mode: 'intensity', sample_color: hex }
  const [r, g, b] = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  return { mode: sat >= 0.25 ? 'hue' : 'intensity', sample_color: hex }
}
