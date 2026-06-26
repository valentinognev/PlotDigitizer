/** φ⁻¹ — steps around the hue wheel so each index is far from recent ones. */
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

export function paletteHue(index: number): number {
  return (index * GOLDEN_RATIO_CONJUGATE) % 1
}

export function paletteColor(index: number): string {
  const hue = paletteHue(index) * 360
  const s = 80 + (index % 3) * 5
  const l = 52 + (Math.floor(index / 3) % 2) * 8
  return hslToHex(hue, s, l)
}

/** @deprecated Use paletteColor(index). Kept for callers passing (index, total). */
export function rainbowColor(index: number, _total?: number): string {
  return paletteColor(index)
}

export function rainbowColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => paletteColor(i))
}

export function isGrayscaleHex(color: string): boolean {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) < 30
}

export function curvesLookGrayscale(curves: { color: string }[]): boolean {
  return curves.length >= 2 && curves.every((c) => isGrayscaleHex(c.color))
}

function hexToHue(color: string): number {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h / 6) % 1 + 1) % 1
}

function circularHueDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

function huesTooClustered(colors: string[]): boolean {
  if (colors.length < 3) return false
  const hues = colors.map(hexToHue)
  let minDist = 1
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      minDist = Math.min(minDist, circularHueDistance(hues[i], hues[j]))
    }
  }
  return minDist < 1 / 14
}

export function curvesNeedDistinctColors(curves: { color: string }[]): boolean {
  if (curves.length < 2) return false
  if (curvesLookGrayscale(curves)) return true
  const seen = new Set<string>()
  for (const c of curves) {
    const key = c.color.toLowerCase()
    if (seen.has(key)) return true
    seen.add(key)
  }
  const optimal = rainbowColors(curves.length)
  const onPalette = curves.every(
    (c, i) => c.color.toLowerCase() === optimal[i].toLowerCase(),
  )
  if (!onPalette) return huesTooClustered(curves.map((c) => c.color))
  return false
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lit = l / 100
  const c = (1 - Math.abs(2 * lit - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lit - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
